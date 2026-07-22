import type { ArtistProfile, SimilarArtist } from "../schemas.js";

export interface LabelSearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  limit: number;
  artistProfile?: ArtistProfile | null;
  similarArtists?: SimilarArtist[];
}

// Mirrors GenericOpportunitySchema's geographicScope, minus values that a
// label recommendation never needs ("regional") and using the issue's own
// vocabulary for the remote-compatible case.
export type LabelGeographicRelevance = "local" | "national" | "international" | "remote_compatible" | "unknown";

export type LabelDiscoveryStrategy =
  | "similar_artist_release"
  | "genre_specialization"
  | "audience_comparable"
  | "geographic"
  | "directory"
  | "distributor_or_scene";

export interface RawLabelCandidate {
  name: string;
  url: string | null;
  sourceName: string;
  strategy: LabelDiscoveryStrategy;
  text: string;
  links: string[];
  confidence: number;
}
