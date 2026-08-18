import type { ArtistProfile, SimilarArtist } from "../schemas.js";

export type CommunityDiscoveryStrategy =
  | "similar_artist"
  | "event_organizer"
  | "local_resource"
  | "support_program"
  | "genre_collective";

export interface CommunitySearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  limit: number;
  artistProfile?: ArtistProfile;
  similarArtists?: SimilarArtist[];
}
