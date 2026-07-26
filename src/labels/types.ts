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

// Issue #195: structured providers (MusicBrainz, Discogs) carry stable
// external IDs so candidates can be deduplicated without relying on names.
export interface LabelExternalIds {
  musicBrainzId?: string;
  discogsId?: number;
}

// Issue #195: a generic, provider-agnostic evidence record. Every structured
// or web candidate carries its own evidence trail so the compatibility
// explanation (scoreLabelCompatibility.ts) can cite exactly what supports a
// label recommendation, and merging candidates (labelCandidateMerge.ts)
// never has to discard provenance.
export type LabelEvidenceProvider = "musicbrainz" | "discogs" | "official_website" | "bandcamp" | "web_search";

export interface LabelEvidence {
  provider: LabelEvidenceProvider;
  sourceUrl: string | null;
  similarArtistName?: string;
  similarArtistId?: string;
  releaseTitle?: string;
  releaseId?: string;
  confidence: number;
}

export interface RawLabelCandidate {
  name: string;
  url: string | null;
  sourceName: string;
  strategy: LabelDiscoveryStrategy;
  text: string;
  links: string[];
  confidence: number;
  // Known only for structured candidates (MusicBrainz country/area, Discogs
  // profile country); used by labelCandidateMerge.ts's name+country dedupe
  // key. Left undefined for web-search candidates, same as before #195.
  country?: string | null;
  externalIds?: LabelExternalIds;
  evidence?: LabelEvidence[];
}
