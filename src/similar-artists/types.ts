/** A candidate artist already discovered upstream (seeds, Last.fm, Spotify, ...) awaiting RAG-grounded classification. */
export interface SimilarArtistRagCandidate {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  url: string | null;
}

export interface SimilarArtistRagSearchInput {
  artist: string;
  genre: string;
  city: string;
  target?: string | null;
  links: string[];
  candidates: SimilarArtistRagCandidate[];
  limit: number;
}
