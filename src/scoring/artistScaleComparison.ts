// Issue #219: positions the analyzed artist's artistScaleScore (see
// artistScaleScore.ts) against the artistScaleScore already computed for
// every similar artist, so a user can see where they stand within their own
// musical ecosystem — not just an absolute 0-100 number in isolation.
//
// Every statistic here is derived only from real, already-computed scores:
// a similar artist without enough underlying data to produce a score (see
// artistScaleScore.ts's `coverage`/`confidence` gating) is simply excluded
// from the sample, never coerced to 0 or a neutral value. When too few
// similar artists have a real score, or the analyzed artist has none at all,
// `available` is false and every comparison figure is left `null` — the
// issue's "hide the comparison rather than displaying misleading
// information" requirement, enforced on the backend as well as the frontend.
import { clampScore } from "./evidenceSignals.js";

export type ArtistScaleComparisonClassification =
  | "well_below"
  | "slightly_below"
  | "in_line"
  | "slightly_above"
  | "well_above";

export type ArtistScaleComparisonUnavailableReason =
  | "main_artist_score_unavailable"
  | "insufficient_similar_artist_scores";

export interface ArtistScaleComparisonThresholds {
  // Minimum number of similar artists with a real (non-null) artistScaleScore
  // required before a percentile-based comparison is considered meaningful
  // enough to display.
  minSimilarArtistScores: number;
  // Percentile-rank distance from the median (50) within which the analyzed
  // artist is classified "in line" with similar artists.
  inLineMaxPercentileDistance: number;
  // Percentile-rank distance from the median at or beyond which the analyzed
  // artist is classified "well" above/below, rather than "slightly".
  wellBeyondMinPercentileDistance: number;
}

export const DEFAULT_ARTIST_SCALE_COMPARISON_THRESHOLDS: ArtistScaleComparisonThresholds = {
  minSimilarArtistScores: 3,
  inLineMaxPercentileDistance: 10,
  wellBeyondMinPercentileDistance: 25
};

export interface ArtistScaleComparisonResult {
  available: boolean;
  reason?: ArtistScaleComparisonUnavailableReason;
  // Count of similar artists with a real, non-null artistScaleScore — the
  // actual sample size backing every statistic below, independent of how
  // many similar artists were discovered in total.
  sampleSize: number;
  median: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  // Percentile rank (0-100) of the analyzed artist's score within the
  // similar-artist sample. Only populated when `available` is true.
  percentile: number | null;
  differenceToMedian: number | null;
  differenceToAverage: number | null;
  classification: ArtistScaleComparisonClassification | null;
}

export function compareArtistScaleToSimilarArtists(
  mainArtistScore: number | null,
  similarArtistScores: number[],
  thresholds: ArtistScaleComparisonThresholds = DEFAULT_ARTIST_SCALE_COMPARISON_THRESHOLDS
): ArtistScaleComparisonResult {
  const sample = similarArtistScores.filter((score): score is number => typeof score === "number" && !Number.isNaN(score));
  const sampleSize = sample.length;

  const descriptiveStats = sampleSize > 0 ? computeDescriptiveStats(sample) : null;

  if (sampleSize < thresholds.minSimilarArtistScores) {
    return {
      available: false,
      reason: "insufficient_similar_artist_scores",
      sampleSize,
      median: descriptiveStats?.median ?? null,
      average: descriptiveStats?.average ?? null,
      minimum: descriptiveStats?.minimum ?? null,
      maximum: descriptiveStats?.maximum ?? null,
      percentile: null,
      differenceToMedian: null,
      differenceToAverage: null,
      classification: null
    };
  }

  if (mainArtistScore === null) {
    return {
      available: false,
      reason: "main_artist_score_unavailable",
      sampleSize,
      median: descriptiveStats?.median ?? null,
      average: descriptiveStats?.average ?? null,
      minimum: descriptiveStats?.minimum ?? null,
      maximum: descriptiveStats?.maximum ?? null,
      percentile: null,
      differenceToMedian: null,
      differenceToAverage: null,
      classification: null
    };
  }

  const stats = descriptiveStats as DescriptiveStats;
  const percentile = computePercentileRank(mainArtistScore, sample);
  const classification = classifyComparison(percentile, thresholds);

  return {
    available: true,
    sampleSize,
    median: stats.median,
    average: stats.average,
    minimum: stats.minimum,
    maximum: stats.maximum,
    percentile,
    differenceToMedian: roundDifference(mainArtistScore - stats.median),
    differenceToAverage: roundDifference(mainArtistScore - stats.average),
    classification
  };
}

interface DescriptiveStats {
  median: number;
  average: number;
  minimum: number;
  maximum: number;
}

function computeDescriptiveStats(sample: number[]): DescriptiveStats {
  const sorted = [...sample].sort((a, b) => a - b);
  return {
    median: roundStat(computeMedian(sorted)),
    average: roundStat(sample.reduce((sum, value) => sum + value, 0) / sample.length),
    minimum: roundStat(sorted[0]),
    maximum: roundStat(sorted[sorted.length - 1])
  };
}

function computeMedian(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// Mean-rank percentile: a score exactly equal to the whole sample lands at
// the 50th percentile (rather than being biased to 0 or 100 by an arbitrary
// tie-breaking rule), and the result is a rank — not a value-magnitude
// comparison — so a single extreme outlier in the sample can't distort where
// the analyzed artist appears relative to everyone else.
function computePercentileRank(value: number, sample: number[]): number {
  const below = sample.filter((score) => score < value).length;
  const equal = sample.filter((score) => score === value).length;
  return clampScore(Math.round(((below + equal / 2) / sample.length) * 100));
}

function classifyComparison(
  percentile: number,
  thresholds: ArtistScaleComparisonThresholds
): ArtistScaleComparisonClassification {
  const distance = percentile - 50;
  const absDistance = Math.abs(distance);

  if (absDistance <= thresholds.inLineMaxPercentileDistance) {
    return "in_line";
  }
  if (absDistance >= thresholds.wellBeyondMinPercentileDistance) {
    return distance > 0 ? "well_above" : "well_below";
  }
  return distance > 0 ? "slightly_above" : "slightly_below";
}

function roundStat(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundDifference(value: number): number {
  return Math.round(value * 10) / 10;
}
