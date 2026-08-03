import { decodeHtmlEntities } from "../utils/htmlEntities.js";
import { isSeoListingTitle } from "./eventPageExtraction.js";
import type { BookingTargetCategory, DerivedFromSimilarArtist } from "./types.js";

// Raw booking sources are scraped agenda/search-result titles such as
// "music.box PACA - Mina Warren en replay - France TV". This module turns that
// into a clean, user-facing title without ever calling an LLM: it strips known
// site/platform suffixes and re-broadcast markers, and falls back to a
// structured title built from what we already know (artist, city, category)
// when the cleaned text is still unusable (e.g. a bare URL).

export interface TitleNormalizationInput {
  rawTitle: string;
  category: BookingTargetCategory;
  city: string | null;
  eventDate: string | null;
  derivedFromSimilarArtist?: DerivedFromSimilarArtist | null;
  /** Venue name, when a source reports it. Never guessed. */
  venueName?: string | null;
  /** Artist/opportunity genres, used to build a neutral fallback title. */
  genres?: string[];
}

export interface TitleNormalizationResult {
  displayTitle: string;
  summary: string;
  wasRewritten: boolean;
}

const SITE_SUFFIX_PATTERN =
  /\s*[-–|]\s*(france ?tv|songkick|bandsintown|facebook|instagram|youtube|eventbrite|dice(?:\.fm)?|shotgun(?:\.live)?|ticketmaster|wikipedia|spotify|mood|festicket|resident ?advisor|ra\.co)\s*$/i;
const REPLAY_PATTERN = /\ben\s+replay\b/gi;
const TRAILING_SEPARATOR_PATTERN = /[-–|]\s*$/;
const URL_PATTERN = /^https?:\/\//i;

// Generic source CTA text, not an actual event/venue title (issue #130 review
// feedback). Matched after entity-decoding and accent-stripping so both
// "Voir la page de l'évènement" and its HTML-entity-encoded form are caught.
const GENERIC_TITLE_PATTERNS = [
  /^voir la page de l'?ev[ae]nement$/i,
  /^voir l'?ev[ae]nement$/i,
  /^view event$/i,
  /^event details?$/i,
  /^learn more$/i,
  /^more information$/i,
  /^cliquez ici$/i,
  /^en savoir plus$/i
];

export function normalizeOpportunityTitle(input: TitleNormalizationInput): TitleNormalizationResult {
  const decodedRawTitle = decodeHtmlEntities(input.rawTitle);
  const cleaned = cleanRawTitle(decodedRawTitle);
  // Issue #201 follow-up: a scraped SEO/listing-page title ("Poppunk Gigs in
  // Paris", "Emo / Hardcore / Punk Concerts in Paris 2026-2027", "Agenda
  // Concert Punk 2026 | Tous les concerts punk en France") is not CTA text
  // and doesn't match the older isGenericCtaTitle patterns, so it was
  // passing through this final normalization step verbatim — this is the
  // single authoritative place displayTitle is decided (searchBookingOpportunities.ts),
  // so it must reject these too, not just the earlier per-source extraction.
  const isUsable =
    cleaned.length > 0 &&
    !URL_PATTERN.test(cleaned) &&
    !looksLikeBarePath(cleaned) &&
    !isGenericCtaTitle(cleaned) &&
    !isSeoListingTitle(cleaned);
  const displayTitle = isUsable ? cleaned : buildFallbackTitle(input);

  return {
    displayTitle,
    summary: buildSummary(input, displayTitle),
    wasRewritten: !isUsable || displayTitle !== decodedRawTitle.trim()
  };
}

/**
 * True for generic source CTA text (e.g. "Voir la page de l'évènement", "View
 * event") that is never a real title. Decodes entities internally so it's
 * safe to call directly on raw scraped text, not just already-cleaned titles.
 */
export function isGenericCtaTitle(title: string): boolean {
  const normalized = stripAccents(decodeHtmlEntities(title).trim().toLowerCase());
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function cleanRawTitle(rawTitle: string): string {
  let value = rawTitle.trim().replace(REPLAY_PATTERN, "").trim();

  let previous: string;
  do {
    previous = value;
    value = value.replace(SITE_SUFFIX_PATTERN, "").trim();
  } while (value !== previous);

  return value.replace(TRAILING_SEPARATOR_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

function looksLikeBarePath(value: string): boolean {
  return value.includes("/") && /^[a-z0-9/_.\-]+$/i.test(value);
}

// Fallback order per issue #130 review feedback: parsed headline name, then
// venue + event type, then genre + venue/city, then a neutral category label.
// Never fabricates an artist, lineup, venue, or event name.
function buildFallbackTitle(input: TitleNormalizationInput): string {
  const artist = input.derivedFromSimilarArtist?.name;
  if (artist && input.city) return `${artist} — live in ${input.city}`;
  if (artist) return `${artist} — booking lead`;

  const venue = input.venueName?.trim() || null;
  if (venue && input.city) return `${categoryLabel(input.category)} at ${venue} in ${input.city}`;
  if (venue) return `${categoryLabel(input.category)} at ${venue}`;

  const genre = input.genres?.[0];
  if (genre && input.city) return `${capitalize(genre)} ${categoryLabel(input.category).toLowerCase()} in ${input.city}`;
  if (genre) return `${capitalize(genre)} ${categoryLabel(input.category).toLowerCase()}`;

  if (input.city) return `${categoryLabel(input.category)} opportunity in ${input.city}`;
  return `${categoryLabel(input.category)} opportunity`;
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function categoryLabel(category: BookingTargetCategory): string {
  switch (category) {
    case "festival":
      return "Festival";
    case "venue":
    case "bar":
      return "Venue";
    case "open_call":
    case "springboard":
      return "Open call";
    case "event":
      return "Concert";
    default:
      return "Booking";
  }
}

function buildSummary(input: TitleNormalizationInput, displayTitle: string): string {
  const parts = [displayTitle];
  if (input.eventDate) parts.push(`on ${input.eventDate}`);
  if (input.city) parts.push(`in ${input.city}`);
  return `${parts.join(" ")}.`;
}
