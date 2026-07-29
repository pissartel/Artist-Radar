// Issue #142 section 5: server-side kill switch for Chartmetric.
//
// `chartmetric_artist_enrichment` must be remotely disableable without a
// rebuild/redeploy. We model that as an optional remote flag service
// (CHARTMETRIC_FLAG_SERVICE_URL) that this process polls with a strict
// timeout and a short cache; when it isn't configured, the local
// CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED env var is the source of truth
// (still redeployable-free via most hosting platforms' env var UI). If the
// remote service *is* configured but unreachable/slow/malformed, Chartmetric
// fails closed (disabled) rather than guessing — see section 5/6.
import { debugLog, warnLog } from "../../../utils/logger.js";
import { fetchWithTimeout } from "../../../utils/fetchWithTimeout.js";
import { TtlCache } from "../../../utils/ttlCache.js";
import type { ChartmetricSkipReason } from "./chartmetric.types.js";

type FetchLike = typeof fetch;

export type ChartmetricEnvironment = "production" | "preview" | "development";

export interface ChartmetricFeatureFlagEnv {
  CHARTMETRIC_REFRESH_TOKEN?: string;
  CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED?: string;
  CHARTMETRIC_FLAG_SERVICE_URL?: string;
  CHARTMETRIC_FLAG_SERVICE_TIMEOUT_MS?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}

export interface ResolveChartmetricFeatureFlagInput {
  env?: ChartmetricFeatureFlagEnv;
  // Explicit value sent by the client in the current request's
  // `features.chartmetricArtistEnrichment` field (issue #142 section 4).
  // Only consulted in preview/development.
  requestToggleEnabled?: boolean;
  fetchImpl?: FetchLike;
}

export interface ChartmetricFeatureFlagResolution {
  effectiveEnabled: boolean;
  serverFlagEnabled: boolean;
  credentialsPresent: boolean;
  // true when no remote flag service is configured (local env var is
  // authoritative) or when the configured remote service responded
  // successfully; false when a configured remote service was unreachable,
  // timed out or returned a malformed payload (fail-closed case).
  remoteFlagAvailable: boolean;
  environment: ChartmetricEnvironment;
  reason?: ChartmetricSkipReason;
}

const DEFAULT_FLAG_SERVICE_TIMEOUT_MS = 2_000;
// Short TTL: long enough to avoid re-polling the remote flag service once
// per artist within a single pipeline run, short enough that a kill switch
// flip takes effect almost immediately for the next analysis.
const REMOTE_FLAG_CACHE_TTL_MS = 30_000;

let remoteFlagCache = new TtlCache<string, boolean | null>(REMOTE_FLAG_CACHE_TTL_MS);

// Test-only: TtlCache has no per-entry invalidation, so tests that vary the
// remote flag service's behavior across cases need a full reset.
export function resetChartmetricFeatureFlagCache(): void {
  remoteFlagCache = new TtlCache<string, boolean | null>(REMOTE_FLAG_CACHE_TTL_MS);
}

export function resolveChartmetricEnvironment(env: ChartmetricFeatureFlagEnv): ChartmetricEnvironment {
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development") {
    return vercelEnv;
  }
  return env.NODE_ENV === "production" ? "production" : "development";
}

export async function resolveChartmetricFeatureFlag(
  input: ResolveChartmetricFeatureFlagInput = {}
): Promise<ChartmetricFeatureFlagResolution> {
  const env = input.env ?? process.env;
  const environment = resolveChartmetricEnvironment(env);
  const credentialsPresent = Boolean(env.CHARTMETRIC_REFRESH_TOKEN?.trim());

  if (!credentialsPresent) {
    return {
      effectiveEnabled: false,
      serverFlagEnabled: false,
      credentialsPresent: false,
      remoteFlagAvailable: true,
      environment,
      reason: "missing_credentials"
    };
  }

  const { serverFlagEnabled, remoteFlagAvailable, reason: serverReason } = await resolveServerFlag(
    env,
    input.fetchImpl ?? fetch
  );

  let effectiveEnabled: boolean;
  let reason: ChartmetricSkipReason | undefined = serverReason;
  if (environment === "production") {
    effectiveEnabled = serverFlagEnabled;
  } else {
    effectiveEnabled = serverFlagEnabled && input.requestToggleEnabled === true;
    if (serverFlagEnabled && input.requestToggleEnabled !== true) {
      reason = "feature_disabled";
    }
  }

  if (!effectiveEnabled && !reason) {
    reason = "feature_disabled";
  }

  debugLog("chartmetric", "feature flag resolved", {
    environment,
    serverFlagEnabled,
    remoteFlagAvailable,
    requestToggleEnabled: input.requestToggleEnabled ?? null,
    effectiveEnabled
  });

  return {
    effectiveEnabled,
    serverFlagEnabled,
    credentialsPresent: true,
    remoteFlagAvailable,
    environment,
    ...(effectiveEnabled ? {} : { reason })
  };
}

async function resolveServerFlag(
  env: ChartmetricFeatureFlagEnv,
  fetchImpl: FetchLike
): Promise<{ serverFlagEnabled: boolean; remoteFlagAvailable: boolean; reason?: ChartmetricSkipReason }> {
  const flagServiceUrl = env.CHARTMETRIC_FLAG_SERVICE_URL?.trim();
  const localFlagEnabled = env.CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED !== "false";

  if (!flagServiceUrl) {
    return { serverFlagEnabled: localFlagEnabled, remoteFlagAvailable: true };
  }

  const cacheKey = flagServiceUrl;
  const cached = remoteFlagCache.get(cacheKey);
  if (cached !== undefined) {
    return cached === null
      ? { serverFlagEnabled: false, remoteFlagAvailable: false, reason: "remote_flag_unavailable" }
      : { serverFlagEnabled: cached, remoteFlagAvailable: true };
  }

  const timeoutMs = Number.parseInt(env.CHARTMETRIC_FLAG_SERVICE_TIMEOUT_MS ?? "", 10) || DEFAULT_FLAG_SERVICE_TIMEOUT_MS;

  try {
    const response = await fetchWithTimeout(flagServiceUrl, {}, timeoutMs, fetchImpl, "chartmetric");
    if (!response.ok) {
      warnLog("chartmetric", "remote flag service returned a non-OK status", { status: response.status });
      remoteFlagCache.set(cacheKey, null);
      return { serverFlagEnabled: false, remoteFlagAvailable: false, reason: "remote_flag_unavailable" };
    }

    const payload = (await response.json()) as unknown;
    const enabled = extractFlagValue(payload);
    if (enabled === null) {
      warnLog("chartmetric", "remote flag service returned a malformed payload");
      remoteFlagCache.set(cacheKey, null);
      return { serverFlagEnabled: false, remoteFlagAvailable: false, reason: "remote_flag_unavailable" };
    }

    remoteFlagCache.set(cacheKey, enabled);
    return { serverFlagEnabled: enabled, remoteFlagAvailable: true };
  } catch (error) {
    warnLog("chartmetric", "remote flag service unavailable", {
      message: error instanceof Error ? error.message : String(error)
    });
    remoteFlagCache.set(cacheKey, null);
    return { serverFlagEnabled: false, remoteFlagAvailable: false, reason: "remote_flag_unavailable" };
  }
}

function extractFlagValue(payload: unknown): boolean | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const value = (payload as Record<string, unknown>).chartmetric_artist_enrichment;
  return typeof value === "boolean" ? value : null;
}
