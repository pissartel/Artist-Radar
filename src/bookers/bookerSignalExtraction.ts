import type { SimilarArtist } from "../schemas.js";
import type { BookerEntityType } from "./types.js";

// Evidence-gated classification (mirrors the venue-discovery approach from
// issue #168 and the label-discovery approach from #169): a bare "agency" or
// "booker" keyword must never be enough on its own. A candidate is only kept
// when the source also carries genuine representation/booking evidence
// (roster, artist credit, or concert-organizing activity), per #170's
// acceptance criterion that bookers must be linked to evidence such as a
// roster or artist credit.
const BOOKING_AGENCY_PATTERN =
  /\b(booking agency|agence de booking|agence artistique|talent agency|artist agency|music agency)\b/i;
const PROMOTER_PATTERN =
  /\b(concert promoter|independent promoter|promoteur ind[ée]pendant|tourneur|organis(?:e|ateur)s? de concerts?|show promoter|live promoter|concert series presented by|pr[ée]sente des concerts)\b/i;
const BOOKER_PATTERN =
  /\b(freelance booker|independent booker|tour booker|booker for|booking manager|talent buyer)\b/i;

const REPRESENTATION_EVIDENCE_PATTERN =
  /\b(roster|represents?|representation|client roster|booking for|booked by|artists?:|clients?:|catalogue d'artistes|repr[ée]sente)\b/i;
// Verb and noun are checked independently (rather than requiring exact
// adjacency) so a genre word between them ("organizes pop punk concerts")
// still counts as evidence.
const CONCERT_ORGANIZING_VERB_PATTERN = /\b(organi[sz]es?|produces?|presents?)\b/i;
const LIVE_EVENT_NOUN_PATTERN = /\b(concerts?|shows?|tour dates?|tourn[ée]e|gigs?)\b/i;
const BOOKING_CONTACT_PATTERN = /\bbooking (?:enquiries|contact)\b/i;
const CONCERT_SERIES_PATTERN = /\bconcert series\b/i;

function hasConcertOrganizingEvidence(text: string): boolean {
  return (
    (CONCERT_ORGANIZING_VERB_PATTERN.test(text) && LIVE_EVENT_NOUN_PATTERN.test(text)) ||
    BOOKING_CONTACT_PATTERN.test(text) ||
    CONCERT_SERIES_PATTERN.test(text)
  );
}

// Returns null (rather than defaulting to one of the three types) when there
// is no genuine representation/booking evidence, so unrelated results are
// dropped instead of misclassified.
export function classifyBookerEntityType(text: string): BookerEntityType | null {
  const hasEvidence = REPRESENTATION_EVIDENCE_PATTERN.test(text) || hasConcertOrganizingEvidence(text);
  if (!hasEvidence) {
    return null;
  }
  if (BOOKING_AGENCY_PATTERN.test(text)) return "booking_agency";
  if (PROMOTER_PATTERN.test(text)) return "promoter";
  if (BOOKER_PATTERN.test(text)) return "booker";
  return null;
}

const INACTIVE_PATTERN =
  /\b(on hiatus|no longer active|ceased operations?|closed down|d[ée]funt|dissous|n'op[èe]re plus|ferm[ée]|inactive since|discontinued|folded|plus en activit[ée])\b/i;
const RECENT_YEAR_PATTERN = /\b(20[0-9]{2})\b/g;

export interface BookerActivityStatus {
  isActive: boolean | null;
  evidence: string | null;
}

// Returns isActive: false only on explicit closure/hiatus language so a
// confirmed-inactive booker/agency/promoter can be filtered out; otherwise
// isActive is true (recent year mentioned) or null (uncertain, per AGENTS.md)
// rather than guessed.
export function extractBookerActivityStatus(text: string, now: Date = new Date()): BookerActivityStatus {
  if (INACTIVE_PATTERN.test(text)) {
    return { isActive: false, evidence: "Source text indicates this booker/agency/promoter has closed or is inactive." };
  }

  const years = [...text.matchAll(RECENT_YEAR_PATTERN)].map((match) => Number.parseInt(match[1]!, 10));
  const mostRecentYear = years.length > 0 ? Math.max(...years) : null;
  if (mostRecentYear !== null && mostRecentYear >= now.getFullYear() - 2) {
    return { isActive: true, evidence: `Source text references activity as recently as ${mostRecentYear}.` };
  }

  return { isActive: null, evidence: null };
}

const SUBMISSION_OPEN_PATTERN =
  /\b(accept(?:s|ing)? submissions?|submit(?:ting)? (?:your |a )?(?:artist |band )?(?:press kit|epk)|now accepting (?:new )?artists?|open to new artists?|submit your music|soumettre (?:votre candidature|une maquette|un dossier))\b/i;
const SUBMISSION_CLOSED_PATTERN =
  /\b(not currently accepting|closed for submissions?|roster is full|not taking new artists?|n'accepte plus de nouveaux artistes?)\b/i;

export interface BookerSubmissionPolicy {
  acceptsSubmissions: boolean | null;
  submissionUrl: string | null;
}

// The submission link is only ever populated when acceptance is confirmed by
// text AND a matching link is present in the source's own links — never
// guessed from a generic contact page (acceptance criterion: submission
// links only displayed when backed by a public source).
export function extractBookerSubmissionPolicy(text: string, links: string[]): BookerSubmissionPolicy {
  if (SUBMISSION_CLOSED_PATTERN.test(text)) {
    return { acceptsSubmissions: false, submissionUrl: null };
  }
  if (SUBMISSION_OPEN_PATTERN.test(text)) {
    const submissionLink = links.find((link) => /submit|apply|contact|epk/i.test(link) && /^https?:\/\//i.test(link)) ?? null;
    return { acceptsSubmissions: true, submissionUrl: submissionLink };
  }
  return { acceptsSubmissions: null, submissionUrl: null };
}

// Best-effort extraction of a named roster from the source's own
// "roster/artists/clients/represents" listing. Only ever pulled from a
// segment the source itself wrote, capped and filtered for plausibility —
// never invented beyond what the source states.
const ROSTER_LIST_PATTERN = /\b(?:roster|artists|clients|represents?)\s*[:\-]\s*([^.;\n]{3,200})/i;

export function extractBookerRoster(text: string): string[] {
  const match = text.match(ROSTER_LIST_PATTERN);
  if (!match) {
    return [];
  }
  return match[1]!
    .split(/,|;|&| and /i)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 1 && entry.length < 60 && /^[A-ZÀ-Ý0-9]/.test(entry))
    .slice(0, 10);
}

const LARGE_AGENCY_PATTERN = /\b(major agency|multinational|global roster|worldwide roster|large agency)\b/i;
const SMALL_AGENCY_PATTERN = /\b(boutique agency|small agency|grassroots|diy promoter|one-person|independent booker)\b/i;

export function extractBookerAudienceLevel(text: string, matchedSimilarArtists: SimilarArtist[]): "small" | "medium" | "large" | "unknown" {
  if (LARGE_AGENCY_PATTERN.test(text)) {
    return "large";
  }
  if (SMALL_AGENCY_PATTERN.test(text)) {
    return "small";
  }
  const knownTier = matchedSimilarArtists.find((artist) => artist.artistTier && artist.artistTier !== "unknown");
  return knownTier?.artistTier ?? "unknown";
}

const INTERNATIONAL_OPENNESS_PATTERN =
  /\b(worldwide roster|international artists?|artists? from abroad|accept(?:s|ing)? (?:international|foreign) artists?|open to artists? (?:worldwide|internationally))\b/i;

export function isInternationallyOpen(text: string): boolean {
  return INTERNATIONAL_OPENNESS_PATTERN.test(text);
}

const VENUE_NETWORK_PATTERN = /\b(venue network|partner venues|network of venues|venues across|circuit de salles)\b/i;

export function hasVenueNetworkEvidence(text: string): boolean {
  return VENUE_NETWORK_PATTERN.test(text);
}

const EMERGING_ACTS_PATTERN =
  /\b(emerging artists?|developing artists?|new talent|jeunes? talents?|jeunes? artistes?|d[ée]couvertes?|unsigned artists?|early[- ]career artists?)\b/i;

export function worksWithEmergingActs(text: string): boolean {
  return EMERGING_ACTS_PATTERN.test(text);
}

export function findMentionedSimilarArtists(text: string, similarArtists: SimilarArtist[]): SimilarArtist[] {
  const lower = text.toLowerCase();
  return similarArtists.filter((artist) => artist.name.trim().length > 2 && lower.includes(artist.name.trim().toLowerCase()));
}
