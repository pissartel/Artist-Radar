import { z } from "zod";

export const ModeSchema = z.enum(["booking", "promo"]);
// Stable, ordered stages a pipeline run passes through. Keep this list in
// sync with the frontend status polling contract (issue #134) — do not
// rename values without coordinating a frontend change.
export const PipelineStageSchema = z.enum([
  "VALIDATING_ARTIST",
  "FETCHING_ARTIST_DATA",
  "FINDING_SIMILAR_ARTISTS",
  "SEARCHING_OPPORTUNITIES",
  "SCORING_RESULTS",
  "PREPARING_OVERVIEW",
  "COMPLETED"
]);
export const PipelineExecutionStatusSchema = z.enum(["running", "completed", "failed"]);
export const EstimatedArtistLevelSchema = z.enum(["unknown", "emerging", "developing", "established"]);
export const ArtistTierSchema = z.enum(["small", "medium", "large", "unknown"]);
export const BookingCategorySchema = z.enum([
  "local_peer",
  "regional_peer",
  "support_target",
  "reference",
  "to_verify",
  "unknown"
]);
export const VerificationStatusSchema = z.enum(["verified", "needs_verification", "unverified"]);
export const SizeSignalSourceSchema = z.enum([
  "spotify_artist",
  "spotify_tracks",
  "youtube",
  "mixed",
  "manual",
  "unknown"
]);
export const SimilarArtistSourceSchema = z.enum([
  "lastfm_similar",
  "spotify_related",
  "spotify_search",
  "mock",
  "user",
  "seed",
  "web_local_scene"
]);
export const SimilarArtistPossibleUseSchema = z.enum([
  "co_bill",
  "local_networking",
  "scene_mapping",
  "booking_research",
  "support_target",
  "reference",
  "long_term_reference",
  "unknown"
]);
export const ConfidenceScoreSchema = z.number().min(0).max(1);
export const ImageSourceSchema = z.enum([
  "spotify",
  "lastfm",
  "musicbrainz",
  "website",
  "manual",
  "fallback"
]).nullable();

export const GenreEvidenceSchema = z.object({
  source: z.string().trim().min(1),
  genres: z.array(z.string().trim().min(1)).default([]),
  confidence: ConfidenceScoreSchema,
  notes: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().url().nullable().optional()
});

export const LocationEvidenceSchema = z.object({
  source: z.string().trim().min(1),
  city: z.string().trim().min(1).nullable().optional(),
  country: z.string().trim().min(1).nullable().optional(),
  confidence: ConfidenceScoreSchema,
  notes: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().url().nullable().optional()
});

export const SizeEvidenceSchema = z.object({
  source: z.string().trim().min(1),
  followers: z.number().int().nonnegative().nullable().optional(),
  subscribers: z.number().int().nonnegative().nullable().optional(),
  views: z.number().int().nonnegative().nullable().optional(),
  popularity: z.number().int().min(0).max(100).nullable().optional(),
  confidence: ConfidenceScoreSchema,
  notes: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().url().nullable().optional()
});

export const PopularitySchema = z.object({
  estimatedLevel: ArtistTierSchema,
  confidence: ConfidenceScoreSchema,
  sizeSignalSource: z.enum(["instagram", "youtube", "spotify", "lastfm", "mixed", "manual", "unknown"]),
  platforms: z.object({
    instagram: z.object({
      followers: z.number().int().nonnegative().nullable().optional(),
      sourceUrl: z.string().trim().url().nullable().optional()
    }).optional(),
    youtube: z.object({
      subscribers: z.number().int().nonnegative().nullable().optional(),
      views: z.number().int().nonnegative().nullable().optional(),
      videos: z.number().int().nonnegative().nullable().optional(),
      sourceUrl: z.string().trim().url().nullable().optional()
    }).optional(),
    spotify: z.object({
      followers: z.number().int().nonnegative().nullable().optional(),
      popularity: z.number().int().min(0).max(100).nullable().optional(),
      sourceUrl: z.string().trim().url().nullable().optional()
    }).optional(),
    lastfm: z.object({
      listeners: z.number().int().nonnegative().nullable().optional(),
      playcount: z.number().int().nonnegative().nullable().optional(),
      sourceUrl: z.string().trim().url().nullable().optional()
    }).optional()
  }).default({})
});

export const OptionalUrlSchema = z.string().trim().url().nullable().optional();

export const SpotifyMetadataSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().trim().url().nullable(),
  imageUrl: z.string().trim().url().nullable(),
  followers: z.number().int().nonnegative().nullable(),
  popularity: z.number().int().min(0).max(100).nullable(),
  genres: z.array(z.string().trim().min(1)).default([])
});

export const SocialLinksSchema = z.object({
  spotifyUrl: OptionalUrlSchema,
  youtubeUrl: OptionalUrlSchema,
  instagramUrl: OptionalUrlSchema
});

export const PlatformStatsSchema = z.object({
  spotifyFollowers: z.number().int().nonnegative().nullable().optional(),
  spotifyPopularity: z.number().int().min(0).max(100).nullable().optional(),
  hiddenSubscriberCount: z.boolean().nullable().optional(),
  youtubeSubscribers: z.number().int().nonnegative().nullable().optional(),
  youtubeTotalViews: z.number().int().nonnegative().nullable().optional(),
  youtubeVideoCount: z.number().int().nonnegative().nullable().optional(),
  instagramFollowers: z.number().int().nonnegative().nullable().optional()
});

export const ArtistInputSchema = z.object({
  mode: ModeSchema,
  artist: z.string().trim().min(1, "artist is required"),
  city: z.string().trim().min(1, "city is required"),
  genre: z.string().trim().min(1, "genre is required"),
  target: z.string().trim().min(1).nullable().default(null),
  links: z.array(z.string().trim().url()).default([]),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  spotifyUrl: OptionalUrlSchema,
  youtubeUrl: OptionalUrlSchema,
  instagramUrl: OptionalUrlSchema,
  platformStats: PlatformStatsSchema.optional()
});

export const ArtistProfileSchema = z.object({
  artistName: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1).nullable().optional(),
  country: z.string().trim().min(1).nullable().optional(),
  genres: z.array(z.string().trim().min(1)).default([]),
  spotifyArtistName: z.string().trim().min(1).nullable().optional(),
  spotifyGenres: z.array(z.string().trim().min(1)).default([]),
  youtubeChannelId: z.string().trim().min(1).nullable().optional(),
  youtubeTitle: z.string().trim().min(1).nullable().optional(),
  socialLinks: SocialLinksSchema.default({}),
  platformStats: PlatformStatsSchema.default({}),
  estimatedLevel: EstimatedArtistLevelSchema.default("unknown"),
  confidence: ConfidenceScoreSchema,
  notes: z.array(z.string().trim().min(1)).default([]),
  spotify: SpotifyMetadataSchema.nullable().default(null),
  imageUrl: z.string().trim().url().nullable().default(null),
  imageSource: ImageSourceSchema.default(null),
  imageConfidence: ConfidenceScoreSchema.nullable().default(null)
});

export const LineupStatusSchema = z.enum([
  "single_headliner_listed",
  "support_not_announced",
  "full_lineup_announced",
  "unknown"
]);

export const EventCandidateSchema = z.object({
  name: z.string().trim().min(1),
  date: z.string().trim().min(1).nullable(),
  venueName: z.string().trim().min(1).nullable(),
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  region: z.string().trim().min(1).nullable(),
  lineup: z.array(z.string().trim().min(1)).default([]),
  lineupStatus: LineupStatusSchema,
  sourceUrl: z.string().trim().url().nullable(),
  ticketUrl: z.string().trim().url().nullable(),
  description: z.string().trim().min(1),
  confidence: ConfidenceScoreSchema
});

export const VenueCandidateSchema = z.object({
  name: z.string().trim().min(1),
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  type: z.string().trim().min(1),
  estimatedCapacityTier: z.string().trim().min(1),
  genres: z.array(z.string().trim().min(1)).default([]),
  sourceUrl: z.string().trim().url().nullable(),
  contact: z.string().trim().min(1).nullable(),
  confidence: ConfidenceScoreSchema
});

export const SimilarArtistSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url().nullable(),
  spotifyUrl: z.string().trim().url().nullable().optional(),
  spotifyId: z.string().trim().min(1).nullable(),
  instagramUrl: z.string().trim().url().nullable().optional(),
  instagramHandle: z.string().trim().min(1).nullable().optional(),
  youtubeUrl: z.string().trim().url().nullable().optional(),
  youtubeChannelId: z.string().trim().min(1).nullable().optional(),
  youtubeSubscribers: z.number().int().nonnegative().nullable().optional(),
  youtubeTotalViews: z.number().int().nonnegative().nullable().optional(),
  youtubeVideoCount: z.number().int().nonnegative().nullable().optional(),
  genres: z.array(z.string().trim().min(1)).default([]),
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  source: SimilarArtistSourceSchema,
  sources: z.array(z.string().trim().min(1)).default([]),
  reason: z.string().trim().min(1),
  confidence: ConfidenceScoreSchema,
  sourceConfidence: ConfidenceScoreSchema.optional(),
  artistTier: ArtistTierSchema,
  bookingCategory: BookingCategorySchema.default("unknown"),
  estimatedFollowers: z.number().int().nonnegative().nullable(),
  estimatedPopularity: z.number().int().min(0).max(100).nullable(),
  topTrackPopularityMax: z.number().int().min(0).max(100).nullable().optional(),
  topTrackPopularityAvg: z.number().int().min(0).max(100).nullable().optional(),
  topTrackCount: z.number().int().nonnegative().nullable().optional(),
  sizeSignalSource: SizeSignalSourceSchema,
  genreRelevance: z.number().int().min(0).max(100),
  localRelevance: z.number().int().min(0).max(100).default(0),
  sizeRelevance: z.number().int().min(0).max(100),
  sceneRelevance: z.number().int().min(0).max(100),
  totalRelevance: z.number().int().min(0).max(100),
  relevanceToUserArtist: z.number().int().min(0).max(100),
  possibleUse: SimilarArtistPossibleUseSchema,
  estimatedLevel: EstimatedArtistLevelSchema.nullable(),
  evidenceNotes: z.array(z.string().trim().min(1)).default([]),
  sourceUrls: z.array(z.string().trim().url()).default([]),
  genreEvidence: z.array(GenreEvidenceSchema).default([]),
  locationEvidence: z.array(LocationEvidenceSchema).default([]),
  sizeEvidence: z.array(SizeEvidenceSchema).default([]),
  verificationStatus: VerificationStatusSchema.default("needs_verification"),
  popularity: PopularitySchema.default({
    estimatedLevel: "unknown",
    confidence: 0.2,
    sizeSignalSource: "unknown",
    platforms: {}
  }),
  discardedTags: z.array(z.string().trim().min(1)).default([]),
  matchedQuery: z.string().trim().min(1).nullable().optional(),
  searchRelevanceBoost: z.number().int().min(0).max(100).optional(),
  spotify: SpotifyMetadataSchema.nullable().default(null),
  imageUrl: z.string().trim().url().nullable().default(null),
  imageSource: ImageSourceSchema.default(null),
  imageConfidence: ConfidenceScoreSchema.nullable().default(null)
});

export const OpportunityInternalReviewSchema = z.object({
  needsReview: z.boolean(),
  missingFields: z.array(z.string().trim().min(1)),
  confidence: ConfidenceScoreSchema
});

export const OpportunityDateRangeSchema = z.object({
  start: z.string().trim().min(1),
  end: z.string().trim().min(1)
});

export const OpportunityRelatedArtistSchema = z.object({
  name: z.string().trim().min(1),
  popularityComparison: z.string().trim().min(1),
  matchedGenres: z.array(z.string().trim().min(1)).default([])
});

export const MatchFactorCodeSchema = z.enum([
  "genre_match",
  "location_match",
  "date_lead_time",
  "capacity_fit",
  "similar_artist_signal",
  "support_slot_signal",
  "contact_available",
  "lineup_availability",
  "source_confidence",
  "data_completeness"
]);

export const MatchFactorImpactSchema = z.enum(["positive", "negative", "neutral"]);

export const MatchFactorSchema = z.object({
  code: MatchFactorCodeSchema,
  label: z.string().trim().min(1),
  detail: z.string().trim().min(1).optional(),
  impact: MatchFactorImpactSchema,
  scoreContribution: z.number().optional()
});

export const SupportSlotStatusSchema = z.enum(["likely", "possible", "unlikely", "unknown"]);

export const SupportSlotPotentialSchema = z.object({
  status: SupportSlotStatusSchema,
  confidenceScore: z.number().int().min(0).max(100),
  reasons: z.array(z.string().trim().min(1)).default([])
});

export const OpportunityMatchBreakdownSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  positiveFactors: z.array(MatchFactorSchema).default([]),
  negativeFactors: z.array(MatchFactorSchema).default([]),
  // Factors representing missing/unverified information (e.g. "capacity
  // unknown"), distinct from confirmed negative signals like a genre
  // mismatch (issue #130 review feedback: unknown information must not be
  // presented as an actual risk).
  neutralFactors: z.array(MatchFactorSchema).default([])
});

export const OpportunitySchema = z.object({
  name: z.string().trim().min(1),
  // Raw scraped title, kept for traceability. Falls back to `name` for
  // opportunities produced outside the booking pipeline (e.g. promo mode).
  rawTitle: z.string().trim().min(1).optional(),
  // Clean, user-facing title. Frontend cards should render this instead of `name`.
  displayTitle: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1),
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  source_url: z.string().trim().url().nullable(),
  contact: z.string().trim().min(1).nullable(),
  reason: z.string().trim().min(1),
  score: z.number().int().min(0).max(100),
  suggested_message: z.string().trim().min(1),
  date: z.string().trim().min(1).nullable().optional(),
  dateRange: OpportunityDateRangeSchema.nullable().optional(),
  // Genres associated with the target (venue/festival/organization programming, or
  // event genre fit). Never guessed: empty means "unknown", per AGENTS.md.
  genres: z.array(z.string().trim().min(1)).default([]),
  // Known venue capacity, when a source reports it. Never guessed.
  venueCapacity: z.number().int().positive().nullable().optional(),
  // Full street address, when a source reports it. Never guessed.
  address: z.string().trim().min(1).nullable().optional(),
  // Past events/programming attributed to this target, when known.
  recentEvents: z.array(z.string().trim().min(1)).default([]),
  // Present only when this opportunity was surfaced from a similar artist's live history.
  relatedArtist: OpportunityRelatedArtistSchema.nullable().optional(),
  // Full announced lineup (headliner + support), when a source lists it. Never guessed.
  lineup: z.array(z.string().trim().min(1)).default([]),
  // Poster/event image URL, extracted from source page metadata. Never guessed.
  imageUrl: z.string().trim().url().nullable().optional(),
  // Ticket/booking purchase URL, when a source reports it. Never guessed.
  ticketUrl: OptionalUrlSchema,
  // Structured positive/negative match factors (issue #130 review feedback).
  // Frontend must render this instead of parsing `reason`/`suggested_message`.
  matchBreakdown: OpportunityMatchBreakdownSchema.optional(),
  // Structured support-slot-potential analysis (issue #158). Null when this
  // analysis doesn't apply to the opportunity type (e.g. festivals).
  supportSlotPotential: SupportSlotPotentialSchema.nullable().optional(),
  // Internal-only metadata; must not be surfaced directly on frontend cards.
  internalReview: OpportunityInternalReviewSchema.optional()
});

export const OpportunitySearchResultSchema = z.object({
  opportunities: z.array(OpportunitySchema)
});

/**
 * Unified model for both live opportunities (CONCERT, FESTIVAL) and
 * music-industry organizations (VENUE, LABEL, BOOKER, PROMOTER, MANAGER,
 * ASSOCIATION), per issue #124. Type-specific fields stay optional and are
 * only validated for the entity types they apply to.
 */
export const OpportunityEntityTypeSchema = z.enum([
  "CONCERT",
  "FESTIVAL",
  "VENUE",
  "LABEL",
  "BOOKER",
  "PROMOTER",
  "MANAGER",
  "ASSOCIATION"
]);

const EVENT_OPPORTUNITY_TYPES = ["CONCERT", "FESTIVAL"] as const;
export const ORGANIZATION_OPPORTUNITY_TYPES = [
  "VENUE",
  "LABEL",
  "BOOKER",
  "PROMOTER",
  "MANAGER",
  "ASSOCIATION"
] as const;

// Quality gate for CONCERT/FESTIVAL opportunities (issue #128): COMPLETE has
// every required field backed by source evidence, PARTIAL is missing fields
// covered by a documented exception (incomplete festival lineup, open call
// without a headliner), INVALID must be rejected or excluded from standard
// results (past event, no date, no venue/location, unsupported extraction,
// generic editorial page).
export const EventQualityStatusSchema = z.enum(["COMPLETE", "PARTIAL", "INVALID"]);

const EVENT_ONLY_FIELDS = [
  "eventDate",
  "doorsTime",
  "venueName",
  "venueCapacity",
  "headliners",
  "lineup",
  "ticketUrl",
  "applicationDeadline",
  "qualityStatus",
  "qualityIssues",
  "mergedSourceUrls"
] as const;

const ORGANIZATION_ONLY_FIELDS = [
  "organizationType",
  "rosterArtists",
  "services",
  "territories",
  "submissionPolicy",
  "acceptsUnsolicitedSubmissions"
] as const;

function isProvided(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

export const UnifiedOpportunitySchema = z
  .object({
    // Shared fields, common to every opportunity type.
    id: z.string().trim().min(1),
    type: OpportunityEntityTypeSchema,
    name: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable().optional(),
    websiteUrl: OptionalUrlSchema,
    sourceUrl: OptionalUrlSchema,
    country: z.string().trim().min(1).nullable().optional(),
    city: z.string().trim().min(1).nullable().optional(),
    address: z.string().trim().min(1).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    genres: z.array(z.string().trim().min(1)).default([]),
    artistSizes: z.array(ArtistTierSchema).default([]),
    // Contact fields are never fabricated: null/absent means "uncertain", per AGENTS.md.
    contactEmail: z.string().trim().email().nullable().optional(),
    contactFormUrl: OptionalUrlSchema,
    instagramUrl: OptionalUrlSchema,
    facebookUrl: OptionalUrlSchema,
    linkedinUrl: OptionalUrlSchema,
    lastVerifiedAt: z.string().trim().min(1).nullable().optional(),
    sourceName: z.string().trim().min(1).nullable().optional(),
    confidenceScore: ConfidenceScoreSchema.nullable().optional(),

    // Event-specific fields: only meaningful for CONCERT and FESTIVAL.
    eventDate: z.string().trim().min(1).nullable().optional(),
    doorsTime: z.string().trim().min(1).nullable().optional(),
    venueName: z.string().trim().min(1).nullable().optional(),
    // Known capacity of the venue hosting the event, when a source reports it.
    // Never guessed: absent/null means "unknown", per AGENTS.md.
    venueCapacity: z.number().int().positive().nullable().optional(),
    headliners: z.array(z.string().trim().min(1)).optional(),
    lineup: z.array(z.string().trim().min(1)).optional(),
    ticketUrl: OptionalUrlSchema,
    applicationDeadline: z.string().trim().min(1).nullable().optional(),
    // Populated by validateConcertOpportunityQuality (issue #128). Absent
    // until an opportunity has gone through quality validation.
    qualityStatus: EventQualityStatusSchema.optional(),
    // Human-readable reasons behind qualityStatus, e.g. "missing_venue".
    qualityIssues: z.array(z.string().trim().min(1)).optional(),
    // Source URLs of duplicate listings merged into this record, beyond the
    // canonical sourceUrl, kept for evidence traceability.
    mergedSourceUrls: z.array(z.string().trim().url()).optional(),

    // Organization-specific fields: only meaningful for VENUE, LABEL,
    // BOOKER, PROMOTER, MANAGER and ASSOCIATION.
    organizationType: z.string().trim().min(1).nullable().optional(),
    rosterArtists: z.array(z.string().trim().min(1)).optional(),
    services: z.array(z.string().trim().min(1)).optional(),
    territories: z.array(z.string().trim().min(1)).optional(),
    submissionPolicy: z.string().trim().min(1).nullable().optional(),
    acceptsUnsolicitedSubmissions: z.boolean().nullable().optional()
  })
  .superRefine((value, ctx) => {
    const isEventType = (EVENT_OPPORTUNITY_TYPES as readonly string[]).includes(value.type);
    const isOrganizationType = (ORGANIZATION_OPPORTUNITY_TYPES as readonly string[]).includes(value.type);

    if (!isEventType) {
      for (const field of EVENT_ONLY_FIELDS) {
        if (isProvided(value[field])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} only applies to CONCERT or FESTIVAL opportunities`
          });
        }
      }
    }

    if (!isOrganizationType) {
      for (const field of ORGANIZATION_ONLY_FIELDS) {
        if (isProvided(value[field])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} only applies to organization opportunities (VENUE, LABEL, BOOKER, PROMOTER, MANAGER, ASSOCIATION)`
          });
        }
      }
    }
  });

/**
 * Generic model for any music-industry opportunity (issue #167): concerts,
 * venues, festivals, labels, playlists, producers/engineers, visual
 * collaborators, etc. Shared fields apply to every type; type-specific
 * details live in dedicated, independently optional groups so populating
 * one type's metadata never touches another type's fields. Categories
 * without a dedicated group yet fall back to `typeSpecific`, keeping the
 * model extensible without a schema change for every new type.
 */
export const OpportunityCategorySchema = z.enum([
  "concert",
  "venue",
  "festival",
  "label",
  "booker",
  "booking_agency",
  "manager",
  "management_company",
  "playlist",
  "playlist_curator",
  "association",
  "collective",
  "promoter",
  "producer",
  "recording_studio",
  "sound_engineer",
  "mixing_engineer",
  "mastering_engineer",
  "visual_artist",
  "graphic_designer",
  "album_artwork_designer",
  "photographer",
  "videographer",
  "other"
]);

export const OpportunityGeographicScopeSchema = z.enum([
  "local",
  "regional",
  "national",
  "international",
  "online",
  "unknown"
]);

export const OpportunityStatusSchema = z.enum(["open", "closed", "invite_only", "unknown"]);

// Multiple sources can contribute to one consolidated entity; every one of
// them is retained instead of collapsing to a single "source" string.
export const OpportunitySourceReferenceSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url().nullable(),
  retrievedAt: z.string().trim().min(1).nullable().optional(),
  confidence: ConfidenceScoreSchema.optional()
});

export const OpportunitySocialLinksSchema = z.object({
  instagramUrl: OptionalUrlSchema,
  facebookUrl: OptionalUrlSchema,
  twitterUrl: OptionalUrlSchema,
  tiktokUrl: OptionalUrlSchema,
  youtubeUrl: OptionalUrlSchema,
  linkedinUrl: OptionalUrlSchema
});

export const ConcertOpportunityDetailsSchema = z.object({
  eventDate: z.string().trim().min(1).nullable().optional(),
  dateRange: OpportunityDateRangeSchema.nullable().optional(),
  doorsTime: z.string().trim().min(1).nullable().optional(),
  venueName: z.string().trim().min(1).nullable().optional(),
  headliners: z.array(z.string().trim().min(1)).default([]),
  lineup: z.array(z.string().trim().min(1)).default([]),
  ticketUrl: OptionalUrlSchema,
  applicationDeadline: z.string().trim().min(1).nullable().optional()
});

// Issue #197: the same provenance record used internally by label discovery
// (src/labels/types.ts LabelEvidence), reused rather than duplicated so the
// frontend's supporting-releases and sources sections cite exactly what
// backed the compatibility result — never a fabricated release/provider.
export const LabelEvidenceSchema = z.object({
  provider: z.enum(["musicbrainz", "discogs", "official_website", "bandcamp", "web_search"]),
  sourceUrl: z.string().trim().url().nullable(),
  similarArtistName: z.string().trim().min(1).nullable().optional(),
  releaseTitle: z.string().trim().min(1).nullable().optional(),
  confidence: ConfidenceScoreSchema
});

export const LabelExternalIdsSchema = z.object({
  musicBrainzId: z.string().trim().min(1).optional(),
  discogsId: z.number().int().optional()
});

export const LabelOpportunityDetailsSchema = z.object({
  signedArtists: z.array(z.string().trim().min(1)).default([]),
  labelGenres: z.array(z.string().trim().min(1)).default([]),
  territory: z.string().trim().min(1).nullable().optional(),
  acceptsDemos: z.boolean().nullable().optional(),
  demoSubmissionUrl: OptionalUrlSchema,
  distributor: z.string().trim().min(1).nullable().optional(),
  // Whether the label shows evidence of current activity (recent releases,
  // no closure/hiatus language). null means uncertain, per AGENTS.md — never
  // defaulted to true/false without textual evidence.
  isActive: z.boolean().nullable().optional(),
  // Issue #197: stable provider IDs (used to build MusicBrainz/Discogs
  // evidence links) and the official Bandcamp page, when structured
  // discovery/enrichment (issue #195) found one.
  externalIds: LabelExternalIdsSchema.nullable().optional(),
  bandcampUrl: OptionalUrlSchema,
  // Provenance trail (MusicBrainz release credits, Discogs releases, official
  // site/Bandcamp pages) supporting this label's compatibility explanation.
  evidence: z.array(LabelEvidenceSchema).default([])
});

export const PlaylistOpportunityDetailsSchema = z.object({
  platform: z.string().trim().min(1).nullable().optional(),
  playlistUrl: OptionalUrlSchema,
  curatorName: z.string().trim().min(1).nullable().optional(),
  followerCount: z.number().int().nonnegative().nullable().optional(),
  submissionPlatform: z.string().trim().min(1).nullable().optional(),
  submissionUrl: OptionalUrlSchema,
  submissionType: z.enum(["free", "paid", "unknown"]).default("unknown"),
  estimatedGenreFit: z.number().min(0).max(1).nullable().optional()
});

export const ProducerOrStudioOpportunityDetailsSchema = z.object({
  services: z.array(z.string().trim().min(1)).default([]),
  recordingLocation: z.string().trim().min(1).nullable().optional(),
  remoteWorkAvailable: z.boolean().nullable().optional(),
  previousArtists: z.array(z.string().trim().min(1)).default([]),
  genres: z.array(z.string().trim().min(1)).default([]),
  credits: z.array(z.string().trim().min(1)).default([]),
  portfolioUrl: OptionalUrlSchema,
  pricingIndication: z.string().trim().min(1).nullable().optional()
});

const PRODUCER_OR_STUDIO_OPPORTUNITY_TYPES = [
  "producer",
  "recording_studio",
  "sound_engineer",
  "mixing_engineer",
  "mastering_engineer"
] as const;

export const GenericOpportunitySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    opportunityType: OpportunityCategorySchema,
    shortDescription: z.string().trim().min(1).nullable().optional(),
    city: z.string().trim().min(1).nullable().optional(),
    country: z.string().trim().min(1).nullable().optional(),
    geographicScope: OpportunityGeographicScopeSchema.default("unknown"),
    websiteUrl: OptionalUrlSchema,
    sourceUrl: OptionalUrlSchema,
    contactPageUrl: OptionalUrlSchema,
    // Contact fields are never fabricated: null/absent means "uncertain", per AGENTS.md.
    publicEmail: z.string().trim().email().nullable().optional(),
    socialLinks: OpportunitySocialLinksSchema.default({}),
    associatedArtists: z.array(z.string().trim().min(1)).default([]),
    associatedGenres: z.array(z.string().trim().min(1)).default([]),
    // Reuses ArtistTierSchema: audience size buckets are the same concept
    // whether they describe an artist or an opportunity's typical audience.
    audienceLevel: ArtistTierSchema.default("unknown"),
    status: OpportunityStatusSchema.default("unknown"),
    applicationUrl: OptionalUrlSchema,
    sources: z.array(OpportunitySourceReferenceSchema).min(1, "at least one source reference is required"),
    lastVerifiedAt: z.string().trim().min(1).nullable().optional(),
    confidenceScore: ConfidenceScoreSchema,
    compatibilityScore: z.number().int().min(0).max(100).nullable().optional(),
    compatibilityExplanation: z.string().trim().min(1).nullable().optional(),
    dataCompleteness: z.number().min(0).max(1).nullable().optional(),

    // Type-specific detail groups, namespaced per category so filling one
    // never affects another opportunity type's fields.
    concert: ConcertOpportunityDetailsSchema.nullable().optional(),
    label: LabelOpportunityDetailsSchema.nullable().optional(),
    playlist: PlaylistOpportunityDetailsSchema.nullable().optional(),
    producerOrStudio: ProducerOrStudioOpportunityDetailsSchema.nullable().optional(),
    // Escape hatch for categories without a dedicated group yet (venue,
    // festival, booker, manager, visual/graphic roles, etc.).
    typeSpecific: z.record(z.string(), z.unknown()).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.concert && value.opportunityType !== "concert") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["concert"],
        message: "concert details only apply to concert opportunities"
      });
    }
    if (value.label && value.opportunityType !== "label") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["label"],
        message: "label details only apply to label opportunities"
      });
    }
    if (value.playlist && value.opportunityType !== "playlist") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["playlist"],
        message: "playlist details only apply to playlist opportunities"
      });
    }
    if (
      value.producerOrStudio &&
      !(PRODUCER_OR_STUDIO_OPPORTUNITY_TYPES as readonly string[]).includes(value.opportunityType)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["producerOrStudio"],
        message:
          "producerOrStudio details only apply to producer, recording_studio, sound_engineer, mixing_engineer or mastering_engineer opportunities"
      });
    }
  });

export type Mode = z.infer<typeof ModeSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type PipelineExecutionStatus = z.infer<typeof PipelineExecutionStatusSchema>;
export type EstimatedArtistLevel = z.infer<typeof EstimatedArtistLevelSchema>;
export type LineupStatus = z.infer<typeof LineupStatusSchema>;
export type ArtistTier = z.infer<typeof ArtistTierSchema>;
export type BookingCategory = z.infer<typeof BookingCategorySchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type ImageSource = z.infer<typeof ImageSourceSchema>;
export type SizeSignalSource = z.infer<typeof SizeSignalSourceSchema>;
export type SimilarArtistSource = z.infer<typeof SimilarArtistSourceSchema>;
export type SimilarArtistPossibleUse = z.infer<typeof SimilarArtistPossibleUseSchema>;
export type GenreEvidence = z.infer<typeof GenreEvidenceSchema>;
export type LocationEvidence = z.infer<typeof LocationEvidenceSchema>;
export type SizeEvidence = z.infer<typeof SizeEvidenceSchema>;
export type Popularity = z.infer<typeof PopularitySchema>;
export type SpotifyMetadata = z.infer<typeof SpotifyMetadataSchema>;
export type SocialLinks = z.infer<typeof SocialLinksSchema>;
export type PlatformStats = z.infer<typeof PlatformStatsSchema>;
export type ArtistProfile = z.infer<typeof ArtistProfileSchema>;
export type ArtistInput = z.infer<typeof ArtistInputSchema>;
export type EventCandidate = z.infer<typeof EventCandidateSchema>;
export type VenueCandidate = z.infer<typeof VenueCandidateSchema>;
export type SimilarArtist = z.infer<typeof SimilarArtistSchema>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type OpportunityInternalReview = z.infer<typeof OpportunityInternalReviewSchema>;
export type OpportunityDateRange = z.infer<typeof OpportunityDateRangeSchema>;
export type OpportunityRelatedArtist = z.infer<typeof OpportunityRelatedArtistSchema>;
export type MatchFactorCode = z.infer<typeof MatchFactorCodeSchema>;
export type MatchFactorImpact = z.infer<typeof MatchFactorImpactSchema>;
export type MatchFactor = z.infer<typeof MatchFactorSchema>;
export type OpportunityMatchBreakdown = z.infer<typeof OpportunityMatchBreakdownSchema>;
export type SupportSlotStatus = z.infer<typeof SupportSlotStatusSchema>;
export type SupportSlotPotential = z.infer<typeof SupportSlotPotentialSchema>;
export type OpportunitySearchResult = z.infer<typeof OpportunitySearchResultSchema>;
export type OpportunityEntityType = z.infer<typeof OpportunityEntityTypeSchema>;
export type UnifiedOpportunity = z.infer<typeof UnifiedOpportunitySchema>;
export type EventQualityStatus = z.infer<typeof EventQualityStatusSchema>;
export type OpportunityCategory = z.infer<typeof OpportunityCategorySchema>;
export type OpportunityGeographicScope = z.infer<typeof OpportunityGeographicScopeSchema>;
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;
export type OpportunitySourceReference = z.infer<typeof OpportunitySourceReferenceSchema>;
export type OpportunitySocialLinks = z.infer<typeof OpportunitySocialLinksSchema>;
export type ConcertOpportunityDetails = z.infer<typeof ConcertOpportunityDetailsSchema>;
export type LabelEvidence = z.infer<typeof LabelEvidenceSchema>;
export type LabelExternalIds = z.infer<typeof LabelExternalIdsSchema>;
export type LabelOpportunityDetails = z.infer<typeof LabelOpportunityDetailsSchema>;
export type PlaylistOpportunityDetails = z.infer<typeof PlaylistOpportunityDetailsSchema>;
export type ProducerOrStudioOpportunityDetails = z.infer<typeof ProducerOrStudioOpportunityDetailsSchema>;
export type GenericOpportunity = z.infer<typeof GenericOpportunitySchema>;
