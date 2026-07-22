import { normalizeKey } from "../../utils/venueNameNormalization.js";
import { matchBookingGenres } from "../../booking/genreMatching.js";

export interface TicketmasterArtistResolution {
  requestedArtistName: string;
  attractionId?: string;
  attractionName?: string;
  confidence: number;
  status: "resolved" | "ambiguous" | "not_found";
}

export interface TicketmasterAttractionCandidate {
  id: string;
  name: string;
  aliases?: string[];
  /** Ticketmaster classification segment, e.g. "Music", "Sports", "Arts & Theatre". */
  classificationSegment?: string | null;
  /** Classification genre/subGenre names attached to the attraction, when Ticketmaster provides them. */
  genres?: string[];
}

export interface ResolveAttractionContext {
  /** The target artist's own genres, for a compatibility bonus/penalty. */
  targetGenres?: string[];
}

const TRIBUTE_PATTERN = /\b(tribute|cover band|experience|reunion|a tribute to)\b/i;
// If the top two candidates score within this gap, the match isn't reliable
// enough to pick one over the other automatically (never guess the wrong artist).
const AMBIGUOUS_SCORE_GAP = 15;
// Below this, there's no real evidence connecting any candidate to the
// requested artist.
const MIN_RESOLVED_SCORE = 40;
const MAX_REALISTIC_SCORE = 135;

/**
 * Deterministic attraction-matching score (issue #189): never automatically
 * picks the first search result. Scores every candidate, and only resolves
 * when one candidate is both above a minimum bar and clearly ahead of the
 * next-best one; otherwise reports "ambiguous" (or "not_found") so the
 * caller skips artist-specific event retrieval rather than guessing.
 */
export function resolveAttraction(
  requestedArtistName: string,
  candidates: TicketmasterAttractionCandidate[],
  context: ResolveAttractionContext = {}
): TicketmasterArtistResolution {
  if (candidates.length === 0) {
    return { requestedArtistName, confidence: 0, status: "not_found" };
  }

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreAttractionCandidate(requestedArtistName, candidate, context) }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0]!;
  const second = scored[1];

  if (best.score < MIN_RESOLVED_SCORE) {
    return { requestedArtistName, confidence: normalizeConfidence(best.score), status: "not_found" };
  }

  if (second && best.score - second.score < AMBIGUOUS_SCORE_GAP) {
    // Two candidates this close are genuinely indistinguishable from the
    // evidence available (even two exact-name matches can be different
    // real-world acts) — never guess which one is correct.
    return { requestedArtistName, confidence: normalizeConfidence(best.score), status: "ambiguous" };
  }

  return {
    requestedArtistName,
    attractionId: best.candidate.id,
    attractionName: best.candidate.name,
    confidence: normalizeConfidence(best.score),
    status: "resolved"
  };
}

function scoreAttractionCandidate(
  requestedArtistName: string,
  candidate: TicketmasterAttractionCandidate,
  context: ResolveAttractionContext
): number {
  const normalizedRequested = normalizeKey(requestedArtistName);
  const normalizedCandidate = normalizeKey(candidate.name);

  if (isTributeOrUnrelated(candidate.name, requestedArtistName)) {
    return -100;
  }

  let score: number;
  if (normalizedCandidate === normalizedRequested) {
    score = 100;
  } else if ((candidate.aliases ?? []).some((alias) => normalizeKey(alias) === normalizedRequested)) {
    score = 90;
  } else if (normalizedCandidate.includes(normalizedRequested) || normalizedRequested.includes(normalizedCandidate)) {
    score = 25; // weak positive: partial substring only
  } else {
    return -100; // no name relation at all
  }

  if (candidate.classificationSegment) {
    if (candidate.classificationSegment.toLowerCase() === "music") {
      score += 20;
    } else {
      return -100; // non-music attraction (sports team, theater show, ...)
    }
  }

  const targetGenres = context.targetGenres ?? [];
  if (targetGenres.length > 0 && (candidate.genres ?? []).length > 0) {
    const genreMatch = matchBookingGenres(targetGenres, candidate.genres ?? []);
    if (genreMatch.level === "exact" || genreMatch.level === "related") {
      score += 15;
    } else if (genreMatch.level === "incompatible") {
      score -= 30;
    }
  }

  return score;
}

function isTributeOrUnrelated(candidateName: string, requestedArtistName: string): boolean {
  if (!TRIBUTE_PATTERN.test(candidateName)) {
    return false;
  }
  // A literal artist named e.g. "The Beatles Tribute Project" performing as
  // themselves isn't rejected if the requested name already contains that
  // exact wording; this only guards against a *different* tribute act
  // matching a real artist's name via substring/alias.
  return normalizeKey(candidateName) !== normalizeKey(requestedArtistName);
}

function normalizeConfidence(score: number): number {
  return Math.max(0, Math.min(1, score / MAX_REALISTIC_SCORE));
}
