import type { GeographicSearchScope } from "./geoDiscoveryConfig.js";
import { allSearchLocations } from "./geoDiscoveryConfig.js";
import type { LiveOpportunityEntityType } from "./types.js";

// Human-readable search term per entity type, used only to build search
// queries (never as a display label). English/French mix matches how these
// structures are actually referred to online.
const ENTITY_TYPE_SEARCH_TERMS: Record<LiveOpportunityEntityType, string> = {
  concert_venue: "concert venue",
  smac: "SMAC salle de musiques actuelles",
  bar: "bar",
  pub: "pub",
  cafe_concert: "café concert",
  club: "club",
  cultural_center: "centre culturel",
  mjc: "MJC",
  municipal_venue: "salle municipale",
  third_place: "tiers-lieu",
  association: "association",
  collective: "collectif",
  promoter: "promoteur concerts",
  festival_organizer: "organisateur de festival",
  other_live_music_organization: "organisation musiques actuelles"
};

const DEFAULT_ENTITY_TYPES: LiveOpportunityEntityType[] = [
  "concert_venue",
  "smac",
  "bar",
  "cafe_concert",
  "club",
  "association",
  "promoter"
];

export interface LiveMusicQueryContext {
  genres: string[];
  entityTypes?: LiveOpportunityEntityType[];
  similarArtistNames?: string[];
}

/**
 * Generates search queries from controlled templates (string interpolation
 * only, never an LLM), combining city/region, compatible genre, structure
 * type and similar-artist names, per issue #183's "Search-query generation"
 * requirement. Examples mirror the issue: `"pop punk" "café concert"
 * Bordeaux`, `"punk rock" association concerts Bordeaux`, `"<similar
 * artist>" concert <city>`.
 */
export function buildLiveMusicEntityDiscoveryQueries(
  context: LiveMusicQueryContext,
  scope: GeographicSearchScope
): string[] {
  const locations = allSearchLocations(scope);
  const genres = uniqueStrings(context.genres);
  const entityTypes = context.entityTypes?.length ? context.entityTypes : DEFAULT_ENTITY_TYPES;

  const queries: string[] = [];

  for (const location of locations) {
    for (const entityType of entityTypes) {
      const term = ENTITY_TYPE_SEARCH_TERMS[entityType];
      if (genres.length === 0) {
        queries.push(`${term} concerts ${location}`);
        continue;
      }
      for (const genre of genres) {
        queries.push(`"${genre}" "${term}" ${location}`);
      }
    }
  }

  for (const similarArtistName of uniqueStrings(context.similarArtistNames ?? [])) {
    for (const location of locations) {
      queries.push(`"${similarArtistName}" concert ${location}`);
    }
    queries.push(`"${similarArtistName}" concert venue`);
  }

  return dedupeQueries(queries);
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = query.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
