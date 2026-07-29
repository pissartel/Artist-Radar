// Issue #142 section 8 (usage-based cost protection): cache Chartmetric
// results with metric-appropriate freshness so a re-analysis of the same
// artist within the suggested windows never re-spends credits.
//
//   Chartmetric artist identity: 90 days
//   Spotify monthly listeners / followers: 7 days
//   Explicitly requested short history: 30 days
//
// TtlCache.getOrCreate() also de-dupes concurrent in-flight requests for the
// same key, which covers "avoid duplicate requests during one pipeline
// execution" without any extra bookkeeping.
import { TtlCache } from "../../../utils/ttlCache.js";
import type { ArtistMatchConfidence, ArtistMatchMethod, ChartmetricAudienceMetrics, ChartmetricHistoryPoint } from "./chartmetric.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChartmetricIdentityMatch {
  chartmetricArtistId: string;
  matchMethod: ArtistMatchMethod;
  matchConfidence: ArtistMatchConfidence;
}

// A cache entry preserves *why* a negative match failed (not found vs.
// ambiguous vs. too-low-confidence) so a cache hit returns exactly the same
// status a fresh lookup would have — collapsing all three into a bare
// `null` would lose that distinction on repeat lookups within the 90-day
// identity TTL.
export type ChartmetricIdentityCacheEntry =
  | ({ matched: true } & ChartmetricIdentityMatch)
  | { matched: false; status: "not_found" | "ambiguous" | "low_confidence" };

export type ChartmetricIdentityCache = TtlCache<string, ChartmetricIdentityCacheEntry>;
export type ChartmetricMetricsCache = TtlCache<string, ChartmetricAudienceMetrics | null>;
export type ChartmetricHistoryCache = TtlCache<string, ChartmetricHistoryPoint[] | null>;

export function createChartmetricIdentityCache(): ChartmetricIdentityCache {
  return new TtlCache(90 * DAY_MS);
}

export function createChartmetricMetricsCache(): ChartmetricMetricsCache {
  return new TtlCache(7 * DAY_MS);
}

export function createChartmetricHistoryCache(): ChartmetricHistoryCache {
  return new TtlCache(30 * DAY_MS);
}

// Module-level singletons shared by the default provider instance so that
// caching/dedup works across separate analysis requests within the same
// running process, not just within one pipeline call.
export const defaultChartmetricIdentityCache: ChartmetricIdentityCache = createChartmetricIdentityCache();
export const defaultChartmetricMetricsCache: ChartmetricMetricsCache = createChartmetricMetricsCache();
export const defaultChartmetricHistoryCache: ChartmetricHistoryCache = createChartmetricHistoryCache();

export function resetDefaultChartmetricCaches(): void {
  defaultChartmetricIdentityCache.clear();
  defaultChartmetricMetricsCache.clear();
  defaultChartmetricHistoryCache.clear();
}

// Stable cache key for an artist identity lookup: prefers the strongest
// identifier available so two lookups for the same artist collapse to the
// same cache entry regardless of minor input differences (genre order, ...).
export function buildIdentityCacheKey(input: {
  spotifyArtistId?: string | null;
  spotifyUrl?: string | null;
  externalIds?: Record<string, string>;
  artistName: string;
}): string {
  if (input.spotifyArtistId) {
    return `spotify_id:${input.spotifyArtistId}`;
  }
  if (input.spotifyUrl) {
    return `spotify_url:${normalizeUrl(input.spotifyUrl)}`;
  }
  const externalIdEntry = Object.entries(input.externalIds ?? {})[0];
  if (externalIdEntry) {
    return `external_id:${externalIdEntry[0]}:${externalIdEntry[1]}`;
  }
  return `name:${input.artistName.trim().toLowerCase()}`;
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, "");
}
