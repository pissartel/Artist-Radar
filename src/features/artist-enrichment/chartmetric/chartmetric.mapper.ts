// Issue #142 section 2: normalize raw Chartmetric responses into the
// minimal phase-1 shape. A metric Chartmetric doesn't report is left
// `undefined` here and must stay that way all the way to the caller — never
// coerced to 0, since 0 monthly listeners and "no data" mean very different
// things for a booking recommendation.
import type { ChartmetricArtistStatsRaw } from "./chartmetric.client.js";
import type { ArtistMatchConfidence, ChartmetricAudienceMetrics, ChartmetricHistoryPoint } from "./chartmetric.types.js";

export function mapToAudienceMetrics(
  chartmetricArtistId: string,
  spotifyArtistId: string | null,
  stats: ChartmetricArtistStatsRaw,
  matchConfidence: ArtistMatchConfidence,
  fetchedAt: string = new Date().toISOString()
): ChartmetricAudienceMetrics {
  return {
    chartmetricArtistId,
    ...(spotifyArtistId ? { spotifyArtistId } : {}),
    ...(stats.latest?.spotifyMonthlyListeners !== undefined ? { spotifyMonthlyListeners: stats.latest.spotifyMonthlyListeners } : {}),
    ...(stats.latest?.spotifyFollowers !== undefined ? { spotifyFollowers: stats.latest.spotifyFollowers } : {}),
    ...(stats.latest?.date ? { measuredAt: stats.latest.date } : {}),
    fetchedAt,
    matchConfidence,
    source: "chartmetric"
  };
}

export function mapToHistoryPoints(stats: ChartmetricArtistStatsRaw, sinceDays: number): ChartmetricHistoryPoint[] {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  return stats.history
    .filter((point) => {
      const parsed = Date.parse(point.date);
      return Number.isFinite(parsed) && parsed >= cutoff;
    })
    .map((point) => ({
      date: point.date,
      ...(point.spotifyMonthlyListeners !== undefined ? { spotifyMonthlyListeners: point.spotifyMonthlyListeners } : {}),
      ...(point.spotifyFollowers !== undefined ? { spotifyFollowers: point.spotifyFollowers } : {})
    }));
}

// A response is usable ("success") only once at least one of the two
// audience metrics phase 1 cares about is present; otherwise it's
// "partial" (identity resolved, no usable metrics yet).
export function hasUsableMetrics(metrics: ChartmetricAudienceMetrics): boolean {
  return metrics.spotifyMonthlyListeners !== undefined || metrics.spotifyFollowers !== undefined;
}
