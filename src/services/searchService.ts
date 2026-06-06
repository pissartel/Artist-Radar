import type { ArtistInput } from "../schemas.js";

export interface SearchContext {
  notes: string[];
}

export async function gatherSearchContext(_input: ArtistInput): Promise<SearchContext> {
  return { notes: [] };
}
