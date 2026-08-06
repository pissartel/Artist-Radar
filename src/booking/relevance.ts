import { matchBookingGenres } from "./genreMatching.js";
import type { BookingSearchInput, BookingTarget, BookingTargetCategory, DateConfidence, OpportunityKind } from "./types.js";
import type { SimilarArtist } from "../schemas.js";
import { toDateOnlyString } from "../utils/dateOnly.js";
import { isEligibleConcertLeadTime, MIN_CONCERT_LEAD_TIME_DAYS } from "./concertLeadTime.js";
import { isEligibleSimilarArtistForBookingVenueDiscovery } from "./similarArtistEligibility.js";
import { isInTargetMarket, resolveTargetCountry } from "./targetCountry.js";

export interface BookingRelevanceEnv {
  BOOKING_RECENT_EVENT_MONTHS?: string;
}

export interface BookingRelevanceSummary {
  similarArtistsConsidered: number;
  similarArtistsKept: number;
  similarArtistLiveTargetsFound: number;
  sceneAgendaCandidatesFound: number;
  sceneAgendaCandidatesKept: number;
  openAgendaCandidatesFound: number;
  openAgendaCandidatesKept: number;
  venueDiscoveryCandidatesFound: number;
  venueDiscoveryCandidatesKept: number;
  eventHistoryVenueCandidatesFound: number;
  eventHistoryVenueCandidatesKept: number;
  rejectedOldEvents: number;
  rejectedPastEvents: number;
  rejectedTooSoonEvents: number;
  rejectedGenreMismatchEvents: number;
  rejectedMissingDateEvents: number;
  rejectedLowConfidenceEvents: number;
  rejectedCountryMismatchEvents: number;
  venueCandidatesRejectedByGenre: number;
  venueCandidatesRejectedByConfidence: number;
  venueRejectionSamples: Array<{
    name: string;
    type: string;
    city: string | null;
    country: string | null;
    genres: string[];
    programmingEvidenceCount: number;
    rejectionReason: string;
  }>;
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

// Recurring venues and organizations are evergreen opportunities: they do not
// stop being relevant just because no upcoming show has been announced yet
// (issue #168). One-off events, festivals, springboards and open calls still
// need a real date/deadline signal to be actionable.
const EVERGREEN_ORGANIZATION_CATEGORIES: ReadonlySet<BookingTargetCategory> = new Set([
  "venue",
  "bar",
  "association",
  "collective",
  "festival",
  "promoter",
  "live_producer",
  "booking_agency"
]);

export function isEvergreenOrganizationCategory(category: BookingTargetCategory): boolean {
  return EVERGREEN_ORGANIZATION_CATEGORIES.has(category);
}

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
    sceneAgendaCandidatesFound: targets.filter((target) => target.sourceType === "specialized_scene_agenda").length,
    sceneAgendaCandidatesKept: 0,
    openAgendaCandidatesFound: targets.filter((target) => target.sourceType === "openagenda").length,
    openAgendaCandidatesKept: 0,
    venueDiscoveryCandidatesFound: targets.filter((target) => target.sourceProvider === "venue_discovery").length,
    venueDiscoveryCandidatesKept: 0,
    eventHistoryVenueCandidatesFound: targets.filter((target) => target.sourceProvider === "similar_artist_event_history").length,
    eventHistoryVenueCandidatesKept: 0,
    rejectedOldEvents: 0,
    rejectedPastEvents: 0,
    rejectedTooSoonEvents: 0,
    rejectedGenreMismatchEvents: 0,
    rejectedMissingDateEvents: 0,
    rejectedLowConfidenceEvents: 0,
    rejectedCountryMismatchEvents: 0,
    venueCandidatesRejectedByGenre: 0,
    venueCandidatesRejectedByConfidence: 0,
    venueRejectionSamples: [],
    warnings: []
  };
  const kept: BookingTarget[] = [];
  const targetCountry = resolveTargetCountry(input);

  for (const target of targets) {
    const isEvergreen = isEvergreenOrganizationCategory(target.category);
    const dateStatus = computeBookingDateStatus(target, recentMonths, now);
    const genreStatus = classifyBookingGenreEvidence(input, target);

    if (!isInTargetMarket(input, target, targetCountry)) {
      summary.rejectedCountryMismatchEvents += 1;
      if (isEvergreen) recordVenueRejection(summary, target, "country");
      continue;
    }
    if (!isEvergreen && dateStatus.rejectReason === "old_event") {
      summary.rejectedOldEvents += 1;
      continue;
    }
    if (!isEvergreen && dateStatus.rejectReason === "too_soon_event") {
      summary.rejectedTooSoonEvents += 1;
      continue;
    }
    const keptByConfidenceWithoutDate = dateStatus.rejectReason === "missing_date" && target.confidence >= HIGH_CONFIDENCE_WITHOUT_DATE;
    if (!isEvergreen && dateStatus.rejectReason === "missing_date" && !keptByConfidenceWithoutDate) {
      summary.rejectedMissingDateEvents += 1;
      continue;
    }
    if (!genreStatus.keep) {
      if (genreStatus.rejectReason === "lowConfidence") {
        summary.rejectedLowConfidenceEvents += 1;
        if (isEvergreen) {
          summary.venueCandidatesRejectedByConfidence += 1;
          recordVenueRejection(summary, target, "confidence");
        }
      } else {
        summary.rejectedGenreMismatchEvents += 1;
        if (isEvergreen) {
          summary.venueCandidatesRejectedByGenre += 1;
          recordVenueRejection(summary, target, "genre");
        }
      }
      continue;
    }
    if (!isEvergreen && dateStatus.isPastEvent) {
      summary.rejectedPastEvents += 1;
    }

    const enriched = {
      ...target,
      isFutureEvent: dateStatus.isFutureEvent,
      isPastEvent: dateStatus.isPastEvent,
      dateConfidence: dateStatus.dateConfidence,
      opportunityKind: isEvergreen ? target.opportunityKind ?? "actionable" : keptByConfidenceWithoutDate ? "actionable" : dateStatus.opportunityKind,
      ageMonths: dateStatus.ageMonths,
      confidence: genreStatus.level === "generic" ? Math.min(target.confidence, 0.45) : target.confidence,
      evidence: [
        ...target.evidence,
        dateStatus.evidence,
        genreStatus.evidence
      ].filter(Boolean)
    } satisfies BookingTarget;
    if (enriched.sourceType === "openagenda") {
      summary.openAgendaCandidatesKept += 1;
    }
    if (enriched.sourceType === "specialized_scene_agenda") {
      summary.sceneAgendaCandidatesKept += 1;
    }
    if (enriched.sourceProvider === "venue_discovery") {
      summary.venueDiscoveryCandidatesKept += 1;
    }
    if (enriched.sourceProvider === "similar_artist_event_history") {
      summary.eventHistoryVenueCandidatesKept += 1;
    }
    kept.push(enriched);
  }

  if (summary.rejectedOldEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedOldEvents} events older than ${recentMonths} months.`);
  }
  if (summary.rejectedPastEvents > 0) {
    summary.warnings.push(`Booking relevance excluded ${summary.rejectedPastEvents} past events from actionable opportunities (kept as historical signals).`);
  }
  if (summary.rejectedTooSoonEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedTooSoonEvents} events happening in fewer than ${MIN_CONCERT_LEAD_TIME_DAYS} full days.`);
  }
  if (summary.rejectedGenreMismatchEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedGenreMismatchEvents} genre-mismatch candidates.`);
  }
  if (summary.rejectedCountryMismatchEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedCountryMismatchEvents} out-of-country candidates.`);
  }
  if (summary.rejectedMissingDateEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedMissingDateEvents} low-confidence candidates without parseable event dates.`);
  }
  if (summary.rejectedLowConfidenceEvents > 0) {
    summary.warnings.push(`Booking relevance rejected ${summary.rejectedLowConfidenceEvents} low-confidence candidates without genre evidence.`);
  }

  return { targets: kept, summary };
}

function recordVenueRejection(summary: BookingRelevanceSummary, target: BookingTarget, rejectionReason: string): void {
  if (summary.venueRejectionSamples.length >= 10) return;
  summary.venueRejectionSamples.push({
    name: target.name,
    type: target.category,
    city: target.city,
    country: target.country,
    genres: target.genres,
    programmingEvidenceCount: target.programmingEvidence?.length ?? 0,
    rejectionReason
  });
}

export function sourcePriorityBonus(target: BookingTarget): number {
  if (target.sourceType === "similar_artist_live_history") return 18;
  if (target.sourceType === "specialized_scene_agenda") return target.derivedFromSimilarArtist ? 16 : 12;
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
  if (isEligibleSimilarArtistForBookingVenueDiscovery(artist)) {
    return true;
  }
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], artist.genres, artist.reason);
  if (genreMatch.level !== "exact" && genreMatch.level !== "related") {
    return false;
  }
  return compareArtistPopularity(input, artist).score >= 50 || artist.bookingCategory === "support_target";
}

function classifyBookingGenreEvidence(input: BookingSearchInput, target: BookingTarget): {
  keep: boolean;
  level: string;
  evidence: string;
  rejectReason: "genreMismatch" | "lowConfidence" | null;
} {
  const isEvergreen = isEvergreenOrganizationCategory(target.category);
  const programmingGenres = (target.programmingEvidence ?? []).flatMap((entry) => entry.genres);
  const programmingArtists = (target.programmingEvidence ?? []).map((entry) => entry.artistName);
  const text = [target.description, ...target.evidence, ...(target.pastProgramming ?? []), ...programmingArtists].filter(Boolean).join(" ");
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [...target.genres, ...programmingGenres], text);
  const normalizedText = text.toLowerCase();
  const hasProgrammingEvidence = (target.programmingEvidence?.length ?? 0) > 0;

  if (!isEvergreen && REJECT_GENRE_PATTERN.test(normalizedText) && !PUNK_CROSSOVER_PATTERN.test(normalizedText)) {
    return { keep: false, level: "incompatible", evidence: "Rejected explicit incompatible genre evidence.", rejectReason: "genreMismatch" };
  }
  if (genreMatch.level === "exact" || genreMatch.level === "related") {
    return { keep: true, level: genreMatch.level, evidence: `Strict genre filter kept ${genreMatch.level} match: ${genreMatch.matchedGenres.join(", ")}.`, rejectReason: null };
  }
  if (isEvergreen && hasProgrammingEvidence && REJECT_GENRE_PATTERN.test([...programmingGenres, normalizedText].join(" ")) && !PUNK_CROSSOVER_PATTERN.test([...programmingGenres, normalizedText].join(" "))) {
    return { keep: false, level: "incompatible", evidence: "Rejected venue because all structured programming evidence is incompatible.", rejectReason: "genreMismatch" };
  }
  if (isEvergreen && (target.sourceProvider === "ticketmaster" || hasProgrammingEvidence)) {
    return {
      keep: true,
      level: genreMatch.level,
      evidence: hasProgrammingEvidence
        ? "Kept venue with structured programming evidence; unknown genre is not treated as incompatible."
        : "Kept structured venue candidate; missing venue genre is not treated as incompatible.",
      rejectReason: null
    };
  }
  if (genreMatch.level === "generic") {
    return { keep: false, level: "generic", evidence: "Rejected generic genre evidence without compatible programming proof.", rejectReason: "genreMismatch" };
  }
  if (target.sourceType === "openagenda") {
    return { keep: false, level: genreMatch.level, evidence: "Rejected OpenAgenda candidate without compatible genre evidence.", rejectReason: "genreMismatch" };
  }
  const keep = target.confidence >= HIGH_CONFIDENCE_WITHOUT_DATE;
  return {
    keep,
    level: genreMatch.level,
    evidence: keep
      ? "Kept high-confidence source despite incomplete genre evidence."
      : "Rejected weak genre evidence.",
    rejectReason: keep ? null : "lowConfidence"
  };
}

interface EventDateClassification {
  isFutureEvent: boolean | null;
  isPastEvent: boolean;
  dateConfidence: DateConfidence;
  opportunityKind: OpportunityKind;
  ageMonths: number | null;
  rejectReason: "old_event" | "missing_date" | "past_event" | "too_soon_event" | null;
  evidence: string;
}

// Applies classifyEventDate's date logic for one-off events, but exempts
// evergreen venue/organization categories from date-based rejection: they
// remain actionable with no date at all, and an old event mention on their
// page does not invalidate the organization itself.
function computeBookingDateStatus(target: BookingTarget, recentMonths: number, now: Date): EventDateClassification {
  const isEvergreen = isEvergreenOrganizationCategory(target.category);

  if (!target.eventDate) {
    if (isEvergreen) {
      return {
        isFutureEvent: null,
        isPastEvent: false,
        dateConfidence: "unclear",
        opportunityKind: "actionable",
        ageMonths: null,
        rejectReason: null,
        evidence: "Evergreen venue/organization opportunity; no upcoming event is required."
      };
    }
    return classifyEventDate(null, recentMonths, now);
  }

  const status = classifyEventDate(target.eventDate, recentMonths, now);
  if (!isEvergreen && status.isFutureEvent && !isEligibleConcertLeadTime(target.eventDate, now)) {
    return {
      ...status,
      opportunityKind: "historical_signal",
      rejectReason: "too_soon_event",
      evidence: `Rejected event date ${target.eventDate}: fewer than ${MIN_CONCERT_LEAD_TIME_DAYS} full days remain.`
    };
  }
  if (isEvergreen && status.rejectReason === "old_event") {
    return {
      ...status,
      isPastEvent: false,
      opportunityKind: "actionable",
      rejectReason: null,
      evidence: `${status.evidence} Kept as an evergreen venue/organization opportunity despite the old event reference.`
    };
  }
  return status;
}

export function classifyEventDate(eventDate: string | null, recentMonths: number, now: Date = new Date()): EventDateClassification {
  const todayIso = toDateOnlyString(now)!;
  const eventIso = eventDate ? toDateOnlyString(eventDate) : null;

  if (!eventIso) {
    return {
      isFutureEvent: null,
      isPastEvent: false,
      dateConfidence: "unclear",
      opportunityKind: "historical_signal",
      ageMonths: null,
      rejectReason: "missing_date",
      evidence: "No parseable event date."
    };
  }

  if (eventIso >= todayIso) {
    return {
      isFutureEvent: true,
      isPastEvent: false,
      dateConfidence: "verified",
      opportunityKind: "actionable",
      ageMonths: 0,
      rejectReason: null,
      evidence: `Future event date: ${eventIso}.`
    };
  }

  const ageMonths = monthsBetween(new Date(`${eventIso}T00:00:00Z`), new Date(`${todayIso}T00:00:00Z`));
  if (ageMonths > recentMonths) {
    return {
      isFutureEvent: false,
      isPastEvent: true,
      dateConfidence: "verified",
      opportunityKind: "historical_signal",
      ageMonths,
      rejectReason: "old_event",
      evidence: `Rejected old event date: ${eventIso}.`
    };
  }
  return {
    isFutureEvent: false,
    isPastEvent: true,
    dateConfidence: "verified",
    opportunityKind: "historical_signal",
    ageMonths,
    rejectReason: "past_event",
    evidence: `Past event date: ${eventIso}; kept as a historical signal, not an actionable opportunity.`
  };
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
