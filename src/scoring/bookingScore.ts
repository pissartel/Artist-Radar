import { scoreGenreCompatibility } from "./genreCompatibility.js";
import { clampScore, scoreEvidenceQuality, scoreRecency, scoreSourceConfidence, type EvidenceSignal } from "./evidenceSignals.js";

export type BookingArtistLevel = "unknown" | "emerging" | "developing" | "established";

export interface BookingScoreOpportunityInput {
  type: string;
  city: string | null;
  reason: string;
  contact: string | null;
  evidence: EvidenceSignal[];
}

export interface BookingScoreInput {
  targetGenre: string;
  artistCity: string;
  artistTarget?: string | null;
  artistLevel?: BookingArtistLevel;
  opportunity: BookingScoreOpportunityInput;
}

/** The seven deterministic score components required by issue #48, always visible on the result for debugging. */
export interface BookingScoreComponents {
  genreCompatibilityScore: number;
  evidenceQualityScore: number;
  recencyScore: number;
  locationScore: number;
  artistSizeFitScore: number;
  contactabilityScore: number;
  sourceConfidenceScore: number;
}

export interface BookingRelevanceScore {
  score: number;
  components: BookingScoreComponents;
  explanation: string;
}

const WEIGHTS: Record<keyof BookingScoreComponents, number> = {
  genreCompatibilityScore: 0.3,
  evidenceQualityScore: 0.15,
  recencyScore: 0.1,
  locationScore: 0.15,
  artistSizeFitScore: 0.1,
  contactabilityScore: 0.1,
  sourceConfidenceScore: 0.1
};

const TYPE_SCALE: Record<string, "small" | "medium" | "large"> = {
  bar: "small",
  collective: "small",
  association: "small",
  venue: "medium",
  event: "medium",
  promoter: "medium",
  live_producer: "medium",
  springboard: "medium",
  open_call: "medium",
  festival: "large",
  booking_agency: "large"
};

const SIZE_FIT_MATRIX: Record<BookingArtistLevel, Record<"small" | "medium" | "large" | "unknown", number>> = {
  emerging: { small: 90, medium: 70, large: 35, unknown: 50 },
  developing: { small: 60, medium: 85, large: 60, unknown: 50 },
  established: { small: 40, medium: 65, large: 90, unknown: 50 },
  unknown: { small: 55, medium: 55, large: 55, unknown: 50 }
};

/**
 * Computes the deterministic relevance score for a booking opportunity in
 * code (issue #48). Independent of any AI judge pass: the AI judge may
 * explain or flag this score, but never replaces it.
 */
export function scoreBookingRelevance(input: BookingScoreInput): BookingRelevanceScore {
  const { opportunity } = input;
  const evidenceText = buildEvidenceText(opportunity);

  const genreResult = scoreGenreCompatibility(input.targetGenre, { sourceText: `${opportunity.type} ${opportunity.reason} ${evidenceText}` });

  const components: BookingScoreComponents = {
    genreCompatibilityScore: genreResult.score,
    evidenceQualityScore: scoreEvidenceQuality(opportunity.evidence),
    recencyScore: scoreRecency(opportunity.evidence),
    locationScore: scoreLocationFit(input),
    artistSizeFitScore: scoreArtistSizeFit(opportunity.type, input.artistLevel ?? "unknown"),
    contactabilityScore: scoreContactability(opportunity.contact),
    sourceConfidenceScore: scoreSourceConfidence(opportunity.evidence)
  };

  const score = calculateTotal(components);

  return {
    score,
    components,
    explanation: buildExplanation(opportunity, genreResult.level, components, score)
  };
}

function scoreLocationFit(input: BookingScoreInput): number {
  const opportunityCity = normalize(input.opportunity.city ?? "");
  const artistCity = normalize(input.artistCity);
  const artistTarget = normalize(input.artistTarget ?? "");

  if (!opportunityCity) {
    return 45;
  }
  if (opportunityCity === artistCity) {
    return 95;
  }
  if (artistTarget && (opportunityCity.includes(artistTarget) || artistTarget.includes(opportunityCity))) {
    return 75;
  }
  return 55;
}

function scoreArtistSizeFit(type: string, artistLevel: BookingArtistLevel): number {
  const scale = TYPE_SCALE[normalize(type)] ?? "unknown";
  return SIZE_FIT_MATRIX[artistLevel][scale];
}

function scoreContactability(contact: string | null): number {
  if (!contact) {
    return 20;
  }
  return contact.includes("@") ? 90 : 65;
}

function calculateTotal(components: BookingScoreComponents): number {
  const total = (Object.keys(WEIGHTS) as (keyof BookingScoreComponents)[]).reduce(
    (sum, key) => sum + components[key] * WEIGHTS[key],
    0
  );
  return clampScore(Math.round(total));
}

function buildExplanation(
  opportunity: BookingScoreOpportunityInput,
  genreLevel: string,
  components: BookingScoreComponents,
  score: number
): string {
  return [
    `Deterministic relevance score for "${opportunity.type}" opportunity: ${score}/100.`,
    `Genre compatibility: ${components.genreCompatibilityScore}/100 (${genreLevel}).`,
    `Evidence quality: ${components.evidenceQualityScore}/100.`,
    `Source recency: ${components.recencyScore}/100.`,
    `Location fit: ${components.locationScore}/100.`,
    `Artist size fit: ${components.artistSizeFitScore}/100.`,
    `Contactability: ${components.contactabilityScore}/100.`,
    `Source confidence: ${components.sourceConfidenceScore}/100.`
  ].join(" ");
}

function buildEvidenceText(opportunity: BookingScoreOpportunityInput): string {
  return opportunity.evidence.map((item) => item.snippet ?? "").join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
