// Issue #202: a normalized, cross-platform "artist scale score" — distinct
// from src/scoring/similarArtistScore.ts (musical/booking relevance) and
// src/scoring/similarArtistCommercialScore.ts (a *relative* candidate-vs-main
// comparison). This module produces an *absolute* size/scale reading for a
// single artist from whatever audience/growth/live-activity signals are
// available, so the same number can be used to compare the analyzed artist
// against similar artists, headliners, venue lineups and label rosters alike.
//
// Monthly listeners alone can be distorted by a single playlist placement or
// viral track (the issue's stated motivation), so every signal here is
// combined rather than trusted alone: skewed audience counts are normalized
// on a log scale, no single component's weight can exceed maxComponentShare
// of the final score even when other components are missing, and a
// component with no underlying data is left `null` — never coerced to a
// fabricated neutral value — following the same convention as
// similarArtistCommercialScore.ts.
import { clampScore } from "./evidenceSignals.js";

export type ArtistScaleBand =
  | "emerging"
  | "developing"
  | "established_local"
  | "regional"
  | "national"
  | "major";

export type ArtistScaleScoreConfidence = "high" | "medium" | "low" | "unavailable";

export interface ArtistScaleScoreComponents {
  streaming: number | null;
  social: number | null;
  // Null whenever no historical baseline was supplied — the issue requires
  // growth to stay hidden rather than fabricated when there's nothing to
  // compare against.
  growth: number | null;
  liveActivity: number | null;
}

export type ArtistScaleComponentWeights = Record<keyof ArtistScaleScoreComponents, number>;

export interface ScaleBandThreshold {
  band: ArtistScaleBand;
  minScore: number;
}

// Every field is optional and independently omittable so the score supports
// partial provider data (issue requirement). A field must only ever be set
// to a real, reported value — including a real reported zero (e.g.
// `recentShowCount: 0` for a confirmed-inactive artist) — never guessed.
export interface ArtistScaleScoreInput {
  chartmetricArtistScore?: number;
  spotifyMonthlyListeners?: number;
  spotifyFollowers?: number;
  youtubeSubscribers?: number;
  youtubeViews?: number;
  instagramFollowers?: number;
  tiktokFollowers?: number;
  deezerFans?: number;
  // Chartmetric's own 0-100 playlist-reach composite, when reported.
  playlistReachScore?: number;
  totalCurrentPlaylists?: number;
  // A generic pre-computed engagement metric (0-100), e.g. from a provider's
  // own engagement-rate composite. Left undefined when no such signal exists.
  engagementScore?: number;
  // Only ever supplied when a real historical baseline exists (issue: "Do
  // not display growth percentages when no historical baseline exists").
  listenerGrowthPercent?: number;
  followerGrowthPercent?: number;
  recentShowCount?: number;
  distinctCitiesRecent?: number;
  // Recency/confidence-of-source metadata (issue input: "data recency and
  // source confidence"), used to temper the confidence band, never the
  // numeric score itself.
  measuredAt?: string;
  matchConfidence?: "exact" | "high" | "medium" | "low";
}

export interface ArtistScaleScoreOptions {
  weights?: ArtistScaleComponentWeights;
  bands?: ScaleBandThreshold[];
  // No single component may contribute more than this share of the final
  // weighted score, even after redistributing weight away from missing
  // components (issue acceptance criterion: "No single platform can
  // dominate the result beyond a configured maximum").
  maxComponentShare?: number;
  now?: Date;
}

export interface ArtistScaleScoreResult {
  artistScaleScore: number;
  scaleBand: ArtistScaleBand;
  confidence: ArtistScaleScoreConfidence;
  // Fraction (0-1) of the default component weight schedule backed by real
  // data, independent of the dominance cap below.
  coverage: number;
  components: ArtistScaleScoreComponents;
  // The actual (post-cap, post-redistribution) weights used to combine
  // `components` into `artistScaleScore` — kept so the result is explainable
  // rather than a black box.
  componentWeights: ArtistScaleComponentWeights;
  missingSignals: string[];
  explanation: string;
}

export const DEFAULT_COMPONENT_WEIGHTS: ArtistScaleComponentWeights = {
  streaming: 0.4,
  social: 0.25,
  growth: 0.2,
  liveActivity: 0.15
};

export const DEFAULT_MAX_COMPONENT_SHARE = 0.6;

// Deliberately coarse and configurable — the issue only asks for example
// band names, not fixed thresholds.
export const DEFAULT_SCALE_BANDS: ScaleBandThreshold[] = [
  { band: "major", minScore: 85 },
  { band: "national", minScore: 70 },
  { band: "regional", minScore: 55 },
  { band: "established_local", minScore: 40 },
  { band: "developing", minScore: 20 },
  { band: "emerging", minScore: 0 }
];

// How stale `measuredAt` can be before a result is treated as lower-
// confidence even when coverage itself is high.
const STALE_DATA_THRESHOLD_DAYS = 180;

// Order-of-magnitude ceilings used to log-normalize heavily skewed audience
// counts (issue requirement) — a value at or above the reference maps to
// ~100, not an unbounded number a single viral spike could blow past.
const REFERENCE_MAX = {
  spotifyMonthlyListeners: 50_000_000,
  spotifyFollowers: 30_000_000,
  youtubeSubscribers: 30_000_000,
  youtubeViews: 5_000_000_000,
  instagramFollowers: 50_000_000,
  tiktokFollowers: 50_000_000,
  deezerFans: 10_000_000,
  totalCurrentPlaylists: 2_000,
  recentShowCount: 40,
  distinctCitiesRecent: 20
} as const;

const OPTIONAL_SIGNAL_KEYS: (keyof ArtistScaleScoreInput)[] = [
  "chartmetricArtistScore",
  "spotifyMonthlyListeners",
  "spotifyFollowers",
  "youtubeSubscribers",
  "youtubeViews",
  "instagramFollowers",
  "tiktokFollowers",
  "deezerFans",
  "playlistReachScore",
  "totalCurrentPlaylists",
  "engagementScore",
  "listenerGrowthPercent",
  "followerGrowthPercent",
  "recentShowCount",
  "distinctCitiesRecent"
];

export function scoreArtistScale(
  input: ArtistScaleScoreInput,
  options: ArtistScaleScoreOptions = {}
): ArtistScaleScoreResult {
  const weights = options.weights ?? DEFAULT_COMPONENT_WEIGHTS;
  const bands = options.bands ?? DEFAULT_SCALE_BANDS;
  const maxComponentShare = options.maxComponentShare ?? DEFAULT_MAX_COMPONENT_SHARE;
  const now = options.now ?? new Date();

  const components: ArtistScaleScoreComponents = {
    streaming: scoreStreamingComponent(input),
    social: scoreSocialComponent(input),
    growth: scoreGrowthComponent(input),
    liveActivity: scoreLiveActivityComponent(input)
  };

  const componentKeys = Object.keys(weights) as (keyof ArtistScaleComponentWeights)[];
  const presentKeys = componentKeys.filter((key) => components[key] !== null);
  const sumPresentDefaultWeight = presentKeys.reduce((sum, key) => sum + weights[key], 0);
  const coverage = clamp01(sumPresentDefaultWeight);

  const rawShares: Record<string, number> = {};
  for (const key of presentKeys) {
    rawShares[key] = weights[key] / sumPresentDefaultWeight;
  }
  const cappedShares = capComponentShares(rawShares, maxComponentShare);

  let weightedSum = 0;
  for (const key of presentKeys) {
    weightedSum += (cappedShares[key] ?? 0) * (components[key] as number);
  }
  const artistScaleScore = coverage > 0 ? clampScore(Math.round(weightedSum)) : 0;
  const scaleBand = resolveScaleBand(artistScaleScore, bands);
  const confidence = classifyConfidence(coverage, input.matchConfidence, input.measuredAt, now);

  const componentWeights: ArtistScaleComponentWeights = {
    streaming: cappedShares.streaming ?? 0,
    social: cappedShares.social ?? 0,
    growth: cappedShares.growth ?? 0,
    liveActivity: cappedShares.liveActivity ?? 0
  };

  return {
    artistScaleScore,
    scaleBand,
    confidence,
    coverage,
    components,
    componentWeights,
    missingSignals: resolveMissingSignals(input),
    explanation: buildExplanation({ artistScaleScore, scaleBand, confidence, coverage, components })
  };
}

interface WeightedMetric {
  value: number | null;
  weight: number;
}

// Combines whichever sub-metrics are present, renormalizing over just their
// own weights — the same "compute from what's available, don't fabricate
// the rest" technique used by similarArtistCommercialScore.ts's
// calculateWeightedScore.
function combineWeighted(metrics: WeightedMetric[]): number | null {
  const present = metrics.filter((metric): metric is { value: number; weight: number } => metric.value !== null);
  if (present.length === 0) {
    return null;
  }
  const totalWeight = present.reduce((sum, metric) => sum + metric.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }
  const weightedSum = present.reduce((sum, metric) => sum + metric.value * metric.weight, 0);
  return clampScore(Math.round(weightedSum / totalWeight));
}

function scoreStreamingComponent(input: ArtistScaleScoreInput): number | null {
  const playlistReach = input.playlistReachScore !== undefined
    ? clampScore(Math.round(input.playlistReachScore))
    : input.totalCurrentPlaylists !== undefined
      ? logScale(input.totalCurrentPlaylists, REFERENCE_MAX.totalCurrentPlaylists)
      : null;

  return combineWeighted([
    { value: valueOrNull(input.chartmetricArtistScore, clampScore), weight: 0.3 },
    { value: valueOrNull(input.spotifyMonthlyListeners, (v) => logScale(v, REFERENCE_MAX.spotifyMonthlyListeners)), weight: 0.25 },
    { value: valueOrNull(input.spotifyFollowers, (v) => logScale(v, REFERENCE_MAX.spotifyFollowers)), weight: 0.15 },
    { value: computeListenerFollowerRatioScore(input.spotifyMonthlyListeners, input.spotifyFollowers), weight: 0.1 },
    { value: valueOrNull(input.deezerFans, (v) => logScale(v, REFERENCE_MAX.deezerFans)), weight: 0.05 },
    { value: playlistReach, weight: 0.05 },
    { value: valueOrNull(input.engagementScore, clampScore), weight: 0.1 }
  ]);
}

function scoreSocialComponent(input: ArtistScaleScoreInput): number | null {
  return combineWeighted([
    { value: valueOrNull(input.instagramFollowers, (v) => logScale(v, REFERENCE_MAX.instagramFollowers)), weight: 0.35 },
    { value: valueOrNull(input.tiktokFollowers, (v) => logScale(v, REFERENCE_MAX.tiktokFollowers)), weight: 0.35 },
    { value: valueOrNull(input.youtubeSubscribers, (v) => logScale(v, REFERENCE_MAX.youtubeSubscribers)), weight: 0.2 },
    { value: valueOrNull(input.youtubeViews, (v) => logScale(v, REFERENCE_MAX.youtubeViews)), weight: 0.1 }
  ]);
}

// Null — not a fabricated neutral 50 — whenever neither growth percentage
// was supplied, i.e. no historical baseline exists for this artist.
function scoreGrowthComponent(input: ArtistScaleScoreInput): number | null {
  return combineWeighted([
    { value: valueOrNull(input.listenerGrowthPercent, growthPercentToScore), weight: 0.6 },
    { value: valueOrNull(input.followerGrowthPercent, growthPercentToScore), weight: 0.4 }
  ]);
}

// Centered at 0% growth -> 50/100, consistent with
// similarArtistCommercialScore.ts's scoreRecentActivity formula.
function growthPercentToScore(percent: number): number {
  return clampScore(Math.round(50 + percent * 1.5));
}

function scoreLiveActivityComponent(input: ArtistScaleScoreInput): number | null {
  return combineWeighted([
    { value: valueOrNull(input.recentShowCount, (v) => logScale(v, REFERENCE_MAX.recentShowCount)), weight: 0.65 },
    { value: valueOrNull(input.distinctCitiesRecent, (v) => logScale(v, REFERENCE_MAX.distinctCitiesRecent)), weight: 0.35 }
  ]);
}

// Listener-to-follower ratio (issue input): a healthy, organically-grown
// fanbase tends to have monthly listeners in the same order of magnitude as
// followers; ratio*45 maps a ratio of ~2.2 (strong reach relative to
// dedicated followers) to a full 100.
function computeListenerFollowerRatioScore(listeners: number | undefined, followers: number | undefined): number | null {
  if (listeners === undefined || followers === undefined || followers <= 0) {
    return null;
  }
  return clampScore(Math.round((listeners / followers) * 45));
}

function valueOrNull(value: number | undefined, transform: (value: number) => number): number | null {
  return value === undefined ? null : transform(value);
}

function logScale(value: number, refMax: number): number {
  const safeValue = Math.max(0, value);
  if (refMax <= 0) {
    return 0;
  }
  return clampScore(Math.round((100 * Math.log10(1 + safeValue)) / Math.log10(1 + refMax)));
}

// Caps any share exceeding maxShare and redistributes the excess
// proportionally among the not-yet-capped shares, iterating (bounded by the
// number of components) in case a redistribution itself pushes another
// share over the cap. When every present component is already at/above the
// cap (only possible with a single present component, or a maxShare below
// 1/keyCount), the excess is left unallocated rather than forced onto an
// already-capped component — that unallocated weight is what dampens the
// final score for a single-signal-only result.
function capComponentShares(rawShares: Record<string, number>, maxShare: number): Record<string, number> {
  let shares = { ...rawShares };
  const keyCount = Object.keys(shares).length;

  for (let iteration = 0; iteration < keyCount; iteration++) {
    const overCapped = Object.entries(shares).filter(([, value]) => value > maxShare + 1e-9);
    if (overCapped.length === 0) {
      break;
    }

    const next: Record<string, number> = {};
    let excess = 0;
    for (const [key, value] of Object.entries(shares)) {
      if (value > maxShare) {
        next[key] = maxShare;
        excess += value - maxShare;
      } else {
        next[key] = value;
      }
    }

    const underCappedKeys = Object.keys(next).filter((key) => next[key] < maxShare - 1e-9);
    const underCappedTotal = underCappedKeys.reduce((sum, key) => sum + shares[key], 0);
    if (underCappedKeys.length === 0 || underCappedTotal <= 0) {
      shares = next;
      break;
    }

    for (const key of underCappedKeys) {
      next[key] += (shares[key] / underCappedTotal) * excess;
    }
    shares = next;
  }

  return shares;
}

function resolveScaleBand(score: number, bands: ScaleBandThreshold[]): ArtistScaleBand {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  const match = sorted.find((band) => score >= band.minScore);
  return match?.band ?? sorted[sorted.length - 1]?.band ?? "emerging";
}

const CONFIDENCE_RANK: ArtistScaleScoreConfidence[] = ["unavailable", "low", "medium", "high"];

function classifyConfidence(
  coverage: number,
  matchConfidence: ArtistScaleScoreInput["matchConfidence"],
  measuredAt: string | undefined,
  now: Date
): ArtistScaleScoreConfidence {
  let level: ArtistScaleScoreConfidence;
  if (coverage <= 0) {
    level = "unavailable";
  } else if (coverage <= 0.4) {
    level = "low";
  } else if (coverage < 0.75) {
    level = "medium";
  } else {
    level = "high";
  }

  if (matchConfidence === "low") {
    level = minConfidence(level, "low");
  } else if (matchConfidence === "medium") {
    level = minConfidence(level, "medium");
  }

  if (measuredAt && isStale(measuredAt, now)) {
    level = downgradeConfidence(level);
  }

  return level;
}

function minConfidence(a: ArtistScaleScoreConfidence, b: ArtistScaleScoreConfidence): ArtistScaleScoreConfidence {
  return CONFIDENCE_RANK.indexOf(a) <= CONFIDENCE_RANK.indexOf(b) ? a : b;
}

// Floors at "low" — staleness alone should never make a result look like it
// has no data at all when it clearly does.
function downgradeConfidence(level: ArtistScaleScoreConfidence): ArtistScaleScoreConfidence {
  const index = CONFIDENCE_RANK.indexOf(level);
  return CONFIDENCE_RANK[Math.max(1, index - 1)];
}

function isStale(measuredAt: string, now: Date): boolean {
  const parsed = Date.parse(measuredAt);
  if (Number.isNaN(parsed)) {
    return false;
  }
  const daysAgo = (now.getTime() - parsed) / (1000 * 60 * 60 * 24);
  return daysAgo > STALE_DATA_THRESHOLD_DAYS;
}

function resolveMissingSignals(input: ArtistScaleScoreInput): string[] {
  return OPTIONAL_SIGNAL_KEYS.filter((key) => input[key] === undefined);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildExplanation(details: {
  artistScaleScore: number;
  scaleBand: ArtistScaleBand;
  confidence: ArtistScaleScoreConfidence;
  coverage: number;
  components: ArtistScaleScoreComponents;
}): string {
  // Issue requirement: never display a growth percentage/score-derived
  // statement implying a trend when no historical baseline exists.
  const growthText = details.components.growth === null
    ? "Growth: no historical baseline available."
    : `Growth: ${details.components.growth}/100 relative to its trailing-period baseline.`;

  return [
    `Artist scale score: ${details.artistScaleScore}/100 (band: ${details.scaleBand}).`,
    `Data coverage: ${Math.round(details.coverage * 100)}% (confidence: ${details.confidence}).`,
    `Streaming: ${formatComponent(details.components.streaming)}.`,
    `Social: ${formatComponent(details.components.social)}.`,
    growthText,
    `Live activity: ${formatComponent(details.components.liveActivity)}.`
  ].join(" ");
}

function formatComponent(value: number | null): string {
  return value === null ? "unavailable" : `${value}/100`;
}
