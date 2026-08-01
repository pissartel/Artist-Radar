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
//
// Issue #201 follow-up (correctness fixes): a missing audience-size
// comparison must never be silently treated as "same_level", and a missing
// score component must never be coerced to a neutral 50 — both produced
// plausible-looking-but-fabricated results (e.g. every under-resolved
// reference artist landing on an identical score). Every component that
// depends on audience-size/Chartmetric data is now nullable, the weighted
// score is computed only from the components that are actually available
// (with the remaining weights renormalized), and a candidate whose overall
// component coverage falls below a configurable minimum gets no numeric
// commercialScore at all rather than a low-confidence-but-still-fabricated
// number.
import { clampScore } from "./evidenceSignals.js";
import type { ChartmetricCandidateMetrics } from "../features/artist-enrichment/chartmetric/chartmetric.types.js";
import type {
  EstimatedArtistLevel,
  SimilarArtistAbsoluteScale,
  SimilarArtistCommercialScoreComponents,
  SimilarArtistCommercialScoreConfidence,
  SimilarArtistCommercialTier
} from "../schemas.js";

export type { SimilarArtistAbsoluteScale, SimilarArtistCommercialScoreComponents, SimilarArtistCommercialScoreConfidence, SimilarArtistCommercialTier };

export interface SimilarArtistCommercialScoreResult {
  // null when component coverage is below minCoverageForScore — an
  // under-evidenced candidate gets no fabricated-looking number at all.
  score: number | null;
  coverage: number;
  confidence: SimilarArtistCommercialScoreConfidence;
  components: SimilarArtistCommercialScoreComponents;
  tier: SimilarArtistCommercialTier;
  absoluteScale: SimilarArtistAbsoluteScale;
  explanation: string;
  // False when neither Chartmetric nor any existing discovery signal could
  // establish an audience-size comparison for this candidate.
  audienceDataAvailable: boolean;
  // The combined audience-size ratio (candidate / main), when a
  // metric-matched comparison was possible — exposed for diagnostics.
  audienceRatio: number | null;
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
  // Minimum fraction (0-1) of the weighted score's components that must be
  // available for commercialScore to be a number instead of null.
  minCoverageForScore: number;
}

export const DEFAULT_COMMERCIAL_TIER_THRESHOLDS: SimilarArtistCommercialTierThresholds = {
  sameLevelMaxRatio: 1.6,
  slightlyLargerMaxRatio: 3.5,
  aspirationalMaxRatio: 12,
  localCompatibleMinGeographicRelevance: 75,
  localCompatibleMaxRatio: 6,
  // genreCompatibility + geographicRelevance + crossPlatformEvidence are
  // always computable (weights 0.3 + 0.2 + 0.1 = 0.6), so that combination
  // alone is the floor when audience/career-stage/growth data is entirely
  // missing. Set just above that floor so a candidate with *only* those
  // always-on signals — exactly the under-resolved-reference-artist
  // scenario this threshold exists to catch — gets no commercialScore at
  // all, rather than a plausible-looking number built from a third of the
  // model.
  minCoverageForScore: 0.65
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
  // (issue #90/#48 territory) as a fallback career-stage signal only when no
  // numeric audience size is available to resolve a real absoluteScale.
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
// the discovery pipeline) onto the coarser three-stage vocabulary used as a
// fallback absolute scale when no numeric audience data is available.
const TIER_TO_LEVEL: Record<SimilarArtistAudienceTier, EstimatedArtistLevel> = {
  small: "emerging",
  medium: "developing",
  large: "established",
  unknown: "unknown"
};

// Numeric-evidence-only thresholds (issue #201: "If reliable Chartmetric or
// Spotify evidence is available, blink-182 should be classified as an
// absolute major or established artist"). Deliberately coarse, order-of-
// magnitude bands — this is a scale classification, not a precise ranking —
// and deliberately never reachable from the discovery pipeline's own
// small/medium/large tiers, which structurally cap out at "established" (see
// TIER_TO_LEVEL above): "major" is only ever assigned from real audience
// numbers, never guessed.
// Calibrated to match src/modules/sizeEstimator.ts's existing
// small/medium/large Spotify-follower boundaries (mediumMin=5_000,
// largeMin=50_000) rather than inventing new, inconsistent numbers — a
// candidate with the same follower count the discovery pipeline already
// calls "large" must land on "established" here too, not silently disagree.
// "major" is a genuinely new tier an order of magnitude above "established",
// only reachable with real audience numbers (see resolveAbsoluteScale).
const ABSOLUTE_SCALE_AUDIENCE_THRESHOLDS = {
  major: 1_000_000,
  established: 50_000,
  developing: 5_000
};

function resolveAbsoluteScaleFromAudienceSize(audienceSize: number | null): SimilarArtistAbsoluteScale | null {
  if (audienceSize === null || audienceSize <= 0) {
    return null;
  }
  if (audienceSize >= ABSOLUTE_SCALE_AUDIENCE_THRESHOLDS.major) {
    return "major";
  }
  if (audienceSize >= ABSOLUTE_SCALE_AUDIENCE_THRESHOLDS.established) {
    return "established";
  }
  if (audienceSize >= ABSOLUTE_SCALE_AUDIENCE_THRESHOLDS.developing) {
    return "developing";
  }
  return "emerging";
}

function resolveAbsoluteScale(audienceSize: number | null, fallbackLevel: EstimatedArtistLevel): SimilarArtistAbsoluteScale {
  return resolveAbsoluteScaleFromAudienceSize(audienceSize) ?? fallbackLevel;
}

const ABSOLUTE_SCALE_RANK: Record<SimilarArtistAbsoluteScale, number | null> = {
  unknown: null,
  emerging: 0,
  developing: 1,
  established: 2,
  major: 3
};

interface AudienceMetric {
  value: number;
  metricType: "monthly_listeners" | "followers";
}

// Best-available audience-size number for a side (main or candidate),
// preferring Chartmetric monthly listeners, used only for absolute-scale
// classification — mixing metric types is fine here since we're just
// bucketing into an order-of-magnitude band, not computing a cross-artist
// ratio (see resolveMatchedAudienceRatios below for why *that* must never
// mix metric types).
function resolveBestAudienceSize(monthlyListeners: number | null, followers: number | null): number | null {
  if (typeof monthlyListeners === "number") {
    return monthlyListeners;
  }
  if (typeof followers === "number") {
    return followers;
  }
  return null;
}

// Issue #201 "Main artist baseline": never compares a candidate's monthly
// listeners against the main artist's followers (or vice versa) — each
// metric type is only ever compared against the *same* metric type on the
// other side. Returns every metric-matched ratio that could be computed;
// callers combine them only after this normalization step.
function resolveMatchedAudienceRatios(
  mainArtist: MainArtistAudienceContext,
  candidate: SimilarArtistCandidateForCommercialScore,
  chartmetricMetrics?: ChartmetricCandidateMetrics
): AudienceMetric[] {
  const ratios: AudienceMetric[] = [];

  const mainMonthlyListeners = mainArtist.chartmetricSpotifyMonthlyListeners ?? null;
  const candidateMonthlyListeners = chartmetricMetrics?.spotifyMonthlyListeners ?? null;
  if (typeof mainMonthlyListeners === "number" && mainMonthlyListeners > 0 && typeof candidateMonthlyListeners === "number") {
    ratios.push({ value: candidateMonthlyListeners / mainMonthlyListeners, metricType: "monthly_listeners" });
  }

  const mainFollowers = mainArtist.chartmetricSpotifyFollowers ?? mainArtist.spotifyFollowers ?? null;
  const candidateFollowers = chartmetricMetrics?.spotifyFollowers ?? candidate.estimatedFollowers ?? null;
  if (typeof mainFollowers === "number" && mainFollowers > 0 && typeof candidateFollowers === "number") {
    ratios.push({ value: candidateFollowers / mainFollowers, metricType: "followers" });
  }

  return ratios;
}

// Combines same-metric-type ratios (never a mix of listeners/followers,
// enforced by resolveMatchedAudienceRatios above) by averaging in log2
// space — the natural "normalized" combination for multiplicative ratios,
// consistent with scoreAudienceSimilarity's own log2 decay below.
function combineAudienceRatios(ratios: AudienceMetric[]): number | null {
  if (ratios.length === 0) {
    return null;
  }
  const meanLog = ratios.reduce((sum, entry) => sum + Math.log2(entry.value), 0) / ratios.length;
  return 2 ** meanLog;
}

export function scoreSimilarArtistCommercialCompatibility(input: SimilarArtistCommercialScoreInput): SimilarArtistCommercialScoreResult {
  const thresholds = input.thresholds ?? DEFAULT_COMMERCIAL_TIER_THRESHOLDS;
  const matchedRatios = resolveMatchedAudienceRatios(input.mainArtist, input.candidate, input.chartmetricMetrics);
  const ratio = combineAudienceRatios(matchedRatios);
  const audienceDataAvailable = ratio !== null;

  const mainAudienceSize = resolveBestAudienceSize(
    input.mainArtist.chartmetricSpotifyMonthlyListeners ?? null,
    input.mainArtist.chartmetricSpotifyFollowers ?? input.mainArtist.spotifyFollowers ?? null
  );
  const candidateAudienceSize = resolveBestAudienceSize(
    input.chartmetricMetrics?.spotifyMonthlyListeners ?? null,
    input.chartmetricMetrics?.spotifyFollowers ?? input.candidate.estimatedFollowers ?? null
  );
  const mainAbsoluteScale = resolveAbsoluteScale(mainAudienceSize, input.mainArtist.estimatedLevel);
  const candidateAbsoluteScale = resolveAbsoluteScale(candidateAudienceSize, TIER_TO_LEVEL[input.candidate.artistTier]);

  const components: SimilarArtistCommercialScoreComponents = {
    genreCompatibility: clampScore(Math.round(input.candidate.genreRelevance)),
    audienceSimilarity: scoreAudienceSimilarity(ratio),
    careerStageSimilarity: scoreCareerStageSimilarity(mainAbsoluteScale, candidateAbsoluteScale),
    geographicRelevance: clampScore(Math.round(input.candidate.sceneRelevance)),
    recentActivity: scoreRecentActivity(input.chartmetricMetrics),
    crossPlatformEvidence: scoreCrossPlatformEvidence(input.candidate, input.chartmetricMetrics)
  };

  const { score, coverage } = calculateWeightedScore(components, thresholds.minCoverageForScore);
  const confidence = classifyConfidence(coverage, thresholds.minCoverageForScore);
  const tier = classifySimilarArtistCommercialTier(ratio, components.geographicRelevance, thresholds);

  return {
    score,
    coverage,
    confidence,
    components,
    tier,
    absoluteScale: candidateAbsoluteScale,
    audienceDataAvailable,
    audienceRatio: ratio,
    explanation: buildExplanation(score, coverage, confidence, components, tier, candidateAbsoluteScale, audienceDataAvailable)
  };
}

export function classifySimilarArtistCommercialTier(
  ratio: number | null,
  geographicRelevance: number,
  thresholds: SimilarArtistCommercialTierThresholds = DEFAULT_COMMERCIAL_TIER_THRESHOLDS
): SimilarArtistCommercialTier {
  if (ratio === null) {
    // No usable audience-size signal from Chartmetric or existing discovery
    // data: never guess a scale relationship that was never actually
    // observed. "scale_unknown" is the only honest outcome here — it must
    // never be reported as same_level (or any other tier that implies a
    // known commercial relationship), even when geographic relevance is
    // otherwise strong.
    return "scale_unknown";
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

// Peaks at ratio=1 (100) and decays symmetrically on a log2 scale in either
// direction (a candidate 2x bigger or 2x smaller scores the same), so
// "commercial scale similarity" never rewards being much smaller over being
// much bigger or vice versa. Returns null (not a neutral 50) when no
// metric-matched ratio could be computed.
function scoreAudienceSimilarity(ratio: number | null): number | null {
  if (ratio === null || ratio <= 0) {
    return null;
  }
  const logDistance = Math.abs(Math.log2(ratio));
  return clampScore(Math.round(100 - 25 * logDistance));
}

// Distance-based comparison between the main artist's and the candidate's
// absolute scale (emerging/developing/established/major), both resolved via
// resolveAbsoluteScale above: same stage scores 100, one stage apart scores
// 65, two apart 30, three apart (emerging vs. major) 0. Null — not a
// neutral 50 — when either side's stage can't be resolved at all.
function scoreCareerStageSimilarity(mainScale: SimilarArtistAbsoluteScale, candidateScale: SimilarArtistAbsoluteScale): number | null {
  const mainRank = ABSOLUTE_SCALE_RANK[mainScale];
  const candidateRank = ABSOLUTE_SCALE_RANK[candidateScale];
  if (mainRank === null || candidateRank === null) {
    return null;
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

// Null — not a neutral 50 — when no Chartmetric growth data is available.
function scoreRecentActivity(chartmetricMetrics?: ChartmetricCandidateMetrics): number | null {
  const growth = averageGrowth(chartmetricMetrics);
  if (growth === null) {
    return null;
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

// Computes the weighted score using only the components that are actually
// available, with the remaining weights renormalized so they still sum to
// 1 (issue #201: "Calculate the weighted score only from available
// components, with normalized remaining weights"). `coverage` is the
// fraction of total weight backed by real data — since WEIGHTS already sums
// to 1, that's simply the sum of the available components' own weights.
// When coverage falls below minCoverageForScore, score is null: a
// candidate this thin on evidence gets no fabricated-looking number, even
// though its (necessarily partial) breakdown is still reported.
function calculateWeightedScore(
  components: SimilarArtistCommercialScoreComponents,
  minCoverageForScore: number
): { score: number | null; coverage: number } {
  const keys = Object.keys(WEIGHTS) as (keyof SimilarArtistCommercialScoreComponents)[];
  let availableWeight = 0;
  let weightedSum = 0;
  for (const key of keys) {
    const value = components[key];
    if (value === null) {
      continue;
    }
    availableWeight += WEIGHTS[key];
    weightedSum += value * WEIGHTS[key];
  }

  const coverage = clamp01(availableWeight);
  if (availableWeight <= 0 || coverage < minCoverageForScore) {
    return { score: null, coverage };
  }
  return { score: clampScore(Math.round(weightedSum / availableWeight)), coverage };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// Bands are anchored to minCoverageForScore so "low" always lines up with
// "commercialScore was withheld" — below that floor there genuinely isn't
// enough evidence to call the result more than low-confidence, regardless
// of how the always-available components (genre/geographic/cross-platform)
// happened to score.
function classifyConfidence(coverage: number, minCoverageForScore: number): SimilarArtistCommercialScoreConfidence {
  if (coverage <= 0) {
    return "unavailable";
  }
  if (coverage < minCoverageForScore) {
    return "low";
  }
  if (coverage < 0.85) {
    return "medium";
  }
  return "high";
}

function calculateWeightedScoreForExplanation(coverage: number): string {
  return `${Math.round(coverage * 100)}%`;
}

function buildExplanation(
  score: number | null,
  coverage: number,
  confidence: SimilarArtistCommercialScoreConfidence,
  components: SimilarArtistCommercialScoreComponents,
  tier: SimilarArtistCommercialTier,
  absoluteScale: SimilarArtistAbsoluteScale,
  audienceDataAvailable: boolean
): string {
  const scoreText = score === null ? "unavailable (insufficient data coverage)" : `${score}/100`;
  return [
    `Commercial-scale compatibility score: ${scoreText} (tier: ${tier}, absolute scale: ${absoluteScale}).`,
    `Data coverage: ${calculateWeightedScoreForExplanation(coverage)} (confidence: ${confidence}).`,
    `Genre compatibility: ${components.genreCompatibility}/100.`,
    `Audience similarity: ${formatComponent(components.audienceSimilarity)}${audienceDataAvailable ? "" : " (audience size unavailable)"}.`,
    `Career stage similarity: ${formatComponent(components.careerStageSimilarity)}.`,
    `Geographic relevance: ${components.geographicRelevance}/100.`,
    `Recent activity: ${formatComponent(components.recentActivity)}.`,
    `Cross-platform evidence: ${components.crossPlatformEvidence}/100.`
  ].join(" ");
}

function formatComponent(value: number | null): string {
  return value === null ? "unavailable" : `${value}/100`;
}
