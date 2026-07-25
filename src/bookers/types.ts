import type { ArtistProfile, SimilarArtist } from "../schemas.js";

export interface BookerSearchInput {
  artist: string;
  city: string;
  genre: string;
  target?: string | null;
  limit: number;
  artistProfile?: ArtistProfile | null;
  similarArtists?: SimilarArtist[];
}

// Mirrors GenericOpportunitySchema's geographicScope, minus values a booker
// recommendation never needs ("regional") and using the issue's own
// vocabulary for the remote-compatible case.
export type BookerGeographicRelevance = "local" | "national" | "international" | "remote_compatible" | "unknown";

export type BookerDiscoveryStrategy =
  | "similar_artist_representation"
  | "genre_specialization"
  | "geographic"
  | "directory";

// Distinguishes independent promoters from booking agencies and individual
// bookers, per the issue's acceptance criteria. Doubles as the opportunity's
// opportunityType once a candidate is kept.
export type BookerEntityType = "booker" | "booking_agency" | "promoter";

export interface RawBookerCandidate {
  name: string;
  url: string | null;
  sourceName: string;
  strategy: BookerDiscoveryStrategy;
  entityType: BookerEntityType;
  text: string;
  links: string[];
  confidence: number;
}
