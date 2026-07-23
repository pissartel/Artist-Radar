import type { SimilarArtist } from "../schemas.js";

/**
 * Deterministic top-N selection by totalRelevance, shared by any provider
 * that needs to bound how many similar artists it researches further (e.g.
 * an external API/LLM call per artist). Never picks randomly and never
 * silently drops the compatibility ranking already computed upstream.
 */
export function selectTopCompatibleSimilarArtists(similarArtists: SimilarArtist[], limit: number): SimilarArtist[] {
  const seen = new Set<string>();
  const deduped: SimilarArtist[] = [];

  for (const artist of similarArtists) {
    const name = artist.name?.trim();
    if (!name) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(artist);
  }

  return [...deduped].sort((left, right) => right.totalRelevance - left.totalRelevance).slice(0, Math.max(0, limit));
}
