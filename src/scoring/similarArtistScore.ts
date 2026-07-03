import { scoreGenreCompatibility } from "./genreCompatibility.js";
import { clampScore, scoreEvidenceQuality, scoreRecency, scoreSourceConfidence, type EvidenceSignal } from "./evidenceSignals.js";

export type SimilarArtistSizeTier = "small" | "medium" | "large" | "unknown";

export interface SimilarArtistScoreCandidateInput {
  genres: string[];
  city: string | null;
  country: string | null;
  url: string | null;
  sizeTier: SimilarArtistSizeTier;
  reason: string;
  evidence: EvidenceSignal[];
}

export interface SimilarArtistScoreInput {
  targetGenre: string;
  artistCity: string;
  artistTarget?: string | null;
  candidate: SimilarArtistScoreCandidateInput;
}

/** The seven deterministic score components required by issue #48, always visible on the result for debugging. */
export interface SimilarArtistScoreComponents {
  genreCompatibilityScore: number;
  evidenceQualityScore: number;
  recencyScore: number;
  geographicRelevanceScore: number;
  artistSizeFitScore: number;
  contactabilityScore: number;
  sourceConfidenceScore: number;
}

export interface SimilarArtistRelevanceScore {
  score: number;
  components: SimilarArtistScoreComponents;
  explanation: string;
}

const WEIGHTS: Record<keyof SimilarArtistScoreComponents, number> = {
  genreCompatibilityScore: 0.3,
  evidenceQualityScore: 0.15,
  recencyScore: 0.1,
  geographicRelevanceScore: 0.15,
  artistSizeFitScore: 0.1,
  contactabilityScore: 0.1,
  sourceConfidenceScore: 0.1
};

/**
 * Small/medium peers are more actionable booking-wise than large reference
 * artists (CLAUDE.md: do not recommend solely on popularity/audience size).
 */
const SIZE_TIER_SCORE: Record<SimilarArtistSizeTier, number> = {
  small: 80,
  medium: 85,
  large: 55,
  unknown: 50
};

/**
 * Computes the deterministic relevance score for a similar-artist candidate
 * in code (issue #48). Independent of any AI judge pass: the AI judge may
 * explain or flag this score, but never replaces it.
 */
export function scoreSimilarArtistRelevance(input: SimilarArtistScoreInput): SimilarArtistRelevanceScore {
  const { candidate } = input;
  const evidenceText = buildEvidenceText(candidate);

  const genreResult = scoreGenreCompatibility(input.targetGenre, {
    declaredGenres: candidate.genres,
    sourceText: `${candidate.reason} ${evidenceText}`
  });

  const components: SimilarArtistScoreComponents = {
    genreCompatibilityScore: genreResult.score,
    evidenceQualityScore: scoreEvidenceQuality(candidate.evidence),
    recencyScore: scoreRecency(candidate.evidence),
    geographicRelevanceScore: scoreGeographicRelevance(input),
    artistSizeFitScore: SIZE_TIER_SCORE[candidate.sizeTier],
    contactabilityScore: candidate.url ? 70 : 20,
    sourceConfidenceScore: scoreSourceConfidence(candidate.evidence)
  };

  const score = calculateTotal(components);

  return {
    score,
    components,
    explanation: buildExplanation(genreResult.level, components, score)
  };
}

function scoreGeographicRelevance(input: SimilarArtistScoreInput): number {
  const candidateCity = normalize(input.candidate.city ?? "");
  const candidateCountry = normalize(input.candidate.country ?? "");
  const artistCity = normalize(input.artistCity);
  const artistTarget = normalize(input.artistTarget ?? "");

  if (!candidateCity && !candidateCountry) {
    return 45;
  }
  if (candidateCity && candidateCity === artistCity) {
    return 95;
  }
  if (artistTarget && (candidateCity.includes(artistTarget) || candidateCountry.includes(artistTarget) || artistTarget.includes(candidateCountry))) {
    return 75;
  }
  return 55;
}

function calculateTotal(components: SimilarArtistScoreComponents): number {
  const total = (Object.keys(WEIGHTS) as (keyof SimilarArtistScoreComponents)[]).reduce(
    (sum, key) => sum + components[key] * WEIGHTS[key],
    0
  );
  return clampScore(Math.round(total));
}

function buildExplanation(genreLevel: string, components: SimilarArtistScoreComponents, score: number): string {
  return [
    `Deterministic relevance score: ${score}/100.`,
    `Genre compatibility: ${components.genreCompatibilityScore}/100 (${genreLevel}).`,
    `Evidence quality: ${components.evidenceQualityScore}/100.`,
    `Source recency: ${components.recencyScore}/100.`,
    `Geographic relevance: ${components.geographicRelevanceScore}/100.`,
    `Artist size fit: ${components.artistSizeFitScore}/100.`,
    `Contactability: ${components.contactabilityScore}/100.`,
    `Source confidence: ${components.sourceConfidenceScore}/100.`
  ].join(" ");
}

function buildEvidenceText(candidate: SimilarArtistScoreCandidateInput): string {
  return candidate.evidence.map((item) => item.snippet ?? "").join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
