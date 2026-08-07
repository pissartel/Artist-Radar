// Issue #219: computes artistScaleScore (src/scoring/artistScaleScore.ts) for
// the analyzed artist and for every similar artist, then positions the
// analyzed artist against that similar-artist sample
// (src/scoring/artistScaleComparison.ts). Purely additive on top of the
// existing discovery/Chartmetric-enrichment pipeline — see
// enrichSimilarArtistsWithChartmetric in similarArtistCommercialEnrichment.ts,
// which this module runs *after* so `artist.chartmetric` is already
// populated for every candidate that was selected for Chartmetric
// enrichment.
//
// Chartmetric is always preferred when it reports a value; every field below
// falls back to the richest already-collected signal this codebase has for
// that platform (Spotify/YouTube/Instagram profile data), and is left
// `undefined` — never fabricated — when neither source has it. Two signals
// the issue lists as fallback sources (Deezer, TikTok) have no data source
// anywhere in this codebase today, so they're always omitted; see the PR
// description for this known limitation.
import {
  scoreArtistScale,
  type ArtistScaleScoreInput,
  type ArtistScaleScoreOptions
} from "../scoring/artistScaleScore.js";
import {
  compareArtistScaleToSimilarArtists,
  type ArtistScaleComparisonThresholds
} from "../scoring/artistScaleComparison.js";
import type { ArtistProfile, ArtistScale, SimilarArtist } from "../schemas.js";
import type { ArtistEnrichmentResult } from "../features/artist-enrichment/chartmetric/chartmetric.types.js";
import type { SimilarArtistsByTier } from "./similarArtistsFinder.js";

export interface ComputeArtistScaleForAnalysisInput {
  profile: ArtistProfile;
  // Main-artist Chartmetric enrichment result (issue #142 phase 1). Its
  // metrics are narrower than the per-candidate metrics below (only Spotify
  // monthly listeners/followers), so the main artist's score will typically
  // have lower coverage than a well-enriched similar artist — an honest
  // consequence of that narrower integration, not a bug in this module.
  mainArtistChartmetric?: ArtistEnrichmentResult;
  // Similar artists already grouped by tier, ideally already passed through
  // enrichSimilarArtistsWithChartmetric so `artist.chartmetric` is populated
  // where available.
  similarArtists: SimilarArtistsByTier;
  comparisonThresholds?: ArtistScaleComparisonThresholds;
  scoreOptions?: ArtistScaleScoreOptions;
  now?: Date;
}

export interface ComputeArtistScaleForAnalysisResult {
  artistScale: ArtistScale;
  similarArtists: SimilarArtistsByTier;
}

export function computeArtistScaleForAnalysis(
  input: ComputeArtistScaleForAnalysisInput
): ComputeArtistScaleForAnalysisResult {
  const now = input.now ?? new Date();
  const scoreOptions: ArtistScaleScoreOptions = { now, ...input.scoreOptions };

  const mainResult = scoreArtistScale(
    buildMainArtistScaleScoreInput(input.profile, input.mainArtistChartmetric),
    scoreOptions
  );

  const scoredByName = new Map(
    flattenGroups(input.similarArtists).map((artist) => [
      artist.name,
      scoreArtistScale(buildSimilarArtistScaleScoreInput(artist), scoreOptions)
    ])
  );

  // Only candidates with real signal-backed scores (confidence !==
  // "unavailable") enter the comparison sample — an artist scored purely
  // from a zero-coverage input would otherwise silently drag the
  // median/average toward 0.
  const similarArtistScoresForComparison = Array.from(scoredByName.values())
    .filter((result) => result.confidence !== "unavailable")
    .map((result) => result.artistScaleScore);

  const comparison = compareArtistScaleToSimilarArtists(
    mainResult.confidence === "unavailable" ? null : mainResult.artistScaleScore,
    similarArtistScoresForComparison,
    input.comparisonThresholds
  );

  const annotatedSimilarArtists = mapGroups(input.similarArtists, (artist) => {
    const result = scoredByName.get(artist.name);
    if (!result) {
      return artist;
    }
    return {
      ...artist,
      artistScaleScore: result.confidence === "unavailable" ? null : result.artistScaleScore,
      artistScaleBand: result.confidence === "unavailable" ? null : result.scaleBand,
      artistScaleScoreConfidence: result.confidence,
      artistScaleScoreCoverage: result.coverage
    };
  });

  return {
    artistScale: {
      artistScaleScore: mainResult.confidence === "unavailable" ? null : mainResult.artistScaleScore,
      artistScaleBand: mainResult.confidence === "unavailable" ? null : mainResult.scaleBand,
      confidence: mainResult.confidence,
      coverage: mainResult.coverage,
      components: mainResult.components,
      missingSignals: mainResult.missingSignals,
      explanation: mainResult.explanation,
      comparison
    },
    similarArtists: annotatedSimilarArtists
  };
}

function buildMainArtistScaleScoreInput(
  profile: ArtistProfile,
  chartmetric: ArtistEnrichmentResult | undefined
): ArtistScaleScoreInput {
  const metrics = chartmetric?.metrics;
  return {
    // Chartmetric priority #1: monthly listeners has no fallback anywhere in
    // this codebase (Spotify's public API doesn't expose it), so it's
    // Chartmetric-only or absent.
    spotifyMonthlyListeners: metrics?.spotifyMonthlyListeners,
    spotifyFollowers: metrics?.spotifyFollowers ?? profile.platformStats.spotifyFollowers ?? profile.spotify?.followers ?? undefined,
    // Spotify's own 0-100 popularity index used as the generic engagement
    // signal when Chartmetric's own composite artist score isn't available
    // for the main artist (it never is today — see module-level comment).
    engagementScore: profile.platformStats.spotifyPopularity ?? profile.spotify?.popularity ?? undefined,
    youtubeSubscribers: profile.platformStats.youtubeSubscribers ?? undefined,
    youtubeViews: profile.platformStats.youtubeTotalViews ?? undefined,
    instagramFollowers: profile.platformStats.instagramFollowers ?? undefined,
    deezerFans: profile.platformStats.deezerFans ?? undefined,
    measuredAt: metrics?.measuredAt,
    matchConfidence: metrics?.matchConfidence
  };
}

function buildSimilarArtistScaleScoreInput(artist: SimilarArtist): ArtistScaleScoreInput {
  const metrics = artist.chartmetric?.metrics;
  const social = metrics?.socialAudience;
  const lastFm = artist.popularity.platforms.lastfm;

  return {
    chartmetricArtistScore: metrics?.chartmetricArtistScore,
    spotifyMonthlyListeners: metrics?.spotifyMonthlyListeners,
    spotifyFollowers:
      metrics?.spotifyFollowers
      ?? artist.spotify?.followers
      ?? artist.estimatedFollowers
      ?? artist.popularity.platforms.spotify?.followers
      ?? undefined,
    lastFmListeners: lastFm?.listeners ?? undefined,
    lastFmPlaycount: lastFm?.playcount ?? undefined,
    engagementScore: artist.spotify?.popularity ?? artist.popularity.platforms.spotify?.popularity ?? undefined,
    instagramFollowers: social?.instagramFollowers ?? artist.popularity.platforms.instagram?.followers ?? undefined,
    // No TikTok data source exists anywhere in this codebase — Chartmetric-only.
    tiktokFollowers: social?.tiktokFollowers,
    youtubeSubscribers:
      social?.youtubeSubscribers
      ?? artist.youtubeSubscribers
      ?? artist.popularity.platforms.youtube?.subscribers
      ?? undefined,
    youtubeViews: artist.youtubeTotalViews ?? artist.popularity.platforms.youtube?.views ?? undefined,
    // No Deezer data source exists anywhere in this codebase — left unset
    // regardless of provider (never fabricated).
    playlistReachScore: metrics?.playlistReachScore,
    totalCurrentPlaylists: metrics?.totalCurrentPlaylists,
    listenerGrowthPercent: metrics?.listenerGrowthPercent,
    followerGrowthPercent: metrics?.followerGrowthPercent,
    measuredAt: metrics?.measuredAt,
    matchConfidence: artist.chartmetric?.matchConfidence
  };
}

function flattenGroups(groups: SimilarArtistsByTier): SimilarArtist[] {
  return Object.values(groups).flat();
}

function mapGroups(
  groups: SimilarArtistsByTier,
  fn: (artist: SimilarArtist) => SimilarArtist
): SimilarArtistsByTier {
  const entries = Object.entries(groups).map(([tier, artists]) => [tier, artists.map(fn)] as const);
  return Object.fromEntries(entries) as SimilarArtistsByTier;
}
