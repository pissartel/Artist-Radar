import type { ArtistProfile, SimilarArtist } from "../schemas.js";

export type ManagerDiscoveryMode = "lightweight" | "deep";
export type ManagerEntityType = "manager" | "management_company";
export type ManagementRelationshipStatus = "current" | "former" | "unknown";
export type ManagerDiscoveryStrategy =
  | "similar_artist_management"
  | "management_roster"
  | "genre_specialization"
  | "professional_directory";

export interface ManagerSearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  limit: number;
  artistProfile?: ArtistProfile | null;
  similarArtists?: SimilarArtist[];
  mode?: ManagerDiscoveryMode;
}

export interface RawManagerCandidate {
  name: string;
  url: string | null;
  sourceName: string;
  strategy: ManagerDiscoveryStrategy;
  entityType: ManagerEntityType;
  text: string;
  links: string[];
  confidence: number;
}
