import type { ArtistProfile, SimilarArtist } from "../schemas.js";

export type PlaylistDiscoveryStrategy = "similar_artist" | "genre" | "regional" | "submission_platform";

export interface PlaylistSearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  limit: number;
  artistProfile?: ArtistProfile;
  similarArtists?: SimilarArtist[];
}
