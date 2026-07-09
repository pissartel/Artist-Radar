import { z } from "zod";

export const ModeSchema = z.enum(["booking", "promo"]);
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

const OptionalUrlSchema = z.string().trim().url().nullable().optional();

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
  spotify: SpotifyMetadataSchema.nullable().default(null)
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
  spotify: SpotifyMetadataSchema.nullable().default(null)
});

export const OpportunitySchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  source_url: z.string().trim().url().nullable(),
  contact: z.string().trim().min(1).nullable(),
  reason: z.string().trim().min(1),
  score: z.number().int().min(0).max(100),
  suggested_message: z.string().trim().min(1)
});

export const OpportunitySearchResultSchema = z.object({
  opportunities: z.array(OpportunitySchema)
});

export type Mode = z.infer<typeof ModeSchema>;
export type EstimatedArtistLevel = z.infer<typeof EstimatedArtistLevelSchema>;
export type LineupStatus = z.infer<typeof LineupStatusSchema>;
export type ArtistTier = z.infer<typeof ArtistTierSchema>;
export type BookingCategory = z.infer<typeof BookingCategorySchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
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
export type OpportunitySearchResult = z.infer<typeof OpportunitySearchResultSchema>;
