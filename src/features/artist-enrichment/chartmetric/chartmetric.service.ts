// Issue #142: orchestrates one Chartmetric enrichArtist() call — feature
// flag resolution, budget checks, caching, artist matching, metric fetch and
// normalization, and structured logging. This is the only entry point the
// rest of the pipeline should use; every other module in this feature is an
// implementation detail behind it.
//
// Safety guarantees (section 6/7 of the issue) this file is responsible for:
//  - enrichArtist() never throws and never leaves an unhandled rejection —
//    every internal failure is caught and mapped to a normalized status;
//  - a hard overall timeout guarantees the call always settles even if an
//    internal step misbehaves, on top of each HTTP request's own timeout;
//  - no raw Chartmetric response, credential or exception detail is ever
//    included in the returned ArtistEnrichmentResult.
import { debugLog, warnLog } from "../../../utils/logger.js";
import {
  buildIdentityCacheKey,
  defaultChartmetricHistoryCache,
  defaultChartmetricIdentityCache,
  defaultChartmetricMetricsCache,
  type ChartmetricHistoryCache,
  type ChartmetricIdentityCache,
  type ChartmetricIdentityMatch,
  type ChartmetricMetricsCache
} from "./chartmetric.cache.js";
import { ChartmetricApiError, ChartmetricClient, type ChartmetricClientEnv } from "./chartmetric.client.js";
import {
  resolveChartmetricFeatureFlag,
  type ChartmetricFeatureFlagEnv
} from "./chartmetric.feature-flag.js";
import { mapToAudienceMetrics, mapToHistoryPoints, hasUsableMetrics } from "./chartmetric.mapper.js";
import { matchChartmetricArtist } from "./chartmetric.matcher.js";
import {
  ChartmetricAnalysisCallBudget,
  defaultChartmetricCreditBudget,
  type ChartmetricCreditBudget,
  type ChartmetricUsageGuardEnv
} from "./chartmetric.usage-guard.js";
import type {
  ArtistEnrichmentInput,
  ArtistEnrichmentProvider,
  ArtistEnrichmentResult,
  ChartmetricSkipReason
} from "./chartmetric.types.js";

type FetchLike = typeof fetch;
type ChartmetricServiceEnv = ChartmetricFeatureFlagEnv & ChartmetricClientEnv & ChartmetricUsageGuardEnv;

export interface ChartmetricServiceOptions {
  env?: ChartmetricServiceEnv;
  fetchImpl?: FetchLike;
  client?: ChartmetricClient;
  identityCache?: ChartmetricIdentityCache;
  metricsCache?: ChartmetricMetricsCache;
  historyCache?: ChartmetricHistoryCache;
  creditBudget?: ChartmetricCreditBudget;
  callBudget?: ChartmetricAnalysisCallBudget;
  // Value sent by the client in this request's
  // `features.chartmetricArtistEnrichment` field. Bound at construction so
  // the public enrichArtist(input) shape matches the issue's
  // ArtistEnrichmentProvider interface exactly (issue #142 section 4).
  requestToggleEnabled?: boolean;
  // Hard ceiling on the whole enrichArtist() call, independent of the
  // per-request HTTP timeout, so a misbehaving internal step can never
  // block the pipeline indefinitely. Defaults to 4x the HTTP timeout.
  overallTimeoutMs?: number;
}

const ESTIMATED_CREDITS_PER_ENDPOINT = {
  identity: 1,
  stats: 1,
  history: 1
} as const;

const RECENT_HISTORY_DAYS = 30;

export class ChartmetricArtistEnrichmentProvider implements ArtistEnrichmentProvider {
  private readonly env: ChartmetricServiceEnv;
  private readonly fetchImpl: FetchLike;
  private readonly client: ChartmetricClient;
  private readonly identityCache: ChartmetricIdentityCache;
  private readonly metricsCache: ChartmetricMetricsCache;
  private readonly historyCache: ChartmetricHistoryCache;
  private readonly creditBudget: ChartmetricCreditBudget;
  private readonly callBudget: ChartmetricAnalysisCallBudget;
  private readonly requestToggleEnabled?: boolean;
  private readonly overallTimeoutMs: number;

  constructor(options: ChartmetricServiceOptions = {}) {
    this.env = options.env ?? (process.env as ChartmetricServiceEnv);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.client = options.client ?? new ChartmetricClient({ env: this.env, fetchImpl: this.fetchImpl });
    this.identityCache = options.identityCache ?? defaultChartmetricIdentityCache;
    this.metricsCache = options.metricsCache ?? defaultChartmetricMetricsCache;
    this.historyCache = options.historyCache ?? defaultChartmetricHistoryCache;
    this.creditBudget = options.creditBudget ?? defaultChartmetricCreditBudget;
    this.callBudget = options.callBudget ?? ChartmetricAnalysisCallBudget.fromEnv(this.env);
    this.requestToggleEnabled = options.requestToggleEnabled;
    const httpTimeoutMs = Number.parseInt(this.env.CHARTMETRIC_REQUEST_TIMEOUT_MS ?? "", 10) || 8_000;
    this.overallTimeoutMs = options.overallTimeoutMs ?? httpTimeoutMs * 4;
  }

  async enrichArtist(input: ArtistEnrichmentInput): Promise<ArtistEnrichmentResult> {
    const start = Date.now();
    try {
      const result = await Promise.race([this.enrichArtistInternal(input), this.overallTimeoutGuard()]);
      debugLog("chartmetric", "enrichArtist completed", {
        artistName: input.artistName,
        status: result.status,
        matchMethod: result.matchMethod,
        matchConfidence: result.matchConfidence,
        durationMs: Date.now() - start
      });
      return result;
    } catch (error) {
      // enrichArtist() must never throw or leave an unhandled rejection —
      // this is the last line of defense on top of enrichArtistInternal's
      // own try/catch.
      warnLog("chartmetric", "enrichArtist failed unexpectedly", {
        message: error instanceof Error ? error.message : String(error)
      });
      return { provider: "chartmetric", status: "error", reason: "unexpected_error" };
    }
  }

  private overallTimeoutGuard(): Promise<ArtistEnrichmentResult> {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ provider: "chartmetric", status: "timeout" }), this.overallTimeoutMs);
    });
  }

  private async enrichArtistInternal(input: ArtistEnrichmentInput): Promise<ArtistEnrichmentResult> {
    const flag = await resolveChartmetricFeatureFlag({
      env: this.env,
      requestToggleEnabled: this.requestToggleEnabled,
      fetchImpl: this.fetchImpl
    });

    debugLog("chartmetric", "effective feature state", {
      effectiveEnabled: flag.effectiveEnabled,
      environment: flag.environment,
      remoteFlagAvailable: flag.remoteFlagAvailable
    });

    if (!flag.effectiveEnabled) {
      return { provider: "chartmetric", status: "skipped", reason: flag.reason ?? "feature_disabled" };
    }

    const callCheck = this.callBudget.tryConsume();
    if (!callCheck.allowed) {
      return this.budgetLimited(callCheck.reason);
    }

    const creditCheck = this.creditBudget.canSpend();
    if (!creditCheck.allowed) {
      return this.budgetLimited(creditCheck.reason);
    }

    return this.matchAndFetch(input);
  }

  private budgetLimited(reason: ChartmetricSkipReason | undefined): ArtistEnrichmentResult {
    warnLog("chartmetric", "usage budget reached, skipping call", { reason });
    return { provider: "chartmetric", status: "budget_limited", reason: reason ?? "max_calls_per_analysis_reached" };
  }

  private async matchAndFetch(input: ArtistEnrichmentInput): Promise<ArtistEnrichmentResult> {
    const identityCacheKey = buildIdentityCacheKey(input);
    const cacheHit = this.identityCache.has(identityCacheKey);

    let entry;
    try {
      entry = await this.identityCache.getOrCreate(identityCacheKey, async () => {
        const matchOutcome = await matchChartmetricArtist(input, this.client);
        if (matchOutcome.status === "matched") {
          return {
            matched: true as const,
            chartmetricArtistId: matchOutcome.chartmetricArtistId!,
            matchMethod: matchOutcome.matchMethod!,
            matchConfidence: matchOutcome.matchConfidence!
          };
        }
        return { matched: false as const, status: matchOutcome.status };
      });
    } catch (error) {
      return this.mapClientError(error, "match");
    } finally {
      this.creditBudget.record(ESTIMATED_CREDITS_PER_ENDPOINT.identity);
    }

    debugLog("chartmetric", "artist matching", {
      artistName: input.artistName,
      cacheHit,
      matchStatus: entry.matched ? "matched" : entry.status,
      matchMethod: entry.matched ? entry.matchMethod : undefined
    });

    if (!entry.matched) {
      if (entry.status === "ambiguous") {
        return { provider: "chartmetric", status: "ambiguous", reason: "ambiguous_candidates" };
      }
      if (entry.status === "low_confidence") {
        return { provider: "chartmetric", status: "ambiguous", reason: "low_confidence_match" };
      }
      return { provider: "chartmetric", status: "not_found" };
    }

    // Only exact/high confidence matches ever reach here — a cache entry is
    // only `matched: true` when matchChartmetricArtist() itself returned
    // "matched", which only happens for exact/high confidence (section 1's
    // "only merge on exact/high confidence" is enforced structurally).
    const identity: ChartmetricIdentityMatch = {
      chartmetricArtistId: entry.chartmetricArtistId,
      matchMethod: entry.matchMethod,
      matchConfidence: entry.matchConfidence
    };
    return this.fetchMetrics(input, identity);
  }

  private async fetchMetrics(input: ArtistEnrichmentInput, identity: ChartmetricIdentityMatch): Promise<ArtistEnrichmentResult> {
    let metricsCacheHit = true;
    let retryCount = 0;
    let reportedCredits: number | undefined;

    let metrics;
    try {
      const cached = this.metricsCache.get(identity.chartmetricArtistId);
      if (cached !== undefined) {
        metrics = cached;
      } else {
        metricsCacheHit = false;
        metrics = await this.metricsCache.getOrCreate(identity.chartmetricArtistId, async () => {
          const outcome = await this.client.getArtistStats(identity.chartmetricArtistId);
          retryCount = outcome.retryCount;
          reportedCredits = outcome.reportedCredits;
          return mapToAudienceMetrics(identity.chartmetricArtistId, input.spotifyArtistId ?? null, outcome.data, identity.matchConfidence);
        });
      }
    } catch (error) {
      return this.mapClientError(error, "stats");
    } finally {
      this.creditBudget.record(reportedCredits ?? ESTIMATED_CREDITS_PER_ENDPOINT.stats);
    }

    debugLog("chartmetric", "endpoint call", {
      endpoint: "artist/stat/spotify",
      cacheHit: metricsCacheHit,
      retryCount,
      creditsConsumed: reportedCredits ?? ESTIMATED_CREDITS_PER_ENDPOINT.stats,
      creditsEstimated: reportedCredits === undefined
    });

    if (!metrics) {
      return { provider: "chartmetric", status: "error", reason: "malformed_response" };
    }

    const baseResult: ArtistEnrichmentResult = {
      provider: "chartmetric",
      status: hasUsableMetrics(metrics) ? "success" : "partial",
      matchMethod: identity.matchMethod,
      matchConfidence: identity.matchConfidence,
      metrics,
      creditsConsumed: reportedCredits ?? ESTIMATED_CREDITS_PER_ENDPOINT.stats,
      creditsEstimated: reportedCredits === undefined
    };

    if (!input.includeRecentHistory) {
      return baseResult;
    }

    return this.attachRecentHistory(input, identity, baseResult);
  }

  private async attachRecentHistory(
    input: ArtistEnrichmentInput,
    identity: ChartmetricIdentityMatch,
    baseResult: ArtistEnrichmentResult
  ): Promise<ArtistEnrichmentResult> {
    const historyCacheKey = `${identity.chartmetricArtistId}:${RECENT_HISTORY_DAYS}d`;
    try {
      const cached = this.historyCache.get(historyCacheKey);
      const history =
        cached !== undefined
          ? cached
          : await this.historyCache.getOrCreate(historyCacheKey, async () => {
              const outcome = await this.client.getArtistStats(identity.chartmetricArtistId, { sinceDays: RECENT_HISTORY_DAYS });
              this.creditBudget.record(outcome.reportedCredits ?? ESTIMATED_CREDITS_PER_ENDPOINT.history);
              return mapToHistoryPoints(outcome.data, RECENT_HISTORY_DAYS);
            });

      return { ...baseResult, recentHistory: history ?? [] };
    } catch (error) {
      // History is a best-effort addition explicitly requested by the
      // caller; its failure must not downgrade an already-successful
      // snapshot below "partial" (issue #142 section 6).
      warnLog("chartmetric", "recent history fetch failed, keeping snapshot result", {
        message: error instanceof Error ? error.message : String(error)
      });
      return { ...baseResult, status: baseResult.status === "success" ? "partial" : baseResult.status };
    }
  }

  private mapClientError(error: unknown, stage: "match" | "stats"): ArtistEnrichmentResult {
    if (error instanceof ChartmetricApiError) {
      warnLog("chartmetric", "Chartmetric request failed", { stage, kind: error.kind });
      switch (error.kind) {
        case "timeout":
          return { provider: "chartmetric", status: "timeout" };
        case "rate_limited":
          return { provider: "chartmetric", status: "rate_limited" };
        case "auth":
          return { provider: "chartmetric", status: "error", reason: "authentication_error" };
        case "not_found":
          // At the "match" stage a 404 means the artist itself wasn't
          // found. At the "stats" stage the artist was already matched —
          // Chartmetric just has no stats endpoint response for it, which
          // is an unavailable-metric case, not a missing artist.
          return stage === "match"
            ? { provider: "chartmetric", status: "not_found" }
            : { provider: "chartmetric", status: "partial" };
        case "malformed":
          return { provider: "chartmetric", status: "error", reason: "malformed_response" };
        default:
          return { provider: "chartmetric", status: "error", reason: "unexpected_error" };
      }
    }
    warnLog("chartmetric", "unclassified error", { stage, message: error instanceof Error ? error.message : String(error) });
    return { provider: "chartmetric", status: "error", reason: "unexpected_error" };
  }
}
