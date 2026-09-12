import type { IndustrySearchContext, IndustryOrganizationType } from "./types.js";

export interface IndustrySearchPlanOptions { maxQueries?: number; maxSimilarArtists?: number; }

export function planIndustrySearch(context: IndustrySearchContext, options: IndustrySearchPlanOptions = {}): string[] {
  const maxQueries = options.maxQueries ?? 12;
  const country = context.country ?? "";
  const genres = context.normalizedGenres.slice(0, 3);
  const types: Array<[IndustryOrganizationType, string]> = [
    ["booking_agency", "booking agency"], ["management_company", "artist management"], ["label", "record label"]
  ];
  const queries: string[] = [];
  for (const genre of genres) for (const [, label] of types) queries.push([country, genre, label].filter(Boolean).join(" "));
  for (const artist of context.similarArtists.slice(0, options.maxSimilarArtists ?? 4)) {
    queries.push(`"${artist.name}" booking`);
    queries.push(`"${artist.name}" management`);
    queries.push(`"${artist.name}" label`);
  }
  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))].slice(0, maxQueries);
}
