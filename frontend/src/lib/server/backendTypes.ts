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
  // Mirrors RunOpportunitySearchOptions["features"] in src/pipeline.ts
  // (issue #142).
  features?: {
    chartmetricArtistEnrichment?: boolean;
  };
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
    deezerUrl?: string | null;
  };
  platformStats: {
    spotifyFollowers?: number | null;
    spotifyPopularity?: number | null;
    deezerFans?: number | null;
  };
  spotify?: BackendSpotifyMetadata | null;
  imageUrl?: string | null;
  imageSource?: BackendImageSource;
  imageConfidence?: number | null;
}

export type BackendArtistTier = "small" | "medium" | "large" | "unknown";

// Issue #201: relationship (to the analyzed artist) vs. absolute (the
// candidate's own) commercial-scale vocabularies — deliberately separate
// concepts, see src/scoring/similarArtistCommercialScore.ts.
export type BackendCommercialTier =
  | "same_level"
  | "slightly_larger"
  | "aspirational"
  | "major_reference"
  | "local_compatible_artist"
  | "scale_unknown";
export type BackendCommercialAbsoluteScale = "emerging" | "developing" | "established" | "major" | "unknown";
export type BackendCommercialScoreConfidence = "high" | "medium" | "low" | "unavailable";

export interface BackendCommercialScoreBreakdown {
  genreCompatibility: number;
  audienceSimilarity: number | null;
  careerStageSimilarity: number | null;
  geographicRelevance: number;
  recentActivity: number | null;
  crossPlatformEvidence: number;
}

// Dev-only diagnostics (issue #201 "Verify Chartmetric execution") — never
// rendered in standard production UI. See
// frontend/src/components/dashboard/SimilarArtistDetail.tsx's existing
// useProductFeatures().debugUIVisible-gated debug panel, the only place this
// may render.
export interface BackendChartmetricDiagnostics {
  selectedForEnrichment: boolean;
  spotifyIdPresent: boolean;
  spotifyUrlPresent: boolean;
  lookupAttempted: boolean;
  status?: string;
  skipReason?: string;
  matchMethod?: string;
  matchConfidence?: string;
  metricsReturned: boolean;
  cacheHit?: boolean;
  finalAudienceRatio: number | null;
  finalCommercialTier?: BackendCommercialTier;
  scoreCoverage?: number;
  scoreConfidence?: BackendCommercialScoreConfidence;
}

export interface BackendChartmetricArtistResult {
  provider: "chartmetric";
  status: string;
  metrics?: {
    spotifyMonthlyListeners?: number;
    spotifyFollowers?: number;
  };
}

// Issue #219: cross-platform commercial-scale band/confidence vocabulary —
// deliberately separate from BackendCommercialTier/BackendCommercialAbsoluteScale
// above (see src/scoring/artistScaleScore.ts on the backend): those describe
// a *relationship*/absolute-stage classification derived largely from
// Chartmetric candidate data, while artistScaleScore is an independent,
// always-computable (main artist included) cross-platform scale reading used
// to compare the analyzed artist against its similar artists.
export type BackendArtistScaleBand =
  | "emerging"
  | "developing"
  | "established_local"
  | "regional"
  | "national"
  | "major";

export type BackendArtistScaleScoreConfidence = "high" | "medium" | "low" | "unavailable";

export interface BackendArtistScaleScoreComponents {
  streaming: number | null;
  social: number | null;
  growth: number | null;
  liveActivity: number | null;
}

export type BackendArtistScaleComparisonClassification =
  | "well_below"
  | "slightly_below"
  | "in_line"
  | "slightly_above"
  | "well_above";

export type BackendArtistScaleComparisonUnavailableReason =
  | "main_artist_score_unavailable"
  | "insufficient_similar_artist_scores";

export interface BackendArtistScaleComparison {
  available: boolean;
  reason?: BackendArtistScaleComparisonUnavailableReason;
  sampleSize: number;
  median: number | null;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  percentile: number | null;
  differenceToMedian: number | null;
  differenceToAverage: number | null;
  classification: BackendArtistScaleComparisonClassification | null;
}

export interface BackendArtistScale {
  artistScaleScore: number | null;
  artistScaleBand: BackendArtistScaleBand | null;
  confidence: BackendArtistScaleScoreConfidence;
  coverage: number;
  components: BackendArtistScaleScoreComponents;
  missingSignals: string[];
  explanation: string;
  comparison: BackendArtistScaleComparison;
}

export interface BackendSimilarArtist {
  name: string;
  genres: string[];
  city: string | null;
  country: string | null;
  reason: string;
  reasons?: string[];
  sourceUrls?: string[];
  artistTier: BackendArtistTier;
  bookingCategory?: string;
  possibleUse?: string;
  verificationStatus?: string;
  totalRelevance: number;
  estimatedFollowers: number | null;
  spotifyId?: string | null;
  spotifyUrl?: string | null;
  spotify?: BackendSpotifyMetadata | null;
  imageUrl?: string | null;
  imageSource?: BackendImageSource;
  imageConfidence?: number | null;
  // Musical/genre and scene-relevance signals (issue #48/#201) — the "musical
  // match" dimension, kept independently visible from the commercial-scale
  // fields below rather than folded into a single ambiguous percentage.
  genreRelevance: number;
  localRelevance?: number;
  sizeRelevance?: number;
  sceneRelevance: number;
  // Issue #201: additive Chartmetric-informed commercial-scale fields.
  commercialTier?: BackendCommercialTier;
  commercialAbsoluteScale?: BackendCommercialAbsoluteScale;
  commercialScore?: number | null;
  commercialScoreCoverage?: number;
  commercialScoreConfidence?: BackendCommercialScoreConfidence;
  commercialScoreBreakdown?: BackendCommercialScoreBreakdown;
  commercialScoreExplanation?: string;
  chartmetricDiagnostics?: BackendChartmetricDiagnostics;
  // Issue #219: cross-platform artistScaleScore for this candidate, computed
  // the same way as the analyzed artist's own score so the two are directly
  // comparable. Null (not omitted) when computed with zero coverage.
  artistScaleScore?: number | null;
  artistScaleBand?: BackendArtistScaleBand | null;
  artistScaleScoreConfidence?: BackendArtistScaleScoreConfidence;
  artistScaleScoreCoverage?: number;
}

export interface BackendOpportunityRelatedArtist {
  name: string;
  popularityComparison: string;
  matchedGenres: string[];
}

// One similar artist's past concert at this venue (issue #213 review
// feedback) — the source URL here is concert evidence, never the venue's
// own official website.
export interface BackendOpportunityVenueArtistEvidence {
  similarArtistName: string;
  sourceUrl: string;
  eventDate?: string | null;
  eventName?: string | null;
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
  neutralFactors: BackendMatchFactor[];
}

export type BackendSupportSlotStatus = "likely" | "possible" | "unlikely" | "unknown";

export interface BackendSupportSlotPotential {
  status: BackendSupportSlotStatus;
  confidenceScore: number;
  reasons: string[];
}

export interface BackendOpportunity {
  name: string;
  displayTitle?: string;
  type: string;
  city: string | null;
  country: string | null;
  source_url: string | null;
  sourceProvider?: string | null;
  contact: string | null;
  reason: string;
  score: number;
  suggested_message: string;
  date?: string | null;
  time?: string | null;
  dateRange?: { start: string; end: string } | null;
  genres?: string[];
  venueCapacity?: number | null;
  address?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  providerVenueId?: string | null;
  // Venue identity fields (issue #213). Never guessed.
  venueName?: string | null;
  venueOpportunityId?: string | null;
  venueType?: string | null;
  venueImageUrl?: string | null;
  venueConfidence?: number | null;
  recentEvents?: string[];
  headliner?: string[];
  lineup?: string[];
  lineupEntries?: Array<{
    name: string;
    position?: "headliner" | "support" | "opener" | "other";
    externalUrl?: string;
  }>;
  contacts?: Array<{
    purpose: "booking" | "management" | "press" | "submissions" | "partnerships" | "general";
    label: string;
    value: string;
    url?: string;
    verified?: boolean;
    source?: string;
  }>;
  sourceEvidence?: Array<{
    url: string;
    title?: string;
    retrievedInfo?: string;
  }>;
  relatedArtist?: BackendOpportunityRelatedArtist | null;
  venueArtistEvidence?: BackendOpportunityVenueArtistEvidence[];
  imageUrl?: string | null;
  ticketUrl?: string | null;
  matchBreakdown?: BackendOpportunityMatchBreakdown;
  supportSlotPotential?: BackendSupportSlotPotential | null;
}

export type BackendLabelEvidenceProvider = "musicbrainz" | "discogs" | "official_website" | "bandcamp" | "web_search";

export interface BackendLabelEvidence {
  provider: BackendLabelEvidenceProvider;
  sourceUrl: string | null;
  similarArtistName?: string | null;
  releaseTitle?: string | null;
  confidence: number;
}

export interface BackendLabelOpportunityDetails {
  signedArtists: string[];
  labelGenres: string[];
  territory: string | null;
  acceptsDemos: boolean | null;
  demoSubmissionUrl: string | null;
  distributor: string | null;
  isActive: boolean | null;
  externalIds?: { musicBrainzId?: string; discogsId?: number } | null;
  bandcampUrl?: string | null;
  evidence: BackendLabelEvidence[];
}

// Mirrors the subset of src/schemas.ts GenericOpportunitySchema that this
// integration actually consumes for opportunityType: "label" (issue #197 —
// reuses PR #181/#195's real discovery output, never a parallel model).
export interface BackendLabelOpportunity {
  id: string;
  name: string;
  opportunityType: "label";
  shortDescription?: string | null;
  city?: string | null;
  country?: string | null;
  geographicScope: "local" | "regional" | "national" | "international" | "online" | "unknown";
  websiteUrl?: string | null;
  sourceUrl?: string | null;
  contactPageUrl?: string | null;
  publicEmail?: string | null;
  associatedArtists: string[];
  associatedGenres: string[];
  audienceLevel: BackendArtistTier;
  status: "open" | "closed" | "invite_only" | "unknown";
  applicationUrl?: string | null;
  sources: { name: string; url: string | null; confidence?: number }[];
  compatibilityScore?: number | null;
  compatibilityExplanation?: string | null;
  label?: BackendLabelOpportunityDetails | null;
}

export interface BackendBookingSourceMetadata {
  providerName: string;
  sourceProvider: string;
  targetCount: number;
}

export interface BackendBookingDiagnostics {
  stages?: Record<string, number>;
  providers?: Record<string, number>;
  environment?: Record<string, boolean>;
  similarArtistEligibility?: Array<{
    artistName: string;
    bookingCategory: string | null;
    genreRelevance: number | null;
    estimatedFollowers: number | null;
    artistTier: string | null;
    rejectedReason: string | null;
  }>;
}

export interface BackendBookingSearchResult {
  sourcesUsed: string[];
  warnings: string[];
  sourceMetadata: BackendBookingSourceMetadata[];
  diagnostics?: BackendBookingDiagnostics;
}

// Keyed by BookingCategory ("local_peer" | "regional_peer" | "support_target" |
// "reference" | "to_verify" | "unknown"); we only ever iterate the values.
export type BackendSimilarArtistsByTier = Record<string, BackendSimilarArtist[]>;

export interface BackendPipelineResult {
  artistProfile: BackendArtistProfile;
  similarArtists: BackendSimilarArtistsByTier;
  opportunities: BackendOpportunity[];
  bookingSearch?: BackendBookingSearchResult;
  // Label opportunities (issue #169/#195), discovered and ranked
  // independently of the concert-oriented booking pipeline since labels
  // aren't event-based (see src/pipeline.ts OpportunitySearchRunResult).
  labelOpportunities?: BackendLabelOpportunity[];
  chartmetric?: BackendChartmetricArtistResult;
  // Cross-platform artistScaleScore for the analyzed artist plus its
  // comparison against the similar-artist sample (issue #219). Always
  // populated by the backend (with `artistScaleScore: null`/
  // `comparison.available: false` rather than an exception whenever there
  // isn't enough underlying data).
  artistScale?: BackendArtistScale;
}
