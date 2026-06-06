import { z } from "zod";

export const ModeSchema = z.enum(["booking", "promo"]);
export const EstimatedArtistLevelSchema = z.enum(["unknown", "emerging", "developing", "established"]);
export const ArtistTierSchema = z.enum(["small", "medium", "large", "unknown"]);
export const SimilarArtistPossibleUseSchema = z.enum([
  "co_bill",
  "support_target",
  "reference",
  "long_term_reference",
  "unknown"
]);
export const ConfidenceScoreSchema = z.number().min(0).max(1);

const OptionalUrlSchema = z.string().trim().url().nullable().optional();

export const SocialLinksSchema = z.object({
  spotifyUrl: OptionalUrlSchema,
  youtubeUrl: OptionalUrlSchema,
  instagramUrl: OptionalUrlSchema
});

export const PlatformStatsSchema = z.object({
  spotifyFollowers: z.number().int().nonnegative().nullable().optional(),
  spotifyPopularity: z.number().int().min(0).max(100).nullable().optional(),
  youtubeSubscribers: z.number().int().nonnegative().nullable().optional(),
  youtubeTotalViews: z.number().int().nonnegative().nullable().optional(),
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
  socialLinks: SocialLinksSchema.default({}),
  platformStats: PlatformStatsSchema.default({}),
  estimatedLevel: EstimatedArtistLevelSchema.default("unknown"),
  confidence: ConfidenceScoreSchema,
  notes: z.array(z.string().trim().min(1)).default([])
});

export const SimilarArtistSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().trim().url().nullable(),
  genres: z.array(z.string().trim().min(1)).default([]),
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  source: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  confidence: ConfidenceScoreSchema,
  artistTier: ArtistTierSchema,
  estimatedFollowers: z.number().int().nonnegative().nullable(),
  estimatedPopularity: z.number().int().min(0).max(100).nullable(),
  relevanceToUserArtist: z.string().trim().min(1),
  possibleUse: SimilarArtistPossibleUseSchema,
  estimatedLevel: EstimatedArtistLevelSchema.nullable()
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
export type ArtistTier = z.infer<typeof ArtistTierSchema>;
export type SimilarArtistPossibleUse = z.infer<typeof SimilarArtistPossibleUseSchema>;
export type SocialLinks = z.infer<typeof SocialLinksSchema>;
export type PlatformStats = z.infer<typeof PlatformStatsSchema>;
export type ArtistProfile = z.infer<typeof ArtistProfileSchema>;
export type ArtistInput = z.infer<typeof ArtistInputSchema>;
export type SimilarArtist = z.infer<typeof SimilarArtistSchema>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type OpportunitySearchResult = z.infer<typeof OpportunitySearchResultSchema>;
