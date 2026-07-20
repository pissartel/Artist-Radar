import { matchBookingGenres } from "./genreMatching.js";
import type { BookingSearchInput, BookingTarget } from "./types.js";

// Structured support-slot-potential analysis for concert opportunities
// (issue #158). The absence of an announced opening act is a signal, never
// proof: this module must not state that a slot is confirmed available
// unless the source text says so explicitly.

export type SupportSlotStatus = "likely" | "possible" | "unlikely" | "unknown";

export interface SupportSlotPotentialResult {
  status: SupportSlotStatus;
  confidenceScore: number;
  reasons: string[];
}

// Only a single concert with its own announced bill can meaningfully have an
// open support slot. Festivals use separate opportunity logic (issue #158
// acceptance criteria); venues, promoters, etc. are not one specific concert.
const SUPPORT_SLOT_RELEVANT_CATEGORIES = new Set(["event"]);

const SUPPORT_SLOT_OPEN_PATTERN =
  /\b(support tba|support à venir|support a venir|première partie à venir|premiere partie a venir|line-?up soon|lineup soon|guests? tba|\+\s*guests?|looking for (?:a )?support|recherche (?:une )?première partie|recherche (?:un )?support)\b/i;
const EXPLICIT_SUPPORT_MENTION_PATTERN =
  /\b(support act|support slot|opening act|first part|première partie|premiere partie|en première partie|en premiere partie)\b/i;
const FULL_LINEUP_WORDING_PATTERN =
  /\b(full lineup|line-?up complet|complete lineup|lineup announced|lineup finalized|full line-?up announced|programmation complète|programmation complete)\b/i;
const TBA_WORDING_PATTERN = /\btba\b|\bà annoncer\b|\ba annoncer\b|\bto be announced\b/i;

// 3+ named performers reads as a settled bill rather than a headliner still
// waiting on support.
const FULL_LINEUP_ARTIST_COUNT = 3;

const STATUS_CONFIDENCE: Record<SupportSlotStatus, number> = {
  likely: 80,
  possible: 55,
  unlikely: 20,
  unknown: 30
};

/**
 * Analyzes support-slot potential for a single concert opportunity. Returns
 * null when the opportunity type isn't a relevant concert (e.g. festivals,
 * venues, organizations), since this analysis only applies to a specific
 * concert with its own announced bill.
 */
export function analyzeSupportSlotPotential(
  target: BookingTarget,
  input?: Pick<BookingSearchInput, "genre" | "artistProfile">
): SupportSlotPotentialResult | null {
  if (!SUPPORT_SLOT_RELEVANT_CATEGORIES.has(target.category)) {
    return null;
  }

  const text = buildEvidenceText(target);
  const lineup = target.lineup ?? [];
  const reasons: string[] = [];

  // Strong positive signal: the source explicitly says it's looking for a support act.
  if (SUPPORT_SLOT_OPEN_PATTERN.test(text)) {
    reasons.push('Source text explicitly signals an open support slot (e.g. "support TBA").');
    if (lineup.length > 0) {
      reasons.push(`Announced lineup currently lists ${lineup.length} artist(s).`);
    }
    return { status: "likely", confidenceScore: STATUS_CONFIDENCE.likely, reasons };
  }

  // A complete announced line-up gets no bonus.
  if (FULL_LINEUP_WORDING_PATTERN.test(text)) {
    reasons.push("Source explicitly describes the lineup as complete or finalized.");
    return { status: "unlikely", confidenceScore: STATUS_CONFIDENCE.unlikely, reasons };
  }
  if (lineup.length >= FULL_LINEUP_ARTIST_COUNT) {
    reasons.push(`Announced lineup already lists ${lineup.length} artists, suggesting the bill is close to full.`);
    return { status: "unlikely", confidenceScore: STATUS_CONFIDENCE.unlikely, reasons };
  }

  const hasExplicitMention = EXPLICIT_SUPPORT_MENTION_PATTERN.test(text);
  const hasTbaWording = TBA_WORDING_PATTERN.test(text);

  // No lineup data and no textual signal either way: unknown, not negative.
  if (lineup.length === 0 && !hasExplicitMention && !hasTbaWording) {
    reasons.push("No lineup or support-act information is available for this event.");
    return { status: "unknown", confidenceScore: STATUS_CONFIDENCE.unknown, reasons };
  }

  // Moderate positive signal: no clearly announced (complete) support act yet.
  if (hasExplicitMention) {
    reasons.push("Source mentions a support/opening slot without confirming who is playing it.");
  }
  if (hasTbaWording) {
    reasons.push('Source uses "TBA"-style wording, suggesting part of the bill is not finalized.');
  }
  if (lineup.length === 1) {
    reasons.push("Only one artist (likely the headliner) is currently announced.");
  } else if (lineup.length === 2) {
    reasons.push("Only two artists are currently announced; a support slot may still be open.");
  }

  const genreSimilarity = describeGenreSimilarity(target, input);
  if (genreSimilarity) {
    reasons.push(genreSimilarity);
  }

  reasons.push("No announced opening act does not confirm a slot is available; verify directly with the organizer.");

  return { status: "possible", confidenceScore: STATUS_CONFIDENCE.possible, reasons };
}

function describeGenreSimilarity(
  target: BookingTarget,
  input?: Pick<BookingSearchInput, "genre" | "artistProfile">
): string | null {
  if (!input) return null;
  const userGenres = [input.genre, ...(input.artistProfile?.genres ?? [])].filter(Boolean);
  if (userGenres.length === 0 || target.genres.length === 0) return null;

  const genreMatch = matchBookingGenres(userGenres, target.genres, target.description ?? "");
  if (genreMatch.level === "exact" || genreMatch.level === "related") {
    return "The announced genre is a close match, making this a plausible support-slot pitch.";
  }
  return null;
}

function buildEvidenceText(target: BookingTarget): string {
  return [target.name, target.description, ...target.evidence, ...(target.pastProgramming ?? [])]
    .filter(Boolean)
    .join(" ");
}
