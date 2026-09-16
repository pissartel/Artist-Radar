import type { BookingTarget } from "./types.js";

const LIVE_MUSIC_EVENT_PATTERN = /\b(concert|live|gig|showcase|festival|music|musique|musical|rock|punk|emo|hardcore|jazz|rap|metal|orchestre|orchestra|dj set|acoustic|acoustique)\b/i;
const LIVE_MUSIC_VENUE_PATTERN = /\b(music venue|live music|concert hall|salle de concerts?|salle de spectacle|club|smac|bar[- ]concert|cafe[- ]concert|café[- ]concert|rock bar|music club|scene de musiques actuelles|scène de musiques actuelles)\b/i;
const EXPLICIT_GENRE_PATTERN = /\b(pop punk|punk rock|punk|emo|easycore|hardcore|metalcore|metal|indie rock|alternative rock|rock|jazz|rap|hip hop|trap|electro|house|techno|folk|chanson)\b/i;
const GENERIC_LOCATION_PATTERN = /\b(rendez[- ]vous|meeting point|devant (?:le|la|l )|gare sncf|train station|universite|faculte|campus|cinema|movie theater|film screening|projection|musee|museum|conference|lecture|colloque|philosophie|psychologie|bibliotheque)\b/i;
const RELIGIOUS_LOCATION_PATTERN = /\b(eglise|church|chapelle|chapel|cathedrale|cathedral|basilique|basilica|paroisse|temple)\b/i;

export function isMusicOrLivePerformanceText(value: string): boolean {
  return LIVE_MUSIC_EVENT_PATTERN.test(value);
}

export function hasIndependentVenueGenreEvidence(target: BookingTarget): boolean {
  if (target.genres.some(Boolean) || (target.programmingEvidence ?? []).some((entry) => entry.genres.some(Boolean))) {
    return true;
  }
  const isIndependentVenueSource = target.sourceType === "official_site" || target.sourceType === "venue_official_programming_page";
  return isIndependentVenueSource && EXPLICIT_GENRE_PATTERN.test([target.description, ...target.evidence].filter(Boolean).join(" "));
}

/**
 * Event-history locations are not venues by default. They need affirmative,
 * independently sourced evidence of recurring live-music activity or an
 * explicit live-music venue identity before they become actionable.
 */
export function qualifyEventDerivedVenue(target: BookingTarget): { eligible: boolean; reason: string } {
  if (target.category !== "venue" || !isEventDerivedVenue(target)) {
    return { eligible: true, reason: "not_event_derived" };
  }

  const evidenceText = normalize([target.name, target.description, ...target.evidence].filter(Boolean).join(" "));
  const programming = target.programmingEvidence ?? [];
  const musicalEvents = programming.filter((entry) => isMusicOrLivePerformanceText(entry.eventName ?? ""));
  const uniqueArtists = new Set([
    ...(target.venueArtistEvidence ?? []).map((entry) => entry.similarArtistId),
    ...programming.flatMap((entry) => entry.artistNames?.length ? entry.artistNames : [entry.artistName]).map(normalize)
  ].filter(Boolean));
  const hasOfficialProgrammingPage = target.sourceType === "venue_official_programming_page" && Boolean(target.sourceUrl);
  const hasExplicitVenueIdentity = LIVE_MUSIC_VENUE_PATTERN.test(evidenceText);
  const hasIndependentProgrammingGenre = hasIndependentVenueGenreEvidence(target) && !target.derivedFromSimilarArtist;
  const hasRepeatedProgramming = musicalEvents.length >= 2;
  const hasMultipleIndependentArtists = uniqueArtists.size >= 2;

  // Small safeguard after the positive-evidence checks: generic institutional,
  // film, meeting-point and religious locations need especially strong proof.
  const genericLocation = GENERIC_LOCATION_PATTERN.test(evidenceText) || RELIGIOUS_LOCATION_PATTERN.test(normalize(target.name));
  if (genericLocation && !hasOfficialProgrammingPage && !hasMultipleIndependentArtists) {
    return { eligible: false, reason: "generic_location_without_strong_live_music_evidence" };
  }
  if (hasOfficialProgrammingPage || hasExplicitVenueIdentity || hasIndependentProgrammingGenre || musicalEvents.length >= 1 || hasRepeatedProgramming || hasMultipleIndependentArtists) {
    return { eligible: true, reason: "positive_live_music_evidence" };
  }
  return { eligible: false, reason: "missing_positive_live_music_evidence" };
}

function isEventDerivedVenue(target: BookingTarget): boolean {
  return target.sourceProvider === "similar_artist_event_history" || target.sourceType === "local_agenda";
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
