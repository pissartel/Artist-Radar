import { getRelatedGenres } from "../booking/genreMatching.js";

// Query builders mirror the discovery strategies listed in issue #170: each
// function covers one strategy so it stays independently testable, and the
// orchestrator (discoverBookerOpportunities.ts) tags every candidate with the
// strategy that found it for traceability.

export function buildGenreBookerQueries(genre: string, country: string): string[] {
  const relatedGenres = getRelatedGenres([genre]);
  const primary = relatedGenres[0] ?? genre;
  const secondary = relatedGenres[1] ?? genre;
  const queries = [
    `${primary} booking agency`,
    `${primary} artist booking agency roster`,
    `agence de booking ${primary}`,
    `${secondary} talent agency touring artists`,
    `${primary} booking agency ${country}`,
    `independent promoter ${primary}`,
    `${primary} booking agency accepting new artists`,
    `${primary} booking agency emerging artists`
  ];
  return [...new Set(queries)];
}

export function buildSimilarArtistBookerQueries(similarArtistName: string): string[] {
  return [
    `"${similarArtistName}" booking agency`,
    `"${similarArtistName}" represented by`,
    `"${similarArtistName}" booked by`,
    `"${similarArtistName}" tour booking contact`
  ];
}

export function buildGeographicBookerQueries(genre: string, city: string, country: string): string[] {
  const relatedGenres = getRelatedGenres([genre]);
  const primary = relatedGenres[0] ?? genre;
  return [
    `${primary} booking agency ${city}`,
    `booking agency ${primary} ${country}`,
    `independent promoter ${primary} ${city}`,
    `promoter concerts ${primary} ${country}`,
    `international ${primary} booking agency accepting artists from abroad`,
    `${primary} booking agency worldwide roster submissions`,
    `venue and festival partners ${primary} booking agency ${country}`
  ];
}

export function buildBookerDirectoryQueries(genre: string, country: string): string[] {
  const relatedGenres = getRelatedGenres([genre]);
  const primary = relatedGenres[0] ?? genre;
  return [
    `${primary} booking agencies directory`,
    `list of ${primary} booking agencies`,
    `annuaire agences de booking ${primary} ${country}`,
    `${primary} music industry directory bookers promoters`,
    `${primary} artist roster booking agency profiles`
  ];
}
