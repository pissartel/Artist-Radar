import { getRelatedGenres } from "../../booking/genreMatching.js";
import type { OrganizationEntityType } from "../organization.schema.js";

export interface OrganizationClassification {
  type: OrganizationEntityType;
  matchedKeywords: string[];
  matchedFromText: boolean;
}

// Ordered by specificity: a manager or label mention should win over a more
// generic "promoter"/"association" mention when both appear in the text.
const CLASSIFICATION_PATTERNS: Array<{ type: OrganizationEntityType; pattern: RegExp }> = [
  {
    type: "MANAGER",
    pattern: /\b(artist management|talent manager|management d'artistes?|manager d'artistes?|gestion d'artistes?)\b/i
  },
  {
    type: "LABEL",
    pattern: /\b(record label|music label|maison de disques|label (?:musical|de musique)|demo submission|soumission de maquettes?)\b/i
  },
  {
    type: "BOOKER",
    pattern: /\b(booking agency|talent agency|agence de booking|tourneur)\b/i
  },
  {
    type: "PROMOTER",
    pattern: /\b(concert promoter|promoteur de concerts?|organisateur de concerts?|concert promotion)\b/i
  },
  {
    type: "ASSOCIATION",
    pattern: /\b(association loi 1901|non-?profit association|association culturelle|asbl)\b/i
  },
  {
    type: "VENUE",
    pattern: /\b(concert venue|salle de concert|music club|caf[ée]-concert)\b/i
  }
];

// Classifies an organization type from page/snippet text. Falls back to the
// query's type hint only when the text itself gives no evidence, and never
// invents a type when neither source has any signal (issue #126: "the
// system can distinguish a manager, label, promoter and booking agency").
export function classifyOrganizationType(
  text: string,
  typeHint: OrganizationEntityType | null
): OrganizationClassification | null {
  for (const { type, pattern } of CLASSIFICATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { type, matchedKeywords: [match[0]], matchedFromText: true };
    }
  }

  if (typeHint) {
    return { type: typeHint, matchedKeywords: [], matchedFromText: false };
  }

  return null;
}

const SERVICE_KEYWORDS: Record<string, RegExp> = {
  booking: /\bbooking\b/i,
  "artist management": /\b(artist management|manager|management d'artistes?)\b/i,
  distribution: /\bdistribution\b/i,
  "record production": /\b(production|producteur|record label)\b/i,
  "concert promotion": /\b(promot(?:er|ion|eur))\b/i,
  "event organization": /\b(organisateur|organizer|organisation d'[ée]v[ée]nements?)\b/i
};

export function extractServices(text: string): string[] {
  return Object.entries(SERVICE_KEYWORDS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([service]) => service);
}

export function extractGenres(text: string, artistGenres: string[]): string[] {
  const normalized = text.toLowerCase();
  const candidateGenres = getRelatedGenres(artistGenres);
  return candidateGenres.filter((genre) => new RegExp(`\\b${escapeRegExp(genre)}\\b`).test(normalized));
}

export function extractTerritories(text: string, knownLocations: Array<string | null | undefined>): string[] {
  const normalized = text.toLowerCase();
  const locations = [...new Set(knownLocations.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
  return locations.filter((location) => normalized.includes(location.toLowerCase()));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
