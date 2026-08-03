// Issue #203: venues should be ranked by whether comparable artists actually
// played there, not by generic genre keywords or web-search popularity
// alone. This module implements the issue's suggested formula —
// venueCompatibilityScore = comparableArtistHistory + genreFit +
// artistScaleFit + geographicFit + recentProgrammingActivity +
// venueCapacityFit + sourceConfidence — as a weighted, explainable combine,
// following the same "compute from what's available, never fabricate the
// rest" convention as artistScaleScore.ts (issue #202): a component with no
// underlying evidence is left `null`, never coerced to a neutral value, and
// no single component can dominate the result beyond maxComponentShare.
import { clampScore } from "./evidenceSignals.js";

export interface VenueCompatibilityScoreComponents {
  comparableArtistHistory: number | null;
  genreFit: number | null;
  artistScaleFit: number | null;
  geographicFit: number | null;
  recentProgrammingActivity: number | null;
  venueCapacityFit: number | null;
  sourceConfidence: number | null;
}

export type VenueCompatibilityComponentWeights = Record<keyof VenueCompatibilityScoreComponents, number>;

export type VenueCompatibilityScoreConfidence = "high" | "medium" | "low" | "unavailable";

// Every field is optional/independently omittable so this scores partial
// evidence (a venue with only one dated concert, or only web-scraped
// evidence with no artist-scale data) rather than requiring full coverage.
export interface VenueCompatibilityScoreInput {
  // Number of distinct comparable (similar) artists with confirmed
  // historical evidence at this venue.
  comparableArtistCount: number;
  // Total number of relevant historical events found at this venue.
  relevantEventCount: number;
  // 0-100 genre-compatibility score between the venue's aggregated
  // programming genres and the analyzed artist's genres, e.g. from
  // matchBookingGenres(). Undefined when no genre evidence exists at all.
  genreFitScore?: number;
  // The analyzed artist's own 0-100 artist-scale score (issue #202), when
  // available.
  targetArtistScaleScore?: number;
  // Distribution of the comparable artists' own 0-100 artist-scale scores
  // who played this venue. Median drives the primary artistScaleFit signal;
  // min/max are exposed for explainability, not scored directly.
  venueArtistScaleMedian?: number;
  sameCity?: boolean;
  sameCountry?: boolean;
  // Great-circle distance in km between the venue and a caller-supplied
  // reference point (e.g. the artist's home city), when both are geocoded.
  distanceKm?: number;
  // Days since the most recent relevant event at this venue. Undefined when
  // no evidence carries a usable date (never assumed to be 0 or "now").
  latestEventDaysAgo?: number;
  estimatedCapacity?: number;
  // Average 0-1 confidence across every evidence record feeding this venue.
  sourceConfidenceAverage?: number;
  // Distinct providers/sources that independently corroborate this venue
  // (e.g. Bandsintown + a scraped official page) — more independent
  // agreement raises confidence beyond any single source's own score.
  independentSourceCount?: number;
  // True when merged sources disagree on a material fact for this venue
  // (e.g. two different reported capacities or cities) — the aggregation
  // layer resolves the displayed value by picking the higher-confidence
  // source but must never let sourceConfidence look artificially high when
  // the underlying evidence actually conflicts.
  conflictingSources?: boolean;
}

export interface VenueCompatibilityScoreOptions {
  weights?: VenueCompatibilityComponentWeights;
  // No single component may contribute more than this share of the final
  // weighted score, even after redistributing weight away from missing
  // components — same dominance cap as artistScaleScore.ts.
  maxComponentShare?: number;
  // Recency decays linearly from 100 (an event today) to a floor of
  // RECENCY_FLOOR at/after this many days — long enough to still credit a
  // real but older confirmed booking (issue: "retaining useful older
  // evidence") rather than dropping it to zero.
  recencyFullDecayDays?: number;
}

export interface VenueCompatibilityScoreResult {
  venueCompatibilityScore: number;
  confidence: VenueCompatibilityScoreConfidence;
  // Fraction (0-1) of the default component weight schedule backed by real
  // evidence.
  coverage: number;
  components: VenueCompatibilityScoreComponents;
  componentWeights: VenueCompatibilityComponentWeights;
  missingSignals: string[];
  explanation: string;
}

export const DEFAULT_COMPONENT_WEIGHTS: VenueCompatibilityComponentWeights = {
  comparableArtistHistory: 0.28,
  genreFit: 0.18,
  artistScaleFit: 0.16,
  geographicFit: 0.12,
  recentProgrammingActivity: 0.12,
  venueCapacityFit: 0.08,
  sourceConfidence: 0.06
};

export const DEFAULT_MAX_COMPONENT_SHARE = 0.55;
export const DEFAULT_RECENCY_FULL_DECAY_DAYS = 730;
const RECENCY_FLOOR = 15;

// Order-of-magnitude capacity bands expected for an artist at a given
// artist-scale score (0-100) — deliberately coarse (issue only asks for
// "capacity fit", not a precise venue-booking model). A capacity inside the
// band scores 100; distance outside the band decays linearly.
const EXPECTED_CAPACITY_BANDS: Array<{ maxScale: number; minCapacity: number; maxCapacity: number }> = [
  { maxScale: 20, minCapacity: 0, maxCapacity: 200 },
  { maxScale: 40, minCapacity: 50, maxCapacity: 400 },
  { maxScale: 55, minCapacity: 150, maxCapacity: 800 },
  { maxScale: 70, minCapacity: 400, maxCapacity: 2000 },
  { maxScale: 85, minCapacity: 800, maxCapacity: 5000 },
  { maxScale: 100, minCapacity: 2000, maxCapacity: 20000 }
];

// Comparable-artist-history counts saturate rather than growing unbounded —
// a venue with 8+ independent comparable-artist confirmations is already as
// strong a signal as one with 20.
const COMPARABLE_ARTIST_SATURATION = 6;
const RELEVANT_EVENT_SATURATION = 10;

export function scoreVenueCompatibility(
  input: VenueCompatibilityScoreInput,
  options: VenueCompatibilityScoreOptions = {}
): VenueCompatibilityScoreResult {
  const weights = options.weights ?? DEFAULT_COMPONENT_WEIGHTS;
  const maxComponentShare = options.maxComponentShare ?? DEFAULT_MAX_COMPONENT_SHARE;
  const recencyFullDecayDays = options.recencyFullDecayDays ?? DEFAULT_RECENCY_FULL_DECAY_DAYS;

  const components: VenueCompatibilityScoreComponents = {
    comparableArtistHistory: scoreComparableArtistHistory(input),
    genreFit: input.genreFitScore === undefined ? null : clampScore(Math.round(input.genreFitScore)),
    artistScaleFit: scoreArtistScaleFit(input),
    geographicFit: scoreGeographicFit(input),
    recentProgrammingActivity: scoreRecentProgrammingActivity(input, recencyFullDecayDays),
    venueCapacityFit: scoreCapacityFit(input),
    sourceConfidence: scoreSourceConfidence(input)
  };

  const componentKeys = Object.keys(weights) as (keyof VenueCompatibilityComponentWeights)[];
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
  const venueCompatibilityScore = coverage > 0 ? clampScore(Math.round(weightedSum)) : 0;
  const confidence = classifyConfidence(coverage, input.independentSourceCount, input.conflictingSources);

  const componentWeights: VenueCompatibilityComponentWeights = {
    comparableArtistHistory: cappedShares.comparableArtistHistory ?? 0,
    genreFit: cappedShares.genreFit ?? 0,
    artistScaleFit: cappedShares.artistScaleFit ?? 0,
    geographicFit: cappedShares.geographicFit ?? 0,
    recentProgrammingActivity: cappedShares.recentProgrammingActivity ?? 0,
    venueCapacityFit: cappedShares.venueCapacityFit ?? 0,
    sourceConfidence: cappedShares.sourceConfidence ?? 0
  };

  return {
    venueCompatibilityScore,
    confidence,
    coverage,
    components,
    componentWeights,
    missingSignals: resolveMissingSignals(components),
    explanation: buildExplanation(input, { venueCompatibilityScore, confidence, coverage, components })
  };
}

function scoreComparableArtistHistory(input: VenueCompatibilityScoreInput): number | null {
  if (input.comparableArtistCount <= 0) {
    return input.relevantEventCount > 0 ? 0 : null;
  }
  const artistSaturation = Math.min(1, input.comparableArtistCount / COMPARABLE_ARTIST_SATURATION);
  const eventSaturation = Math.min(1, input.relevantEventCount / RELEVANT_EVENT_SATURATION);
  // Weighted toward distinct-artist count (independent confirmations matter
  // more than repeat events from the same artist) but event volume still
  // contributes.
  return clampScore(Math.round((artistSaturation * 0.7 + eventSaturation * 0.3) * 100));
}

function scoreArtistScaleFit(input: VenueCompatibilityScoreInput): number | null {
  if (input.targetArtistScaleScore === undefined || input.venueArtistScaleMedian === undefined) {
    return null;
  }
  const diff = Math.abs(input.targetArtistScaleScore - input.venueArtistScaleMedian);
  return clampScore(Math.round(100 - diff * 1.2));
}

function scoreGeographicFit(input: VenueCompatibilityScoreInput): number | null {
  if (input.distanceKm !== undefined) {
    if (input.distanceKm <= 30) return 100;
    if (input.distanceKm >= 800) return 10;
    return clampScore(Math.round(100 - ((input.distanceKm - 30) / (800 - 30)) * 90));
  }
  if (input.sameCity) return 95;
  if (input.sameCountry) return 60;
  if (input.sameCity === false && input.sameCountry === false) return 20;
  return null;
}

function scoreRecentProgrammingActivity(input: VenueCompatibilityScoreInput, fullDecayDays: number): number | null {
  if (input.latestEventDaysAgo === undefined) {
    return null;
  }
  if (input.latestEventDaysAgo <= 0) return 100;
  if (input.latestEventDaysAgo >= fullDecayDays) return RECENCY_FLOOR;
  const decayed = 100 - (input.latestEventDaysAgo / fullDecayDays) * (100 - RECENCY_FLOOR);
  return clampScore(Math.round(decayed));
}

function scoreCapacityFit(input: VenueCompatibilityScoreInput): number | null {
  if (input.estimatedCapacity === undefined || input.targetArtistScaleScore === undefined) {
    return null;
  }
  const band = EXPECTED_CAPACITY_BANDS.find((candidate) => input.targetArtistScaleScore! <= candidate.maxScale)
    ?? EXPECTED_CAPACITY_BANDS[EXPECTED_CAPACITY_BANDS.length - 1];
  if (input.estimatedCapacity >= band.minCapacity && input.estimatedCapacity <= band.maxCapacity) {
    return 100;
  }
  const span = band.maxCapacity - band.minCapacity;
  const distance = input.estimatedCapacity < band.minCapacity
    ? band.minCapacity - input.estimatedCapacity
    : input.estimatedCapacity - band.maxCapacity;
  return clampScore(Math.round(100 - (distance / span) * 100));
}

function scoreSourceConfidence(input: VenueCompatibilityScoreInput): number | null {
  if (input.sourceConfidenceAverage === undefined) {
    return null;
  }
  const base = clampScore(Math.round(input.sourceConfidenceAverage * 100));
  const independenceBonus = Math.min(15, Math.max(0, (input.independentSourceCount ?? 1) - 1) * 8);
  // Conflicting sources never get to look more confident just because
  // several disagreeing sources happened to mention the venue.
  const conflictPenalty = input.conflictingSources ? 20 : 0;
  return clampScore(base + independenceBonus - conflictPenalty);
}

// Same capped-redistribution algorithm as artistScaleScore.ts's
// capComponentShares: caps any share above maxShare and redistributes the
// excess proportionally among not-yet-capped shares.
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

const CONFIDENCE_RANK: VenueCompatibilityScoreConfidence[] = ["unavailable", "low", "medium", "high"];

function classifyConfidence(
  coverage: number,
  independentSourceCount: number | undefined,
  conflictingSources: boolean | undefined
): VenueCompatibilityScoreConfidence {
  let level: VenueCompatibilityScoreConfidence;
  if (coverage <= 0) {
    level = "unavailable";
  } else if (coverage <= 0.4) {
    level = "low";
  } else if (coverage < 0.75) {
    level = "medium";
  } else {
    level = "high";
  }

  if (conflictingSources) {
    level = downgradeConfidence(level);
  }
  if ((independentSourceCount ?? 0) <= 1 && level === "high") {
    level = "medium";
  }

  return level;
}

function downgradeConfidence(level: VenueCompatibilityScoreConfidence): VenueCompatibilityScoreConfidence {
  const index = CONFIDENCE_RANK.indexOf(level);
  return CONFIDENCE_RANK[Math.max(1, index - 1)];
}

function resolveMissingSignals(components: VenueCompatibilityScoreComponents): string[] {
  return (Object.keys(components) as (keyof VenueCompatibilityScoreComponents)[])
    .filter((key) => components[key] === null);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildExplanation(
  input: VenueCompatibilityScoreInput,
  details: {
    venueCompatibilityScore: number;
    confidence: VenueCompatibilityScoreConfidence;
    coverage: number;
    components: VenueCompatibilityScoreComponents;
  }
): string {
  const historyText = input.comparableArtistCount > 0
    ? `${input.comparableArtistCount} comparable artist(s) with ${input.relevantEventCount} relevant event(s).`
    : "No comparable-artist history evidence.";

  return [
    `Venue compatibility score: ${details.venueCompatibilityScore}/100 (confidence: ${details.confidence}).`,
    `Data coverage: ${Math.round(details.coverage * 100)}%.`,
    `Comparable-artist history: ${historyText}`,
    `Genre fit: ${formatComponent(details.components.genreFit)}.`,
    `Artist-scale fit: ${formatComponent(details.components.artistScaleFit)}.`,
    `Geographic fit: ${formatComponent(details.components.geographicFit)}.`,
    `Recent programming activity: ${formatComponent(details.components.recentProgrammingActivity)}.`,
    `Venue capacity fit: ${formatComponent(details.components.venueCapacityFit)}.`,
    `Source confidence: ${formatComponent(details.components.sourceConfidence)}${input.conflictingSources ? " (sources disagree on some facts)" : ""}.`
  ].join(" ");
}

function formatComponent(value: number | null): string {
  return value === null ? "unavailable" : `${value}/100`;
}
