export { runOpportunitySearch } from "./pipeline.js";
export { collectArtistProfile, estimateArtistLevel, extractSocialLinks } from "./modules/profileCollector.js";
export { findSimilarArtists, groupSimilarArtistsByTier } from "./modules/similarArtistsFinder.js";
export { extractSpotifyArtistId, getSpotifyArtistProfile } from "./services/spotifyService.js";
export type { OpportunitySearchRunResult } from "./pipeline.js";
export type { SimilarArtistsByTier } from "./modules/similarArtistsFinder.js";
export type {
  ArtistTier,
  ArtistInput,
  ArtistProfile,
  EstimatedArtistLevel,
  Mode,
  Opportunity,
  OpportunitySearchResult,
  PlatformStats,
  SimilarArtist,
  SimilarArtistPossibleUse,
  SocialLinks
} from "./schemas.js";
export {
  ArtistTierSchema,
  ArtistInputSchema,
  ArtistProfileSchema,
  ConfidenceScoreSchema,
  EstimatedArtistLevelSchema,
  ModeSchema,
  OpportunitySchema,
  OpportunitySearchResultSchema,
  PlatformStatsSchema,
  SimilarArtistSchema,
  SimilarArtistPossibleUseSchema,
  SocialLinksSchema
} from "./schemas.js";
export { exportOpportunities, opportunitiesToCsv, similarArtistsToCsv } from "./services/exportService.js";
