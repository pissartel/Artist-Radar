import type { BookingGenreMatchLevel } from "../../booking/genreMatching.js";

export interface TicketmasterScoreComponents {
  genreScore: number;
  locationScore: number;
  similarArtistScore: number;
  venueScore: number;
  artistSizeScore: number;
  opportunitySignalScore: number;
  dataConfidenceScore: number;
}

/**
 * ticketmasterOpportunityScore weighting from issue #189. Each component is
 * expected on a 0-1 scale; the result is clamped to 0-1. This score is
 * carried as evidence/confidence input for the shared booking scorer
 * (src/booking/scoring.ts) — it is not a second, independent ranking
 * authority.
 */
export function computeTicketmasterOpportunityScore(components: TicketmasterScoreComponents): number {
  const total =
    components.genreScore * 0.25 +
    components.locationScore * 0.20 +
    components.similarArtistScore * 0.20 +
    components.venueScore * 0.15 +
    components.artistSizeScore * 0.10 +
    components.opportunitySignalScore * 0.05 +
    components.dataConfidenceScore * 0.05;
  return clamp01(total);
}

/**
 * A generic classification (Rock, Pop, Music) scores lower than a specific
 * one even at the same match level, so e.g. a pop-punk artist's exact-genre
 * "Punk" match outranks a same-level but generic "Rock" match (issue #189).
 */
export function genreScoreFromMatch(level: BookingGenreMatchLevel, isGenericClassification: boolean): number {
  switch (level) {
    case "exact":
      return isGenericClassification ? 0.6 : 1;
    case "related":
      return isGenericClassification ? 0.4 : 0.75;
    case "generic":
      return 0.3;
    case "incompatible":
      return 0;
    default:
      return 0.2;
  }
}

export function locationScoreFromRadius(radiusKm: number, effectiveRadiusKm: number): number {
  if (effectiveRadiusKm <= 0) {
    return 0.5;
  }
  const ratio = 1 - Math.min(1, radiusKm / effectiveRadiusKm);
  return clamp01(0.5 + ratio * 0.5);
}

export function similarArtistScoreFromCompatibility(compatibilityScore: number | undefined): number {
  if (typeof compatibilityScore !== "number") {
    return 0.3;
  }
  return clamp01(compatibilityScore / 100);
}

export function venueScoreFromEvidenceCount(matchingArtistCount: number): number {
  if (matchingArtistCount <= 0) {
    return 0.3;
  }
  return clamp01(0.5 + Math.min(0.5, (matchingArtistCount - 1) * 0.15));
}

export function opportunitySignalScoreFromLineup(supportSlotSignal: "possible" | "unlikely" | "unknown"): number {
  if (supportSlotSignal === "possible") return 0.8;
  if (supportSlotSignal === "unlikely") return 0.2;
  return 0.4;
}

export function dataConfidenceScoreFromCompleteness(hasVenue: boolean, hasClassification: boolean, hasUrl: boolean): number {
  const signals = [hasVenue, hasClassification, hasUrl].filter(Boolean).length;
  return clamp01(0.25 + signals * 0.25);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
