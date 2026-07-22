import { getRelatedGenres } from "../booking/genreMatching.js";

// Query builders mirror the discovery strategies listed in issue #169: each
// function covers one strategy so it stays independently testable, and the
// orchestrator (discoverLabelOpportunities.ts) tags every candidate with the
// strategy that found it for traceability.

export function buildGenreLabelQueries(genre: string, country: string): string[] {
  const relatedGenres = getRelatedGenres([genre]);
  const primary = relatedGenres[0] ?? genre;
  const secondary = relatedGenres[1] ?? genre;
  const queries = [
    `${primary} record label`,
    `${primary} independent label`,
    `label indépendant ${primary}`,
    `${secondary} record label roster`,
    `${primary} label ${country}`,
    `netlabel ${primary}`,
    `${primary} label signing new artists`,
    `${primary} label accepting demos`
  ];
  return [...new Set(queries)];
}

export function buildSimilarArtistLabelQueries(similarArtistName: string): string[] {
  return [
    `"${similarArtistName}" record label`,
    `"${similarArtistName}" signed to label`,
    `"${similarArtistName}" label sorti chez`
  ];
}

export function buildGeographicLabelQueries(genre: string, city: string, country: string): string[] {
  const relatedGenres = getRelatedGenres([genre]);
  const primary = relatedGenres[0] ?? genre;
  return [
    `${primary} label ${city}`,
    `label ${primary} ${country}`,
    `international ${primary} label accepting artists from abroad`,
    `${primary} label worldwide roster submissions`
  ];
}

export function buildLabelDirectoryQueries(genre: string, country: string): string[] {
  const relatedGenres = getRelatedGenres([genre]);
  const primary = relatedGenres[0] ?? genre;
  return [
    `${primary} record labels directory`,
    `list of ${primary} record labels`,
    `annuaire labels ${primary} ${country}`,
    `${primary} distributor collective labels`
  ];
}
