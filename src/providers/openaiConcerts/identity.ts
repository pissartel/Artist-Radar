import type { ArtistIdentityAssessment, OpenAIConcertDiscoveryResult } from "./types.js";

const RESOLVED_CONFIDENCE_THRESHOLD = 0.5;
const REJECTED_CONFIDENCE_THRESHOLD = 0.25;

export function normalizeArtistName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Combines the model's own self-reported identityConfidence with a hard,
 * deterministic exact-name check — a low model confidence is never
 * overridden, but an exact normalized name match can't be dragged down by an
 * overly cautious model either (issue spec Part 11).
 */
export function assessArtistIdentity(requestedName: string, result: OpenAIConcertDiscoveryResult): ArtistIdentityAssessment {
  const requestedNormalized = normalizeArtistName(requestedName);
  const resolvedNormalized = result.artist.resolvedName ? normalizeArtistName(result.artist.resolvedName) : requestedNormalized;
  const exactNameMatch = requestedNormalized.length > 0 && requestedNormalized === resolvedNormalized;

  // An exact normalized name match always resolves with high confidence —
  // never dragged down into "ambiguous"/"rejected" by an overly cautious
  // model. A non-exact match is banded by the model's own confidence: below
  // REJECTED_CONFIDENCE_THRESHOLD it's rejected outright (likely a
  // homonym), between the two thresholds it's ambiguous (diagnostics only,
  // not used), at or above RESOLVED_CONFIDENCE_THRESHOLD it resolves.
  const confidence = exactNameMatch ? Math.max(result.artist.identityConfidence, 0.75) : result.artist.identityConfidence;

  if (exactNameMatch || confidence >= RESOLVED_CONFIDENCE_THRESHOLD) {
    return {
      confidence,
      exactNameMatch,
      status: "resolved",
      reason: result.artist.identityNotes ?? (exactNameMatch ? "Exact normalized artist name match." : "Model-reported identity match.")
    };
  }

  if (confidence >= REJECTED_CONFIDENCE_THRESHOLD) {
    return {
      confidence,
      exactNameMatch,
      status: "ambiguous",
      reason: result.artist.identityNotes ?? "Model identity confidence is below the resolved threshold but not low enough to reject outright."
    };
  }

  return {
    confidence,
    exactNameMatch,
    status: "rejected",
    reason: result.artist.identityNotes ?? "Model identity confidence too low — likely a homonymous artist."
  };
}
