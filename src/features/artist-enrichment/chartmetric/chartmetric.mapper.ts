// Issue #142 section 2: normalize raw Chartmetric responses into the
// minimal phase-1 shape. A metric Chartmetric doesn't report is left
// `undefined` here and must stay that way all the way to the caller — never
// coerced to 0, since 0 monthly listeners and "no data" mean very different
// things for a booking recommendation.
import type {
  ChartmetricArtistScoreAndSocialRaw,
  ChartmetricArtistStatsRaw,
  ChartmetricPlaylistReachRaw
} from "./chartmetric.client.js";
import type {
  ArtistMatchConfidence,
  ChartmetricAudienceMetrics,
  ChartmetricCandidateMetrics,
  ChartmetricHistoryPoint
} from "./chartmetric.types.js";

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

// Issue #201: combine the base audience snapshot with score/social/playlist
// signals and trailing-window growth into the wider candidate metrics shape.
// Every additional field stays optional and undefined-when-unreported —
// callers must never coerce a missing signal to 0 (it would read as "no
// audience" instead of "no data").
export function mapToCandidateMetrics(
  base: ChartmetricAudienceMetrics,
  scoreAndSocial: ChartmetricArtistScoreAndSocialRaw | null,
  playlistReach: ChartmetricPlaylistReachRaw | null,
  growth: { listenerGrowthPercent?: number; followerGrowthPercent?: number },
  neighbouringArtistScore?: number
): ChartmetricCandidateMetrics {
  const socialAudience = scoreAndSocial
    ? {
        ...(scoreAndSocial.instagramFollowers !== undefined ? { instagramFollowers: scoreAndSocial.instagramFollowers } : {}),
        ...(scoreAndSocial.tiktokFollowers !== undefined ? { tiktokFollowers: scoreAndSocial.tiktokFollowers } : {}),
        ...(scoreAndSocial.youtubeSubscribers !== undefined ? { youtubeSubscribers: scoreAndSocial.youtubeSubscribers } : {}),
        ...(scoreAndSocial.facebookFollowers !== undefined ? { facebookFollowers: scoreAndSocial.facebookFollowers } : {}),
        ...(scoreAndSocial.twitterFollowers !== undefined ? { twitterFollowers: scoreAndSocial.twitterFollowers } : {})
      }
    : {};
  const hasSocialAudience = Object.keys(socialAudience).length > 0;

  return {
    ...base,
    ...(scoreAndSocial?.chartmetricArtistScore !== undefined ? { chartmetricArtistScore: scoreAndSocial.chartmetricArtistScore } : {}),
    ...(growth.listenerGrowthPercent !== undefined ? { listenerGrowthPercent: growth.listenerGrowthPercent } : {}),
    ...(growth.followerGrowthPercent !== undefined ? { followerGrowthPercent: growth.followerGrowthPercent } : {}),
    ...(hasSocialAudience ? { socialAudience } : {}),
    ...(playlistReach?.playlistReachScore !== undefined ? { playlistReachScore: playlistReach.playlistReachScore } : {}),
    ...(playlistReach?.totalCurrentPlaylists !== undefined ? { totalCurrentPlaylists: playlistReach.totalCurrentPlaylists } : {}),
    ...(neighbouringArtistScore !== undefined ? { neighbouringArtistScore } : {})
  };
}

// Percent change between the first and last usable point of a trailing
// history window, e.g. +18.5 for +18.5% growth. Undefined (not 0) when
// there's fewer than two usable points to compare.
export function calculateGrowthPercent(history: ChartmetricHistoryPoint[], field: "spotifyMonthlyListeners" | "spotifyFollowers"): number | undefined {
  const usablePoints = history.filter((point) => point[field] !== undefined);
  if (usablePoints.length < 2) {
    return undefined;
  }
  const first = usablePoints[0]![field]!;
  const last = usablePoints[usablePoints.length - 1]![field]!;
  if (first <= 0) {
    return undefined;
  }
  return Math.round(((last - first) / first) * 1000) / 10;
}
