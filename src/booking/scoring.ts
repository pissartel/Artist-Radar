import { matchBookingGenres } from "./genreMatching.js";
import { pickBestContact } from "./contactExtraction.js";
import type { BookingScore, BookingSearchInput, BookingSuggestedAction, BookingTarget } from "./types.js";

const SUPPORT_SLOT_PATTERN = /\b(guest|support tba|support à venir|support a venir|première partie à venir|premiere partie a venir|line-?up soon|lineup soon)\b/i;
const CONFIRMED_SUPPORT_SLOT_PATTERN = /\b(support confirmed|confirmed support|première partie confirmée|premiere partie confirmee|support confirmé|support confirme)\b/i;
const SCORE_WEIGHTS = {
  genreFit: 0.3,
  sizeFit: 0.2,
  pastProgrammingFit: 0.15,
  supportSlotPotential: 0.1,
  locationFit: 0.1,
  contactability: 0.1,
  sourceConfidence: 0.05
} as const;

export function scoreBookingCompatibility(input: BookingSearchInput, target: BookingTarget): BookingScore {
  const text = buildTargetEvidenceText(target);
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], target.genres, text);
  const sizeFit = scoreSizeFit(input, target);
  const supportSlotPotential = scoreSupportSlotPotential(target, text);
  const locationFit = scoreLocationFit(input, target);
  const contactability = scoreContactability(target);
  const sourceConfidence = Math.round((target.confidence ?? 0.5) * 100);
  const pastProgrammingFit = target.pastProgramming && target.pastProgramming.length > 0
    ? Math.min(100, genreMatch.score + 10)
    : Math.max(25, Math.round(genreMatch.score * 0.75));

  const total = calculateTotalScore({
    genreFit: genreMatch.score,
    sizeFit,
    pastProgrammingFit,
    supportSlotPotential,
    locationFit,
    contactability,
    sourceConfidence
  });
  const confidence = calculateRecommendationConfidence({
    genreFit: genreMatch.score,
    contactability,
    sourceConfidence,
    evidenceCount: target.evidence.length
  });
  const warnings = buildBookingWarnings(input, target, {
    genreFit: genreMatch.score,
    sizeFit,
    supportSlotPotential,
    contactability,
    sourceConfidence
  });

  return {
    total,
    confidence,
    genreFit: genreMatch.score,
    genreLevel: genreMatch.level,
    sizeFit,
    pastProgrammingFit,
    supportSlotPotential,
    locationFit,
    contactability,
    sourceConfidence,
    reason: buildScoreReason({
      genreLevel: genreMatch.level,
      target,
      genreFit: genreMatch.score,
      sizeFit,
      supportSlotPotential,
      contactability,
      sourceConfidence
    }),
    warnings
  };
}

export function recommendBookingAction(input: BookingSearchInput, target: BookingTarget, score: BookingScore): BookingSuggestedAction {
  if (target.derivedFromSimilarArtist?.popularityComparison === "bigger_support_slot" || target.derivedFromSimilarArtist?.popularityComparison === "massively_bigger") {
    return "support_slot";
  }
  if (target.category === "festival" || target.category === "springboard" || target.category === "open_call") {
    return "application";
  }
  if (target.category === "event" || score.supportSlotPotential >= 70) {
    return "support_slot";
  }
  if (isCapacityTooLargeForHeadline(input, target)) {
    return "support_slot";
  }
  if (target.contacts.length > 0) {
    return "booking_contact";
  }
  return "research";
}

function scoreSizeFit(input: BookingSearchInput, target: BookingTarget): number {
  const capacity = target.estimatedCapacity ?? null;
  if (capacity === null) {
    return 50;
  }

  const artistTier = input.artistProfile?.estimatedLevel ?? "unknown";
  if (artistTier === "emerging") {
    if (capacity <= 250) return 90;
    if (capacity <= 600) return 65;
    return 35;
  }
  if (artistTier === "developing") {
    if (capacity <= 800) return 85;
    if (capacity <= 1500) return 65;
    return 45;
  }
  if (artistTier === "established") {
    return capacity >= 400 ? 80 : 55;
  }
  return capacity <= 500 ? 70 : 50;
}

function scoreSupportSlotPotential(target: BookingTarget, text: string): number {
  if (SUPPORT_SLOT_PATTERN.test(text)) {
    return 80;
  }
  if (target.category === "event") {
    return 60;
  }
  if (target.category === "venue" || target.category === "bar" || target.category === "promoter" || target.category === "live_producer") {
    return 45;
  }
  return 25;
}

function scoreLocationFit(input: BookingSearchInput, target: BookingTarget): number {
  const inputCity = normalize(input.city);
  const targetCity = normalize(target.city ?? "");
  const targetCountry = normalize(target.country ?? "");
  const requestedTarget = normalize(input.target ?? "");

  if (targetCity && targetCity === inputCity) {
    return 95;
  }
  if (requestedTarget && (targetCity.includes(requestedTarget) || targetCountry.includes(requestedTarget) || requestedTarget.includes(targetCountry))) {
    return 80;
  }
  if (!target.city && !target.country) {
    return 45;
  }
  return 55;
}

function scoreContactability(target: BookingTarget): number {
  const bestContact = pickBestContact(target.contacts);
  if (!bestContact) {
    return 20;
  }
  return Math.round(bestContact.confidence * 100);
}

function isCapacityTooLargeForHeadline(input: BookingSearchInput, target: BookingTarget): boolean {
  const capacity = target.estimatedCapacity ?? null;
  const level = input.artistProfile?.estimatedLevel ?? "unknown";
  return level === "emerging" && capacity !== null && capacity > 600;
}

function buildScoreReason(details: {
  genreLevel: string;
  target: BookingTarget;
  genreFit: number;
  sizeFit: number;
  supportSlotPotential: number;
  contactability: number;
  sourceConfidence: number;
}): string {
  const bestContact = pickBestContact(details.target.contacts);
  const contactText = bestContact
    ? `${bestContact.type} signal (${Math.round(bestContact.confidence * 100)}/100)`
    : "no public booking contact found";
  const capacityText = details.target.estimatedCapacity
    ? `capacity ${details.target.estimatedCapacity}`
    : "capacity unknown";
  const supportText = details.supportSlotPotential >= 70
    ? "support-slot potential is inferred from public text and is not confirmed unless the source explicitly says so"
    : "no strong support-slot signal";

  return [
    `${details.target.name} is classified as ${details.target.category}.`,
    `Genre fit: ${details.genreLevel} (${details.genreFit}/100).`,
    `Size/capacity fit: ${details.sizeFit}/100 with ${capacityText}.`,
    `Contact confidence: ${details.contactability}/100; ${contactText}.`,
    `Source confidence: ${details.sourceConfidence}/100.`,
    supportText
  ].join(" ");
}

function buildBookingWarnings(
  input: BookingSearchInput,
  target: BookingTarget,
  scores: {
    genreFit: number;
    sizeFit: number;
    supportSlotPotential: number;
    contactability: number;
    sourceConfidence: number;
  }
): string[] {
  const warnings: string[] = [];
  const text = buildTargetEvidenceText(target);

  if (!target.sourceUrl) {
    warnings.push("No source URL is available; verify the opportunity manually before outreach.");
  }
  if (target.contacts.length === 0) {
    warnings.push("Source does not expose a public booking contact.");
  } else if (scores.contactability < 70) {
    warnings.push("Contact is generic, not programming-specific.");
  }
  if (scores.genreFit < 50) {
    warnings.push("Genre match is weak; deprioritize unless stronger programming evidence appears.");
  }
  if (isCapacityTooLargeForHeadline(input, target)) {
    warnings.push("Venue capacity may be too large for headline; treat this as a support-slot lead.");
  }
  if (scores.supportSlotPotential >= 70 && !CONFIRMED_SUPPORT_SLOT_PATTERN.test(text)) {
    warnings.push("Support slot is inferred, not confirmed.");
  }
  if (scores.sourceConfidence < 50) {
    warnings.push("Source confidence is low; verify against an official page.");
  }

  return warnings;
}

function calculateTotalScore(scores: {
  genreFit: number;
  sizeFit: number;
  pastProgrammingFit: number;
  supportSlotPotential: number;
  locationFit: number;
  contactability: number;
  sourceConfidence: number;
}): number {
  return clampScore(Math.round(
    scores.genreFit * SCORE_WEIGHTS.genreFit +
    scores.sizeFit * SCORE_WEIGHTS.sizeFit +
    scores.pastProgrammingFit * SCORE_WEIGHTS.pastProgrammingFit +
    scores.supportSlotPotential * SCORE_WEIGHTS.supportSlotPotential +
    scores.locationFit * SCORE_WEIGHTS.locationFit +
    scores.contactability * SCORE_WEIGHTS.contactability +
    scores.sourceConfidence * SCORE_WEIGHTS.sourceConfidence
  ));
}

function calculateRecommendationConfidence(details: {
  genreFit: number;
  contactability: number;
  sourceConfidence: number;
  evidenceCount: number;
}): number {
  const evidenceBoost = Math.min(15, details.evidenceCount * 5);
  const confidence = Math.round(
    details.genreFit * 0.35 +
    details.contactability * 0.25 +
    details.sourceConfidence * 0.3 +
    evidenceBoost
  );
  return clampScore(confidence);
}

function buildTargetEvidenceText(target: BookingTarget): string {
  return [target.description, ...target.evidence, ...(target.pastProgramming ?? [])].filter(Boolean).join(" ");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 100));
}
