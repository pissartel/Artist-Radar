export { runOpportunitySearch } from "./pipeline.js";
export { collectArtistProfile, estimateArtistLevel, extractSocialLinks } from "./modules/profileCollector.js";
export {
  determineAbsoluteArtistTier,
  findSimilarArtists,
  groupSimilarArtistsByTier,
  mapSpotifyArtistToSimilarArtist,
  scoreGenreRelevance,
  scoreSceneRelevance,
  scoreSizeRelevance
} from "./modules/similarArtistsFinder.js";
export {
  extractSpotifyArtistId,
  getSpotifyArtistProfile,
  getSpotifyRelatedArtists,
  searchSpotifyArtists
} from "./services/spotifyService.js";
export { extractYouTubeChannelIdentifier, getYouTubeChannelStats } from "./services/youtubeService.js";
export { findVenueEventCandidates } from "./modules/venueEventFinder.js";
export type { OpportunitySearchRunResult } from "./pipeline.js";
export type { SimilarArtistsByTier } from "./modules/similarArtistsFinder.js";
export type {
  ArtistTier,
  ArtistInput,
  ArtistProfile,
  EstimatedArtistLevel,
  EventCandidate,
  LineupStatus,
  Mode,
  Opportunity,
  OpportunitySearchResult,
  PlatformStats,
  SimilarArtist,
  SimilarArtistPossibleUse,
  SimilarArtistSource,
  SocialLinks,
  VenueCandidate
} from "./schemas.js";
export {
  ArtistTierSchema,
  ArtistInputSchema,
  ArtistProfileSchema,
  ConfidenceScoreSchema,
  EstimatedArtistLevelSchema,
  EventCandidateSchema,
  LineupStatusSchema,
  ModeSchema,
  OpportunitySchema,
  OpportunitySearchResultSchema,
  PlatformStatsSchema,
  SimilarArtistSchema,
  SimilarArtistPossibleUseSchema,
  SimilarArtistSourceSchema,
  SocialLinksSchema,
  VenueCandidateSchema
} from "./schemas.js";
export { eventsToCsv, exportOpportunities, opportunitiesToCsv, similarArtistsToCsv } from "./services/exportService.js";
