import { pickBestContact } from "./contactExtraction.js";
import { analyzeSupportSlotPotential } from "./supportSlotPotential.js";
import type { BookingScore, BookingSearchInput, BookingTarget } from "./types.js";
import type { DateProximityResult } from "./dateProximity.js";

// Structured, backend-computed match factors (issue #130 review feedback):
// the frontend must never parse a human-readable "why this matches" prose
// string. Every factor here is derived from real target/score data; nothing
// is invented, and a factor is simply omitted when the evidence is
// insufficient to support a positive or negative claim.

export type MatchFactorCode =
  | "genre_match"
  | "location_match"
  | "date_lead_time"
  | "capacity_fit"
  | "similar_artist_signal"
  | "support_slot_signal"
  | "contact_available"
  | "lineup_availability"
  | "source_confidence"
  | "data_completeness";

export type MatchFactorImpact = "positive" | "negative" | "neutral";

export interface MatchFactor {
  code: MatchFactorCode;
  label: string;
  detail?: string;
  impact: MatchFactorImpact;
  scoreContribution?: number;
}

export interface OpportunityMatchBreakdown {
  overallScore: number;
  positiveFactors: MatchFactor[];
  negativeFactors: MatchFactor[];
  // Missing/unverified information (e.g. "capacity unknown"), kept separate
  // from negativeFactors so unknown information is never presented as a
  // confirmed risk (issue #130 review feedback).
  neutralFactors: MatchFactor[];
}

const EVENT_LIKE_CATEGORIES = new Set(["event", "festival"]);

export function buildMatchFactors(
  input: BookingSearchInput,
  target: BookingTarget,
  score: BookingScore,
  dateProximity: DateProximityResult,
  overallScore: number
): OpportunityMatchBreakdown {
  const factors: MatchFactor[] = [
    buildGenreFactor(target, score),
    buildLocationFactor(input, target, score),
    dateProximity.factor,
    buildCapacityFactor(target, score),
    buildSimilarArtistFactor(target),
    buildContactFactor(target),
    buildSourceConfidenceFactor(score),
    buildDataCompletenessFactor(target)
  ].filter((factor): factor is MatchFactor => factor !== null);

  const { support, lineup } = buildSupportSlotFactors(input, target);
  if (support) factors.push(support);
  if (lineup) factors.push(lineup);

  return {
    overallScore,
    positiveFactors: factors.filter((factor) => factor.impact === "positive"),
    negativeFactors: factors.filter((factor) => factor.impact === "negative"),
    neutralFactors: factors.filter((factor) => factor.impact === "neutral")
  };
}

function buildGenreFactor(target: BookingTarget, score: BookingScore): MatchFactor | null {
  if (score.genreLevel === "exact") {
    return { code: "genre_match", label: "Genre matches the artist", impact: "positive", scoreContribution: score.genreFit };
  }
  if (score.genreLevel === "related") {
    return {
      code: "genre_match",
      label: "Genre is closely related to the artist's",
      impact: "positive",
      scoreContribution: score.genreFit
    };
  }
  if (target.category === "venue" && !hasExplicitVenueGenreEvidence(target, score)) {
    return null;
  }
  if (score.genreFit < 50) {
    return {
      code: "genre_match",
      label: target.category === "venue" ? "Venue may focus on a different genre" : "Genre match is uncertain",
      detail: target.category === "venue"
        ? "Available venue evidence points to a different genre than the artist's."
        : "Genre fit is weak or unconfirmed for this opportunity.",
      impact: "negative",
      scoreContribution: score.genreFit
    };
  }
  return null;
}

function hasExplicitVenueGenreEvidence(target: BookingTarget, score: BookingScore): boolean {
  if (target.category !== "venue") return true;
  return score.genreLevel === "incompatible";
}

function buildLocationFactor(input: BookingSearchInput, target: BookingTarget, score: BookingScore): MatchFactor | null {
  if (score.locationFit >= 80) {
    return { code: "location_match", label: "Located in a target city", impact: "positive", scoreContribution: score.locationFit };
  }
  if (!target.city && !target.country) {
    return {
      code: "location_match",
      label: "Location is unknown",
      detail: "This opportunity's location could not be determined.",
      impact: "neutral",
      scoreContribution: score.locationFit
    };
  }
  if (input.target && input.target.trim().length > 0 && score.locationFit < 70) {
    return {
      code: "location_match",
      label: "Outside the artist's selected target area",
      detail: "Location is outside the artist's selected target area.",
      impact: "negative",
      scoreContribution: score.locationFit
    };
  }
  return null;
}

function buildCapacityFactor(target: BookingTarget, score: BookingScore): MatchFactor | null {
  if (target.estimatedCapacity == null) {
    return {
      code: "capacity_fit",
      label: "Venue capacity is unknown",
      impact: "neutral"
    };
  }
  if (score.sizeFit >= 70) {
    return { code: "capacity_fit", label: "Capacity appears suitable", impact: "positive", scoreContribution: score.sizeFit };
  }
  if (score.sizeFit < 50) {
    return {
      code: "capacity_fit",
      label: "Capacity may not be a good fit",
      detail: `Venue capacity (${target.estimatedCapacity}) may not match the artist's current size.`,
      impact: "negative",
      scoreContribution: score.sizeFit
    };
  }
  return null;
}

function buildSimilarArtistFactor(target: BookingTarget): MatchFactor | null {
  if (!target.derivedFromSimilarArtist) return null;
  return {
    code: "similar_artist_signal",
    label: "Similar artists have played this venue",
    detail: `${target.derivedFromSimilarArtist.name} is linked to this opportunity.`,
    impact: "positive"
  };
}

function buildContactFactor(target: BookingTarget): MatchFactor {
  const bestContact = pickBestContact(target.contacts);
  if (bestContact) {
    return { code: "contact_available", label: "A public contact is available", impact: "positive" };
  }
  return {
    code: "contact_available",
    label: "No public booking contact was found",
    impact: "neutral"
  };
}

function buildSourceConfidenceFactor(score: BookingScore): MatchFactor | null {
  if (score.sourceConfidence < 50) {
    return {
      code: "source_confidence",
      label: "Event information comes from a lower-confidence source",
      impact: "negative",
      scoreContribution: score.sourceConfidence
    };
  }
  return null;
}

function buildDataCompletenessFactor(target: BookingTarget): MatchFactor | null {
  const isEventLike = EVENT_LIKE_CATEGORIES.has(target.category);
  if (!isEventLike) return null;
  if (!target.eventDate || !target.venueName) {
    return {
      code: "data_completeness",
      label: "Date or venue information is incomplete",
      impact: "neutral"
    };
  }
  return null;
}

// Delegates to the shared support-slot-potential analysis (issue #158) so the
// UI-facing match factors and the compatibility score never disagree about
// what the evidence shows. Festivals are excluded: analyzeSupportSlotPotential
// only returns a result for a single concert with its own announced bill.
function buildSupportSlotFactors(
  input: BookingSearchInput,
  target: BookingTarget
): { support: MatchFactor | null; lineup: MatchFactor | null } {
  const analysis = analyzeSupportSlotPotential(target, input);
  if (!analysis) {
    return { support: null, lineup: null };
  }

  if (analysis.status === "likely") {
    return {
      support: {
        code: "support_slot_signal",
        label: "The event may still have room for a support act",
        detail: analysis.reasons[0],
        impact: "positive"
      },
      lineup: null
    };
  }

  if (analysis.status === "possible") {
    return {
      support: {
        code: "support_slot_signal",
        label: "No fully announced lineup — a support slot may be possible",
        detail: analysis.reasons[0],
        impact: "positive"
      },
      lineup: null
    };
  }

  if (analysis.status === "unlikely") {
    return {
      support: null,
      lineup: {
        code: "lineup_availability",
        label: "The announced lineup may already be complete",
        detail: analysis.reasons[0],
        impact: "negative"
      }
    };
  }

  return {
    support: {
      code: "support_slot_signal",
      label: "No clear support-slot signal was found",
      impact: "neutral"
    },
    lineup: null
  };
}
