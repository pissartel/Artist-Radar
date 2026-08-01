// Issue #201: Chartmetric enrichment for already-discovered similar-artist
// candidates. A deliberate companion to (not a replacement for) the phase-1
// main-artist provider in chartmetric.service.ts — it reuses that file's
// matching, caching and feature-flag building blocks, but is its own class
// because its unit of work (a bounded, budgeted batch of candidates) and its
// cost controls (a distinct per-analysis call cap, a configurable top-N
// selection) are shaped differently from a single enrichArtist() call, and
// keeping them separate means issue #142's existing behavior/tests are
// untouched.
//
// Safety guarantees mirrored from chartmetric.service.ts:
//  - enrichCandidates() never throws — every candidate's own failure is
//    caught and mapped to a normalized SimilarArtistCandidateEnrichmentResult,
//    so one bad candidate can never take down the batch or the pipeline;
//  - a per-candidate hard timeout guarantees each call always settles;
//  - only exact/high confidence matches are ever merged (matchChartmetricArtist
//    already enforces this structurally — see chartmetric.matcher.ts);
//  - a metric Chartmetric doesn't report stays undefined, never 0.
import { debugLog, warnLog } from "../../../utils/logger.js";
import {
  buildIdentityCacheKey,
  defaultChartmetricCandidateMetricsCache,
  defaultChartmetricIdentityCache,
  defaultChartmetricMetricsCache,
  type ChartmetricCandidateDetailCacheEntry,
  type ChartmetricCandidateMetricsCache,
  type ChartmetricIdentityCache,
  type ChartmetricIdentityMatch,
  type ChartmetricMetricsCache
} from "./chartmetric.cache.js";
import {
  ChartmetricApiError,
  ChartmetricClient,
  type ChartmetricClientEnv,
  type ChartmetricSimilarArtistRaw
} from "./chartmetric.client.js";
import { resolveChartmetricFeatureFlag, type ChartmetricFeatureFlagEnv } from "./chartmetric.feature-flag.js";
import { calculateGrowthPercent, mapToAudienceMetrics, mapToCandidateMetrics, hasUsableMetrics } from "./chartmetric.mapper.js";
import { matchChartmetricArtist } from "./chartmetric.matcher.js";
import {
  ChartmetricAnalysisCallBudget,
  type ChartmetricCreditBudget,
  defaultChartmetricCreditBudget,
  type ChartmetricUsageGuardEnv
} from "./chartmetric.usage-guard.js";
import type { ArtistEnrichmentInput, ChartmetricSkipReason, SimilarArtistCandidateEnrichmentResult } from "./chartmetric.types.js";

type FetchLike = typeof fetch;
type ChartmetricSimilarArtistEnrichmentEnv = ChartmetricFeatureFlagEnv &
  ChartmetricClientEnv &
  ChartmetricUsageGuardEnv & {
    CHARTMETRIC_SIMILAR_ARTIST_ENRICHMENT_LIMIT?: string;
    CHARTMETRIC_SIMILAR_ARTIST_MAX_CALLS_PER_ANALYSIS?: string;
  };

export interface SimilarArtistCandidateInput extends ArtistEnrichmentInput {
  // Existing (non-Chartmetric) relevance ranking already computed upstream
  // (e.g. totalRelevance), used only to pick which candidates fall inside
  // the enriched top-N — higher enriches first.
  priority: number;
}

export interface EnrichSimilarArtistCandidatesInput {
  // The main analyzed artist's own Chartmetric ID, when already known from
  // the phase-1 main-artist enrichment result — reused (never re-resolved)
  // both to save a credit and to compute neighbouring-artist scores.
  mainArtistChartmetricId?: string | null;
  candidates: SimilarArtistCandidateInput[];
}

export interface ChartmetricSimilarArtistEnrichmentOptions {
  env?: ChartmetricSimilarArtistEnrichmentEnv;
  fetchImpl?: FetchLike;
  client?: ChartmetricClient;
  identityCache?: ChartmetricIdentityCache;
  metricsCache?: ChartmetricMetricsCache;
  candidateMetricsCache?: ChartmetricCandidateMetricsCache;
  creditBudget?: ChartmetricCreditBudget;
  // Fresh per analysis run by default, deliberately independent of the
  // phase-1 main-artist call budget so this feature's cost controls can be
  // tuned without touching issue #142's existing default of 1.
  callBudget?: ChartmetricAnalysisCallBudget;
  requestToggleEnabled?: boolean;
  candidateLimit?: number;
  overallTimeoutMs?: number;
}

const DEFAULT_CANDIDATE_LIMIT = 10;
const GROWTH_WINDOW_DAYS = 28;
// Small concurrency window rather than fully sequential or fully parallel
// calls: some throughput without hammering Chartmetric's rate limits (the
// client already treats 429s as non-retryable, so this is the batch-level
// mitigation — "use batching when supported" per the issue's cost controls).
const CONCURRENCY = 3;

const ESTIMATED_CREDITS_PER_ENDPOINT = {
  identity: 1,
  stats: 1,
  scoreAndSocial: 1,
  playlistReach: 1,
  growthHistory: 1,
  similarArtists: 1
} as const;

export class ChartmetricSimilarArtistEnrichmentService {
  private readonly env: ChartmetricSimilarArtistEnrichmentEnv;
  private readonly fetchImpl: FetchLike;
  private readonly client: ChartmetricClient;
  private readonly identityCache: ChartmetricIdentityCache;
  private readonly metricsCache: ChartmetricMetricsCache;
  private readonly candidateMetricsCache: ChartmetricCandidateMetricsCache;
  private readonly creditBudget: ChartmetricCreditBudget;
  private readonly callBudget: ChartmetricAnalysisCallBudget;
  private readonly requestToggleEnabled?: boolean;
  private readonly candidateLimit: number;
  private readonly overallTimeoutMs: number;
  // Memoized per service instance (i.e. per analysis run) so the main
  // artist's neighbouring-artists list is fetched at most once no matter how
  // many candidates need to check it, instead of once per candidate.
  private mainArtistSimilarArtistsPromise: Promise<ChartmetricSimilarArtistRaw[]> | null = null;

  constructor(options: ChartmetricSimilarArtistEnrichmentOptions = {}) {
    this.env = options.env ?? (process.env as ChartmetricSimilarArtistEnrichmentEnv);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.client = options.client ?? new ChartmetricClient({ env: this.env, fetchImpl: this.fetchImpl });
    this.identityCache = options.identityCache ?? defaultChartmetricIdentityCache;
    this.metricsCache = options.metricsCache ?? defaultChartmetricMetricsCache;
    this.candidateMetricsCache = options.candidateMetricsCache ?? defaultChartmetricCandidateMetricsCache;
    this.creditBudget = options.creditBudget ?? defaultChartmetricCreditBudget;
    this.callBudget =
      options.callBudget ??
      new ChartmetricAnalysisCallBudget(
        parseLimit(this.env.CHARTMETRIC_SIMILAR_ARTIST_MAX_CALLS_PER_ANALYSIS, DEFAULT_CANDIDATE_LIMIT)
      );
    this.requestToggleEnabled = options.requestToggleEnabled;
    this.candidateLimit =
      options.candidateLimit ?? parseLimit(this.env.CHARTMETRIC_SIMILAR_ARTIST_ENRICHMENT_LIMIT, DEFAULT_CANDIDATE_LIMIT);
    const httpTimeoutMs = Number.parseInt(this.env.CHARTMETRIC_REQUEST_TIMEOUT_MS ?? "", 10) || 8_000;
    this.overallTimeoutMs = options.overallTimeoutMs ?? httpTimeoutMs * 4;
  }

  // Always returns exactly one result per input candidate, in input order,
  // so callers can zip the output back onto their own candidate list by
  // index. Candidates outside the configurable top-N (by `priority`) get a
  // "skipped"/"not_selected_for_enrichment" result rather than being
  // omitted, so downstream ranking can still tell "not enriched" apart from
  // "enriched but no data".
  async enrichCandidates(input: EnrichSimilarArtistCandidatesInput): Promise<SimilarArtistCandidateEnrichmentResult[]> {
    const { candidates } = input;
    if (candidates.length === 0) {
      return [];
    }

    const flag = await resolveChartmetricFeatureFlag({
      env: this.env,
      requestToggleEnabled: this.requestToggleEnabled,
      fetchImpl: this.fetchImpl
    });

    debugLog("chartmetric", "similar-artist candidate batch feature state", {
      effectiveEnabled: flag.effectiveEnabled,
      candidateCount: candidates.length,
      candidateLimit: this.candidateLimit
    });

    if (!flag.effectiveEnabled) {
      const reason = flag.reason ?? "feature_disabled";
      return candidates.map((candidate) => this.skippedResult(candidate.artistName, reason));
    }

    const selectedNames = new Set(this.selectTopCandidates(candidates).map((candidate) => candidate.artistName));
    // Dedup guard: candidates already deduped upstream by the discovery
    // pipeline share a name at most once in practice, but this makes "never
    // enrich the same artist twice in one run" an explicit invariant rather
    // than an incidental one, on top of TtlCache.getOrCreate's own
    // same-key/in-flight de-duplication.
    const processedNames = new Set<string>();
    const results = new Map<string, SimilarArtistCandidateEnrichmentResult>();
    const selectedCandidates = candidates.filter((candidate) => {
      if (!selectedNames.has(candidate.artistName) || processedNames.has(candidate.artistName)) {
        return false;
      }
      processedNames.add(candidate.artistName);
      return true;
    });

    for (let start = 0; start < selectedCandidates.length; start += CONCURRENCY) {
      const batch = selectedCandidates.slice(start, start + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((candidate) => this.enrichOneCandidateSafely(candidate, input.mainArtistChartmetricId ?? null))
      );
      batch.forEach((candidate, index) => results.set(candidate.artistName, batchResults[index]!));
    }

    return candidates.map(
      (candidate) => results.get(candidate.artistName) ?? this.skippedResult(candidate.artistName, "not_selected_for_enrichment")
    );
  }

  private selectTopCandidates(candidates: SimilarArtistCandidateInput[]): SimilarArtistCandidateInput[] {
    return [...candidates].sort((a, b) => b.priority - a.priority).slice(0, this.candidateLimit);
  }

  private skippedResult(candidateName: string, reason: ChartmetricSkipReason): SimilarArtistCandidateEnrichmentResult {
    return { provider: "chartmetric", candidateName, status: "skipped", reason };
  }

  private async enrichOneCandidateSafely(
    candidate: SimilarArtistCandidateInput,
    mainArtistChartmetricId: string | null
  ): Promise<SimilarArtistCandidateEnrichmentResult> {
    const start = Date.now();
    try {
      const result = await Promise.race([
        this.enrichOneCandidate(candidate, mainArtistChartmetricId),
        this.timeoutGuard(candidate.artistName)
      ]);
      debugLog("chartmetric", "similar-artist candidate enrichment completed", {
        candidateName: candidate.artistName,
        status: result.status,
        matchMethod: result.matchMethod,
        durationMs: Date.now() - start
      });
      return result;
    } catch (error) {
      warnLog("chartmetric", "similar-artist candidate enrichment failed unexpectedly", {
        candidateName: candidate.artistName,
        message: error instanceof Error ? error.message : String(error)
      });
      return { provider: "chartmetric", candidateName: candidate.artistName, status: "error", reason: "unexpected_error" };
    }
  }

  private timeoutGuard(candidateName: string): Promise<SimilarArtistCandidateEnrichmentResult> {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ provider: "chartmetric", candidateName, status: "timeout" }), this.overallTimeoutMs);
    });
  }

  private async enrichOneCandidate(
    candidate: SimilarArtistCandidateInput,
    mainArtistChartmetricId: string | null
  ): Promise<SimilarArtistCandidateEnrichmentResult> {
    const callCheck = this.callBudget.tryConsume();
    if (!callCheck.allowed) {
      return this.budgetLimited(candidate.artistName, callCheck.reason);
    }
    const creditCheck = this.creditBudget.canSpend();
    if (!creditCheck.allowed) {
      return this.budgetLimited(candidate.artistName, creditCheck.reason);
    }

    const identityCacheKey = buildIdentityCacheKey(candidate);
    let entry;
    try {
      entry = await this.identityCache.getOrCreate(identityCacheKey, async () => {
        const matchOutcome = await matchChartmetricArtist(candidate, this.client);
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
      return this.mapClientError(candidate.artistName, error, "match");
    } finally {
      this.creditBudget.record(ESTIMATED_CREDITS_PER_ENDPOINT.identity);
    }

    if (!entry.matched) {
      // Only exact/high confidence matches ever reach the `matched: true`
      // branch below — ambiguous/low-confidence candidates are never merged
      // (issue #201 acceptance criterion), mirroring chartmetric.service.ts.
      if (entry.status === "ambiguous") {
        return { provider: "chartmetric", candidateName: candidate.artistName, status: "ambiguous", reason: "ambiguous_candidates" };
      }
      if (entry.status === "low_confidence") {
        return { provider: "chartmetric", candidateName: candidate.artistName, status: "ambiguous", reason: "low_confidence_match" };
      }
      return { provider: "chartmetric", candidateName: candidate.artistName, status: "not_found" };
    }

    const identity: ChartmetricIdentityMatch = {
      chartmetricArtistId: entry.chartmetricArtistId,
      matchMethod: entry.matchMethod,
      matchConfidence: entry.matchConfidence
    };

    return this.fetchCandidateMetrics(candidate, identity, mainArtistChartmetricId);
  }

  private async fetchCandidateMetrics(
    candidate: SimilarArtistCandidateInput,
    identity: ChartmetricIdentityMatch,
    mainArtistChartmetricId: string | null
  ): Promise<SimilarArtistCandidateEnrichmentResult> {
    let baseMetrics;
    try {
      const cached = this.metricsCache.get(identity.chartmetricArtistId);
      baseMetrics =
        cached !== undefined
          ? cached
          : await this.metricsCache.getOrCreate(identity.chartmetricArtistId, async () => {
              const outcome = await this.client.getArtistStats(identity.chartmetricArtistId);
              this.creditBudget.record(outcome.reportedCredits ?? ESTIMATED_CREDITS_PER_ENDPOINT.stats);
              return mapToAudienceMetrics(identity.chartmetricArtistId, candidate.spotifyArtistId ?? null, outcome.data, identity.matchConfidence);
            });
    } catch (error) {
      return this.mapClientError(candidate.artistName, error, "stats");
    }

    if (!baseMetrics) {
      return { provider: "chartmetric", candidateName: candidate.artistName, status: "error", reason: "malformed_response" };
    }

    // Score/social, playlist reach and the neighbouring-artist check are all
    // best-effort additions beyond the base audience snapshot: a failure in
    // any one of them must never downgrade an otherwise-successful result,
    // it just leaves that field unavailable (issue #201: "return partial
    // results when Chartmetric data is unavailable").
    const [candidateDetail, neighbouringArtistScore] = await Promise.all([
      this.fetchCandidateDetail(identity.chartmetricArtistId),
      this.resolveNeighbouringArtistScore(identity.chartmetricArtistId, mainArtistChartmetricId)
    ]);

    const metrics = mapToCandidateMetrics(
      baseMetrics,
      candidateDetail.scoreAndSocial,
      candidateDetail.playlistReach,
      { listenerGrowthPercent: candidateDetail.listenerGrowthPercent, followerGrowthPercent: candidateDetail.followerGrowthPercent },
      neighbouringArtistScore
    );

    return {
      provider: "chartmetric",
      candidateName: candidate.artistName,
      status: hasUsableMetrics(baseMetrics) ? "success" : "partial",
      matchMethod: identity.matchMethod,
      matchConfidence: identity.matchConfidence,
      metrics
    };
  }

  private async fetchCandidateDetail(chartmetricArtistId: string): Promise<ChartmetricCandidateDetailCacheEntry> {
    const cached = this.candidateMetricsCache.get(chartmetricArtistId);
    if (cached !== undefined) {
      return cached;
    }

    return this.candidateMetricsCache.getOrCreate(chartmetricArtistId, async () => {
      const [scoreAndSocial, playlistReach, growth] = await Promise.all([
        this.safeFetch(() => this.client.getArtistScoreAndSocial(chartmetricArtistId), ESTIMATED_CREDITS_PER_ENDPOINT.scoreAndSocial),
        this.safeFetch(() => this.client.getArtistPlaylistReach(chartmetricArtistId), ESTIMATED_CREDITS_PER_ENDPOINT.playlistReach),
        this.safeFetchGrowth(chartmetricArtistId)
      ]);

      return {
        scoreAndSocial: scoreAndSocial ?? null,
        playlistReach: playlistReach ?? null,
        ...(growth.listenerGrowthPercent !== undefined ? { listenerGrowthPercent: growth.listenerGrowthPercent } : {}),
        ...(growth.followerGrowthPercent !== undefined ? { followerGrowthPercent: growth.followerGrowthPercent } : {})
      };
    });
  }

  private async safeFetch<T>(fetcher: () => Promise<{ data: T; reportedCredits?: number }>, estimatedCredits: number): Promise<T | undefined> {
    try {
      const outcome = await fetcher();
      this.creditBudget.record(outcome.reportedCredits ?? estimatedCredits);
      return outcome.data;
    } catch (error) {
      warnLog("chartmetric", "best-effort candidate endpoint failed, leaving field unavailable", {
        message: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  private async safeFetchGrowth(chartmetricArtistId: string): Promise<{ listenerGrowthPercent?: number; followerGrowthPercent?: number }> {
    try {
      const outcome = await this.client.getArtistStats(chartmetricArtistId, { sinceDays: GROWTH_WINDOW_DAYS });
      this.creditBudget.record(outcome.reportedCredits ?? ESTIMATED_CREDITS_PER_ENDPOINT.growthHistory);
      return {
        listenerGrowthPercent: calculateGrowthPercent(outcome.data.history, "spotifyMonthlyListeners"),
        followerGrowthPercent: calculateGrowthPercent(outcome.data.history, "spotifyFollowers")
      };
    } catch (error) {
      warnLog("chartmetric", "candidate growth history fetch failed, leaving growth unavailable", {
        message: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  // Fetches the main artist's Chartmetric neighbouring-artists list at most
  // once per service instance (i.e. once per analysis run), then looks the
  // candidate up in it. Best-effort: an unavailable/empty list just means no
  // score is attached, never a failed enrichment.
  private async resolveNeighbouringArtistScore(
    candidateChartmetricArtistId: string,
    mainArtistChartmetricId: string | null
  ): Promise<number | undefined> {
    if (!mainArtistChartmetricId || mainArtistChartmetricId === candidateChartmetricArtistId) {
      return undefined;
    }

    if (!this.mainArtistSimilarArtistsPromise) {
      this.mainArtistSimilarArtistsPromise = this.safeFetch(
        () => this.client.getSimilarArtists(mainArtistChartmetricId),
        ESTIMATED_CREDITS_PER_ENDPOINT.similarArtists
      ).then((data) => data ?? []);
    }

    const neighbours = await this.mainArtistSimilarArtistsPromise;
    const match = neighbours.find((neighbour) => String(neighbour.id) === candidateChartmetricArtistId);
    return match?.score;
  }

  private budgetLimited(candidateName: string, reason: ChartmetricSkipReason | undefined): SimilarArtistCandidateEnrichmentResult {
    return { provider: "chartmetric", candidateName, status: "budget_limited", reason: reason ?? "max_calls_per_analysis_reached" };
  }

  private mapClientError(candidateName: string, error: unknown, stage: "match" | "stats"): SimilarArtistCandidateEnrichmentResult {
    if (error instanceof ChartmetricApiError) {
      warnLog("chartmetric", "Chartmetric similar-artist candidate request failed", { candidateName, stage, kind: error.kind });
      switch (error.kind) {
        case "timeout":
          return { provider: "chartmetric", candidateName, status: "timeout" };
        case "rate_limited":
          return { provider: "chartmetric", candidateName, status: "rate_limited" };
        case "auth":
          return { provider: "chartmetric", candidateName, status: "error", reason: "authentication_error" };
        case "not_found":
          return stage === "match"
            ? { provider: "chartmetric", candidateName, status: "not_found" }
            : { provider: "chartmetric", candidateName, status: "partial" };
        case "malformed":
          return { provider: "chartmetric", candidateName, status: "error", reason: "malformed_response" };
        default:
          return { provider: "chartmetric", candidateName, status: "error", reason: "unexpected_error" };
      }
    }
    warnLog("chartmetric", "unclassified similar-artist candidate error", {
      candidateName,
      stage,
      message: error instanceof Error ? error.message : String(error)
    });
    return { provider: "chartmetric", candidateName, status: "error", reason: "unexpected_error" };
  }
}

function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
