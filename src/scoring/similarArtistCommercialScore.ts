// Issue #201: commercial-scale similarity scoring/tiering for similar-artist
// candidates, built on top of Chartmetric enrichment (when available) and
// the existing discovery-pipeline signals as a graceful fallback. This is
// deliberately a *separate* score from src/scoring/similarArtistScore.ts
// (issue #48's musical/booking relevance score) — CLAUDE.md's booking domain
// rules require genre compatibility and artist similarity to outrank
// audience size, so this module never replaces or outweighs that existing
// score; it adds an explicit, explainable "commercial scale" dimension
// alongside it (issue #201 acceptance criterion: "ranking distinguishes
// musical similarity from commercial scale similarity").
import { clampScore } from "./evidenceSignals.js";
import type { ChartmetricCandidateMetrics } from "../features/artist-enrichment/chartmetric/chartmetric.types.js";
import type { EstimatedArtistLevel, SimilarArtistCommercialScoreComponents, SimilarArtistCommercialTier } from "../schemas.js";

export type { SimilarArtistCommercialScoreComponents, SimilarArtistCommercialTier };

export interface SimilarArtistCommercialScoreResult {
  score: number;
  components: SimilarArtistCommercialScoreComponents;
  tier: SimilarArtistCommercialTier;
  explanation: string;
  // False when neither Chartmetric nor any existing discovery signal could
  // establish an audience-size comparison for this candidate — the tier is
  // still assigned (defaulting to the least-overclaiming option) but callers
  // should treat it as lower confidence.
  audienceDataAvailable: boolean;
}

export interface SimilarArtistCommercialTierThresholds {
  // A candidate within [1/sameLevelMaxRatio, sameLevelMaxRatio] of the main
  // artist's audience size is "same_level".
  sameLevelMaxRatio: number;
  slightlyLargerMaxRatio: number;
  aspirationalMaxRatio: number;
  // Above this geographic-relevance score (0-100), a candidate can be
  // classified "local_compatible_artist" even if noticeably bigger, as long
  // as it stays under localCompatibleMaxRatio.
  localCompatibleMinGeographicRelevance: number;
  localCompatibleMaxRatio: number;
}

export const DEFAULT_COMMERCIAL_TIER_THRESHOLDS: SimilarArtistCommercialTierThresholds = {
  sameLevelMaxRatio: 1.6,
  slightlyLargerMaxRatio: 3.5,
  aspirationalMaxRatio: 12,
  localCompatibleMinGeographicRelevance: 75,
  localCompatibleMaxRatio: 6
};

const WEIGHTS: Record<keyof SimilarArtistCommercialScoreComponents, number> = {
  genreCompatibility: 0.3,
  audienceSimilarity: 0.15,
  careerStageSimilarity: 0.15,
  geographicRelevance: 0.2,
  recentActivity: 0.1,
  crossPlatformEvidence: 0.1
};

export interface MainArtistAudienceContext {
  // Preferred: Chartmetric-reported Spotify monthly listeners/followers for
  // the main artist (issue #142's main-artist enrichment). Falls back to
  // Spotify profile data when Chartmetric data isn't available/matched.
  chartmetricSpotifyMonthlyListeners?: number | null;
  chartmetricSpotifyFollowers?: number | null;
  spotifyFollowers?: number | null;
  // Reuses the main artist's already-computed ArtistProfile.estimatedLevel
  // (issue #90/#48 territory) as the career-stage side of the comparison,
  // rather than inventing a second stage vocabulary just for this module.
  estimatedLevel: EstimatedArtistLevel;
}

export type SimilarArtistAudienceTier = "small" | "medium" | "large" | "unknown";

export interface SimilarArtistCandidateForCommercialScore {
  genreRelevance: number;
  sceneRelevance: number;
  artistTier: SimilarArtistAudienceTier;
  estimatedFollowers: number | null;
  // Distinct discovery sources/platforms with real evidence for this
  // candidate (e.g. sources.length + populated popularity.platforms) — a
  // simple proxy for "cross-platform evidence" independent of Chartmetric.
  evidenceSignalCount: number;
}

export interface SimilarArtistCommercialScoreInput {
  mainArtist: MainArtistAudienceContext;
  candidate: SimilarArtistCandidateForCommercialScore;
  chartmetricMetrics?: ChartmetricCandidateMetrics;
  thresholds?: SimilarArtistCommercialTierThresholds;
}

// Maps the similar-artist-candidate size tier (already computed upstream by
// the discovery pipeline) onto the same three-stage vocabulary as
// ArtistProfile.estimatedLevel, so a candidate's career stage is directly
// comparable to the main artist's.
const TIER_TO_LEVEL: Record<SimilarArtistAudienceTier, EstimatedArtistLevel> = {
  small: "emerging",
  medium: "developing",
  large: "established",
  unknown: "unknown"
};
const LEVEL_RANK: Record<EstimatedArtistLevel, number | null> = {
  unknown: null,
  emerging: 0,
  developing: 1,
  established: 2
};

export function scoreSimilarArtistCommercialCompatibility(input: SimilarArtistCommercialScoreInput): SimilarArtistCommercialScoreResult {
  const thresholds = input.thresholds ?? DEFAULT_COMMERCIAL_TIER_THRESHOLDS;
  const mainAudienceSize = resolveMainAudienceSize(input.mainArtist);
  const candidateAudienceSize = resolveCandidateAudienceSize(input.candidate, input.chartmetricMetrics);
  const ratio = mainAudienceSize && candidateAudienceSize ? candidateAudienceSize / mainAudienceSize : null;
  const audienceDataAvailable = ratio !== null;

  const components: SimilarArtistCommercialScoreComponents = {
    genreCompatibility: clampScore(Math.round(input.candidate.genreRelevance)),
    audienceSimilarity: scoreAudienceSimilarity(ratio),
    careerStageSimilarity: scoreCareerStageSimilarity(input.mainArtist.estimatedLevel, input.candidate.artistTier),
    geographicRelevance: clampScore(Math.round(input.candidate.sceneRelevance)),
    recentActivity: scoreRecentActivity(input.chartmetricMetrics),
    crossPlatformEvidence: scoreCrossPlatformEvidence(input.candidate, input.chartmetricMetrics)
  };

  const score = calculateWeightedScore(components);
  const tier = classifySimilarArtistCommercialTier(ratio, components.geographicRelevance, thresholds);

  return {
    score,
    components,
    tier,
    audienceDataAvailable,
    explanation: buildExplanation(score, components, tier, audienceDataAvailable)
  };
}

export function classifySimilarArtistCommercialTier(
  ratio: number | null,
  geographicRelevance: number,
  thresholds: SimilarArtistCommercialTierThresholds = DEFAULT_COMMERCIAL_TIER_THRESHOLDS
): SimilarArtistCommercialTier {
  if (ratio === null) {
    // No usable audience-size signal from Chartmetric or existing discovery
    // data: default to the least-overclaiming tier instead of guessing a
    // scale relationship that was never actually observed.
    return geographicRelevance >= thresholds.localCompatibleMinGeographicRelevance ? "local_compatible_artist" : "same_level";
  }

  if (geographicRelevance >= thresholds.localCompatibleMinGeographicRelevance && ratio <= thresholds.localCompatibleMaxRatio) {
    return "local_compatible_artist";
  }

  if (ratio < 1) {
    // A candidate smaller than the main artist that isn't a close local peer
    // is still grouped with same_level: a modestly (or considerably) smaller
    // act is just as actionable a booking peer, and the issue's five tiers
    // don't define a separate "smaller" bucket.
    return "same_level";
  }

  if (ratio <= thresholds.sameLevelMaxRatio) {
    return "same_level";
  }
  if (ratio <= thresholds.slightlyLargerMaxRatio) {
    return "slightly_larger";
  }
  if (ratio <= thresholds.aspirationalMaxRatio) {
    return "aspirational";
  }
  return "major_reference";
}

function resolveMainAudienceSize(mainArtist: MainArtistAudienceContext): number | null {
  if (typeof mainArtist.chartmetricSpotifyMonthlyListeners === "number") {
    return mainArtist.chartmetricSpotifyMonthlyListeners;
  }
  if (typeof mainArtist.chartmetricSpotifyFollowers === "number") {
    return mainArtist.chartmetricSpotifyFollowers;
  }
  if (typeof mainArtist.spotifyFollowers === "number") {
    return mainArtist.spotifyFollowers;
  }
  return null;
}

function resolveCandidateAudienceSize(
  candidate: SimilarArtistCandidateForCommercialScore,
  chartmetricMetrics?: ChartmetricCandidateMetrics
): number | null {
  if (typeof chartmetricMetrics?.spotifyMonthlyListeners === "number") {
    return chartmetricMetrics.spotifyMonthlyListeners;
  }
  if (typeof chartmetricMetrics?.spotifyFollowers === "number") {
    return chartmetricMetrics.spotifyFollowers;
  }
  if (typeof candidate.estimatedFollowers === "number") {
    return candidate.estimatedFollowers;
  }
  return null;
}

// Peaks at ratio=1 (100) and decays symmetrically on a log2 scale in either
// direction (a candidate 2x bigger or 2x smaller scores the same), so
// "commercial scale similarity" never rewards being much smaller over being
// much bigger or vice versa.
function scoreAudienceSimilarity(ratio: number | null): number {
  if (ratio === null || ratio <= 0) {
    return 50;
  }
  const logDistance = Math.abs(Math.log2(ratio));
  return clampScore(Math.round(100 - 25 * logDistance));
}

// Distance-based comparison between the main artist's and the candidate's
// career stage (emerging/developing/established), both resolved onto
// ArtistProfile's existing EstimatedArtistLevel vocabulary: same stage
// scores 100, one stage apart scores 65, opposite ends score 30. Neutral
// (50) when either side's stage can't be resolved at all.
function scoreCareerStageSimilarity(mainLevel: EstimatedArtistLevel, candidateTier: SimilarArtistAudienceTier): number {
  const mainRank = LEVEL_RANK[mainLevel];
  const candidateRank = LEVEL_RANK[TIER_TO_LEVEL[candidateTier]];
  if (mainRank === null || candidateRank === null) {
    return 50;
  }
  const distance = Math.abs(mainRank - candidateRank);
  return clampScore(Math.round(100 - distance * 35));
}

function averageGrowth(chartmetricMetrics?: ChartmetricCandidateMetrics): number | null {
  const values = [chartmetricMetrics?.listenerGrowthPercent, chartmetricMetrics?.followerGrowthPercent].filter(
    (value): value is number => typeof value === "number"
  );
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreRecentActivity(chartmetricMetrics?: ChartmetricCandidateMetrics): number {
  const growth = averageGrowth(chartmetricMetrics);
  if (growth === null) {
    return 50;
  }
  return clampScore(Math.round(50 + growth * 1.5));
}

function scoreCrossPlatformEvidence(
  candidate: SimilarArtistCandidateForCommercialScore,
  chartmetricMetrics?: ChartmetricCandidateMetrics
): number {
  let evidenceCount = candidate.evidenceSignalCount;
  if (chartmetricMetrics?.socialAudience && Object.keys(chartmetricMetrics.socialAudience).length > 0) {
    evidenceCount += 1;
  }
  if (typeof chartmetricMetrics?.playlistReachScore === "number" || typeof chartmetricMetrics?.totalCurrentPlaylists === "number") {
    evidenceCount += 1;
  }
  return clampScore(Math.round(evidenceCount * 20));
}

function calculateWeightedScore(components: SimilarArtistCommercialScoreComponents): number {
  const total = (Object.keys(WEIGHTS) as (keyof SimilarArtistCommercialScoreComponents)[]).reduce(
    (sum, key) => sum + components[key] * WEIGHTS[key],
    0
  );
  return clampScore(Math.round(total));
}

function buildExplanation(
  score: number,
  components: SimilarArtistCommercialScoreComponents,
  tier: SimilarArtistCommercialTier,
  audienceDataAvailable: boolean
): string {
  return [
    `Commercial-scale compatibility score: ${score}/100 (tier: ${tier}).`,
    `Genre compatibility: ${components.genreCompatibility}/100.`,
    `Audience similarity: ${components.audienceSimilarity}/100${audienceDataAvailable ? "" : " (audience size unavailable, neutral default used)"}.`,
    `Career stage similarity: ${components.careerStageSimilarity}/100.`,
    `Geographic relevance: ${components.geographicRelevance}/100.`,
    `Recent activity: ${components.recentActivity}/100.`,
    `Cross-platform evidence: ${components.crossPlatformEvidence}/100.`
  ].join(" ");
}
