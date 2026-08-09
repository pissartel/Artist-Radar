import { getRelatedGenres } from "../booking/genreMatching.js";

export function buildBatchedSimilarArtistManagerQueries(names: string[]): string[] {
  const usableNames = names.map((name) => name.trim()).filter(Boolean);
  if (usableNames.length === 0) return [];
  const batch = usableNames.map((name) => `"${name}"`).join(" OR ");
  return [
    `(${batch}) (manager OR management company OR managed by)`,
    `(${batch}) (management roster OR artist management clients)`
  ];
}

export function buildManagerRosterQueries(genre: string, country: string): string[] {
  const primary = getRelatedGenres([genre])[0] ?? genre;
  return [
    `${primary} artist management company roster ${country}`.trim(),
    `${primary} management company emerging artists roster`.trim()
  ];
}

export function buildManagerDirectoryQueries(genre: string, country: string): string[] {
  const primary = getRelatedGenres([genre])[0] ?? genre;
  return [
    `${primary} artist managers professional directory ${country}`.trim(),
    `${primary} music management companies accepting artists`.trim()
  ];
}
