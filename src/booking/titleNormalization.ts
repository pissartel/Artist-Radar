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
}

export interface TitleNormalizationResult {
  displayTitle: string;
  summary: string;
  wasRewritten: boolean;
}

const SITE_SUFFIX_PATTERN =
  /\s*[-–|]\s*(france ?tv|songkick|bandsintown|facebook|instagram|youtube|eventbrite|dice(?:\.fm)?|shotgun(?:\.live)?|ticketmaster|wikipedia|spotify)\s*$/i;
const REPLAY_PATTERN = /\ben\s+replay\b/gi;
const TRAILING_SEPARATOR_PATTERN = /[-–|]\s*$/;
const URL_PATTERN = /^https?:\/\//i;

export function normalizeOpportunityTitle(input: TitleNormalizationInput): TitleNormalizationResult {
  const cleaned = cleanRawTitle(input.rawTitle);
  const isUsable = cleaned.length > 0 && !URL_PATTERN.test(cleaned) && !looksLikeBarePath(cleaned);
  const displayTitle = isUsable ? cleaned : buildFallbackTitle(input);

  return {
    displayTitle,
    summary: buildSummary(input, displayTitle),
    wasRewritten: !isUsable || displayTitle !== input.rawTitle.trim()
  };
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

function buildFallbackTitle(input: TitleNormalizationInput): string {
  const artist = input.derivedFromSimilarArtist?.name;
  if (artist && input.city) return `${artist} — live in ${input.city}`;
  if (artist) return `${artist} — booking lead`;
  if (input.city) return `${categoryLabel(input.category)} opportunity in ${input.city}`;
  return `${categoryLabel(input.category)} opportunity`;
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
