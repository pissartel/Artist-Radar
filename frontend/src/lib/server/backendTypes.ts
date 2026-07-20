// Hand-maintained mirror of the subset of backend types (see ../../../../src/schemas.ts
// and ../../../../src/pipeline.ts) this integration actually consumes.
//
// We intentionally do not import types from the backend source: Next.js
// type-checks the whole graph reachable through `import type`, and the
// backend project uses a different tsconfig (different @types/node major
// version, NodeNext resolution), which produces unrelated type errors when
// checked under the frontend's config. Runtime values still come from the
// real backend build (see backendPipeline.ts) — only the type layer is
// duplicated here, at the API boundary.

export type BackendMode = "booking" | "promo";

export type BackendImageSource = "spotify" | "lastfm" | "musicbrainz" | "website" | "manual" | "fallback" | null;

export interface BackendSpotifyMetadata {
  id: string;
  url: string | null;
  imageUrl: string | null;
  followers: number | null;
  popularity: number | null;
  genres: string[];
}

export interface BackendArtistInput {
  mode: BackendMode;
  artist: string;
  city: string;
  genre: string;
}

export interface BackendRunOpportunitySearchOptions {
  // When set, the backend records pipeline stage progress under this id so
  // it can be read back via getPipelineExecutionState (see
  // pipelineExecutionState.ts in the backend package, issue #134).
  executionId?: string;
}

// Mirrors src/schemas.ts PipelineStageSchema.
export type BackendPipelineStage =
  | "VALIDATING_ARTIST"
  | "FETCHING_ARTIST_DATA"
  | "FINDING_SIMILAR_ARTISTS"
  | "SEARCHING_OPPORTUNITIES"
  | "SCORING_RESULTS"
  | "PREPARING_OVERVIEW"
  | "COMPLETED";

export type BackendPipelineExecutionStatus = "running" | "completed" | "failed";

export interface BackendPipelineExecutionState {
  executionId: string;
  stage: BackendPipelineStage;
  status: BackendPipelineExecutionStatus;
  percentage: number;
  message: string;
  error: { stage: BackendPipelineStage } | null;
  updatedAt: string;
}

export interface BackendArtistProfile {
  artistName: string | null;
  city: string | null;
  country: string | null;
  genres: string[];
  socialLinks: {
    spotifyUrl?: string | null;
    youtubeUrl?: string | null;
    instagramUrl?: string | null;
  };
  platformStats: {
    spotifyFollowers?: number | null;
    spotifyPopularity?: number | null;
  };
  spotify?: BackendSpotifyMetadata | null;
  imageUrl?: string | null;
  imageSource?: BackendImageSource;
  imageConfidence?: number | null;
}

export type BackendArtistTier = "small" | "medium" | "large" | "unknown";

export interface BackendSimilarArtist {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  reason: string;
  artistTier: BackendArtistTier;
  totalRelevance: number;
  estimatedFollowers: number | null;
  spotify?: BackendSpotifyMetadata | null;
  imageUrl?: string | null;
  imageSource?: BackendImageSource;
  imageConfidence?: number | null;
}

export interface BackendOpportunityRelatedArtist {
  name: string;
  popularityComparison: string;
  matchedGenres: string[];
}

export type BackendMatchFactorCode =
  | "genre_match"
  | "location_match"
  | "date_lead_time"
  | "capacity_fit"
  | "similar_artist_signal"
  | "support_slot_signal"
  | "contact_available"
  | "lineup_availability"
  | "source_confidence"
  | "data_completeness";

export type BackendMatchFactorImpact = "positive" | "negative" | "neutral";

export interface BackendMatchFactor {
  code: BackendMatchFactorCode;
  label: string;
  detail?: string;
  impact: BackendMatchFactorImpact;
  scoreContribution?: number;
}

export interface BackendOpportunityMatchBreakdown {
  overallScore: number;
  positiveFactors: BackendMatchFactor[];
  negativeFactors: BackendMatchFactor[];
}

export interface BackendOpportunity {
  name: string;
  displayTitle?: string;
  type: string;
  city: string | null;
  country: string | null;
  source_url: string | null;
  contact: string | null;
  reason: string;
  score: number;
  suggested_message: string;
  date?: string | null;
  dateRange?: { start: string; end: string } | null;
  genres?: string[];
  venueCapacity?: number | null;
  recentEvents?: string[];
  relatedArtist?: BackendOpportunityRelatedArtist | null;
  imageUrl?: string | null;
  matchBreakdown?: BackendOpportunityMatchBreakdown;
}

export interface BackendBookingSourceMetadata {
  providerName: string;
  sourceProvider: string;
  targetCount: number;
}

export interface BackendBookingSearchResult {
  sourcesUsed: string[];
  warnings: string[];
  sourceMetadata: BackendBookingSourceMetadata[];
}

// Keyed by BookingCategory ("local_peer" | "regional_peer" | "support_target" |
// "reference" | "to_verify" | "unknown"); we only ever iterate the values.
export type BackendSimilarArtistsByTier = Record<string, BackendSimilarArtist[]>;

export interface BackendPipelineResult {
  artistProfile: BackendArtistProfile;
  similarArtists: BackendSimilarArtistsByTier;
  opportunities: BackendOpportunity[];
  bookingSearch?: BackendBookingSearchResult;
}
