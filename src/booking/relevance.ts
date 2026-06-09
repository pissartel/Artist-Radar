import { matchBookingGenres } from "./genreMatching.js";
import type { BookingSearchInput, BookingTarget } from "./types.js";
import type { SimilarArtist } from "../schemas.js";

export interface BookingRelevanceEnv {
  BOOKING_RECENT_EVENT_MONTHS?: string;
}

export interface BookingRelevanceSummary {
  similarArtistsConsidered: number;
  similarArtistsKept: number;
  similarArtistLiveTargetsFound: number;
  openAgendaCandidatesFound: number;
  openAgendaCandidatesKept: number;
  rejectedOldEvents: number;
  rejectedGenreMismatchEvents: number;
  rejectedMissingDateEvents: number;
  warnings: string[];
}

export interface PopularityCompatibility {
  comparison: string;
  score: number;
  supportSlotOnly: boolean;
  reason: string;
}

const DEFAULT_RECENT_EVENT_MONTHS = 24;
const HIGH_CONFIDENCE_WITHOUT_DATE = 0.82;
const REJECT_GENRE_PATTERN = /\b(jazz|classical|musique classique|techno|house|rap|trap|hip hop|metal|chanson|cover band|tribute)\b/i;
const PUNK_CROSSOVER_PATTERN = /\b(pop punk|punk rock|punk|emo|hardcore|easycore|skate punk|melodic punk)\b/i;

export function getRecentEventMonths(env: BookingRelevanceEnv = process.env): number {
  const parsed = Number.parseInt(env.BOOKING_RECENT_EVENT_MONTHS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RECENT_EVENT_MONTHS;
}

export function filterBookingTargetsForRelevance(
  input: BookingSearchInput,
  targets: BookingTarget[],
  env: BookingRelevanceEnv = process.env,
  now = new Date()
): { targets: BookingTarget[]; summary: BookingRelevanceSummary } {
  const recentMonths = getRecentEventMonths(env);
  const summary: BookingRelevanceSummary = {
    similarArtistsConsidered: input.similarArtists?.length ?? 0,
    similarArtistsKept: countBookingUsefulSimilarArtists(input),
    similarArtistLiveTargetsFound: targets.filter((target) => target.sourceType === "similar_artist_live_history").length,
    openAgendaCandidatesFound: targets.filter((target) => target.sourceType === "openagenda").length,
    openAgendaCandidatesKept: 0,
    rejectedOldEvents: 0,
    rejectedGenreMismatchEvents: 0,
    rejectedMissingDateEvents: 0,
    warnings: []
  };
  const kept: BookingTarget[] = [];

  for (const target of targets) {
    const dateStatus = classifyEventDate(target.eventDate ?? null, recentMonths, now);
    const genreStatus = classifyBookingGenreEvidence(input, target);

    if (dateStatus.rejectReason === "old_event") {
      summary.rejectedOldEvents += 1;
      continue;
    }
    if (dateStatus.rejectReason === "missing_date" && target.confidence < HIGH_CONFIDENCE_WITHOUT_DATE) {
      summary.rejectedMissingDateEvents += 1;
      continue;
    }
    if (!genreStatus.keep) {
      summary.rejectedGenreMismatchEvents += 1;
      continue;
    }

    const enriched = {
      ...target,
      isFutureEvent: dateStatus.isFutureEvent,
      ageMonths: dateStatus.ageMonths,
      confidence: genreStatus.level === "generic" ? Math.min(target.confidence, 0.45) : target.confidence,
      evidence: [
        ...target.evidence,
        dateStatus.evidence,
        genreStatus.evidence
      ].filter(Boolean)
    };
    if (enriched.sourceType === "openagenda") {
      summary.openAgendaCandidatesKept += 1;
    }
    kept.push(enriched);
  }

  if (summary.rejectedOldEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedOldEvents} events older than ${recentMonths} months.`);
  }
  if (summary.rejectedGenreMismatchEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedGenreMismatchEvents} genre-mismatch candidates.`);
  }
  if (summary.rejectedMissingDateEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedMissingDateEvents} low-confidence candidates without parseable event dates.`);
  }

  return { targets: kept, summary };
}

export function sourcePriorityBonus(target: BookingTarget): number {
  if (target.sourceType === "similar_artist_live_history") return 18;
  if (target.sourceType === "venue_official_programming_page") return 15;
  if (target.sourceType === "festival_official_page") return 15;
  if (target.sourceType === "promoter_official_page") return 12;
  if (target.sourceType === "openagenda") return target.derivedFromSimilarArtist ? 8 : 0;
  if (target.sourceType === "search_result") return -8;
  return 0;
}

export function compareArtistPopularity(input: BookingSearchInput, artist: SimilarArtist): PopularityCompatibility {
  const userAudience = estimateAudience(input);
  const similarAudience = estimateSimilarArtistAudience(artist);

  if (userAudience !== null && similarAudience !== null && userAudience > 0) {
    const ratio = similarAudience / userAudience;
    if (ratio >= 0.7 && ratio <= 1.5) {
      return { comparison: "same_tier", score: 95, supportSlotOnly: false, reason: "Similar artist has comparable popularity." };
    }
    if (ratio > 1.5 && ratio <= 3) {
      return { comparison: "slightly_bigger", score: 82, supportSlotOnly: false, reason: "Similar artist is slightly bigger, a useful aspirational signal." };
    }
    if (ratio > 3 && ratio <= 10) {
      return { comparison: "bigger_support_slot", score: 58, supportSlotOnly: true, reason: "Similar artist is bigger; treat as support-slot context." };
    }
    if (ratio > 10) {
      return { comparison: "massively_bigger", score: 25, supportSlotOnly: true, reason: "Similar artist is massively bigger; weak headline signal." };
    }
    return { comparison: "smaller", score: 42, supportSlotOnly: false, reason: "Similar artist is smaller; weaker booking discovery signal." };
  }

  if (artist.bookingCategory === "local_peer" || artist.bookingCategory === "regional_peer") {
    return { comparison: "same_tier", score: 78, supportSlotOnly: false, reason: "Similar artist is categorized as a peer." };
  }
  if (artist.bookingCategory === "support_target") {
    return { comparison: "slightly_bigger", score: 70, supportSlotOnly: false, reason: "Similar artist is categorized as a support target." };
  }
  if (artist.bookingCategory === "reference") {
    return { comparison: "massively_bigger", score: 25, supportSlotOnly: true, reason: "Similar artist is categorized as a reference only." };
  }
  return { comparison: "unknown", score: 45, supportSlotOnly: false, reason: "Popularity comparison is uncertain." };
}

export function isStrongSimilarArtistForBooking(input: BookingSearchInput, artist: SimilarArtist): boolean {
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], artist.genres, artist.reason);
  if (genreMatch.level !== "exact" && genreMatch.level !== "related") {
    return false;
  }
  return compareArtistPopularity(input, artist).score >= 50 || artist.bookingCategory === "support_target";
}

function classifyBookingGenreEvidence(input: BookingSearchInput, target: BookingTarget): { keep: boolean; level: string; evidence: string } {
  const text = [target.description, ...target.evidence, ...(target.pastProgramming ?? [])].filter(Boolean).join(" ");
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], target.genres, text);
  const normalizedText = text.toLowerCase();

  if (REJECT_GENRE_PATTERN.test(normalizedText) && !PUNK_CROSSOVER_PATTERN.test(normalizedText)) {
    return { keep: false, level: "incompatible", evidence: "Rejected explicit incompatible genre evidence." };
  }
  if (genreMatch.level === "exact" || genreMatch.level === "related") {
    return { keep: true, level: genreMatch.level, evidence: `Strict genre filter kept ${genreMatch.level} match: ${genreMatch.matchedGenres.join(", ")}.` };
  }
  if (genreMatch.level === "generic") {
    return { keep: false, level: "generic", evidence: "Rejected generic genre evidence without compatible programming proof." };
  }
  if (target.sourceType === "openagenda") {
    return { keep: false, level: genreMatch.level, evidence: "Rejected OpenAgenda candidate without compatible genre evidence." };
  }
  return {
    keep: target.confidence >= HIGH_CONFIDENCE_WITHOUT_DATE,
    level: genreMatch.level,
    evidence: target.confidence >= HIGH_CONFIDENCE_WITHOUT_DATE
      ? "Kept high-confidence source despite incomplete genre evidence."
      : "Rejected weak genre evidence."
  };
}

function classifyEventDate(eventDate: string | null, recentMonths: number, now: Date): {
  isFutureEvent: boolean | null;
  ageMonths: number | null;
  rejectReason: "old_event" | "missing_date" | null;
  evidence: string;
} {
  const parsed = eventDate ? new Date(eventDate) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { isFutureEvent: null, ageMonths: null, rejectReason: "missing_date", evidence: "No parseable event date." };
  }
  if (parsed.getTime() >= now.getTime()) {
    return { isFutureEvent: true, ageMonths: 0, rejectReason: null, evidence: `Future event date: ${formatDate(parsed)}.` };
  }
  const ageMonths = monthsBetween(parsed, now);
  if (ageMonths > recentMonths) {
    return { isFutureEvent: false, ageMonths, rejectReason: "old_event", evidence: `Rejected old event date: ${formatDate(parsed)}.` };
  }
  return { isFutureEvent: false, ageMonths, rejectReason: null, evidence: `Recent event date: ${formatDate(parsed)}.` };
}

function countBookingUsefulSimilarArtists(input: BookingSearchInput): number {
  return (input.similarArtists ?? []).filter((artist) => isStrongSimilarArtistForBooking(input, artist)).length;
}

function estimateAudience(input: BookingSearchInput): number | null {
  const stats = input.artistProfile?.platformStats;
  return firstPositive([
    stats?.spotifyFollowers ?? null,
    stats?.youtubeSubscribers ?? null,
    stats?.instagramFollowers ?? null
  ]);
}

function estimateSimilarArtistAudience(artist: SimilarArtist): number | null {
  return firstPositive([
    artist.estimatedFollowers,
    artist.popularity.platforms.spotify?.followers ?? null,
    artist.popularity.platforms.youtube?.subscribers ?? null,
    artist.popularity.platforms.instagram?.followers ?? null,
    artist.popularity.platforms.lastfm?.listeners ?? null
  ]);
}

function firstPositive(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => typeof value === "number" && value > 0) ?? null;
}

function monthsBetween(left: Date, right: Date): number {
  return Math.max(0, (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth());
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
