export { runOpportunitySearch } from "./pipeline.js";
export { collectArtistProfile, estimateArtistLevel, extractSocialLinks } from "./modules/profileCollector.js";
export { estimateArtistSize } from "./modules/sizeEstimator.js";
export {
  determineAbsoluteArtistTier,
  findSimilarArtists,
  groupSimilarArtistsByTier,
  mapSpotifyArtistToSimilarArtist,
  scoreGenreRelevance,
  scoreGenreRelevanceWithContext,
  scoreSceneRelevance,
  scoreSizeRelevance
} from "./modules/similarArtistsFinder.js";
export { buildLastFmSimilarArtistProvider } from "./providers/LastFmSimilarArtistProvider.js";
export { buildWebLocalSceneProvider } from "./providers/WebLocalSceneProvider.js";
export {
  InstagramHandleExtractor,
  extractInstagramHandles,
  normalizeInstagramHandle,
  normalizeInstagramHandleUrl
} from "./modules/instagramHandleExtractor.js";
export {
  GENRE_FAMILIES,
  KNOWN_MUSIC_GENRES,
  cleanArtistGenres,
  classifyGenreSpecificity,
  collectGenreGateGenres,
  evaluateGenreCompatibility,
  isLocationOrLanguageTag,
  normalizeGenre
} from "./modules/genreCleaner.js";
export {
  findSeedCandidatesByGenreAndTarget,
  loadSeedCandidates,
  validateSeedCandidateForRealMode
} from "./modules/similarArtistSeeds.js";
export { getLastFmSimilarArtists } from "./services/lastfmService.js";
export {
  enrichArtistWithMusicBrainz,
  getMusicBrainzUserAgent,
  searchMusicBrainzArtistByName,
  searchMusicBrainzArtistMetadata
} from "./services/musicBrainzService.js";
export { verifyAndEnrichArtistCandidate } from "./services/artistVerificationService.js";
export { consolidateArtistCandidate } from "./services/artistConsolidationService.js";
export { buildFirecrawlWebSearchProvider, isFirecrawlConsolidationEnabled } from "./services/firecrawlService.js";
export {
  extractSpotifyArtistId,
  createSpotifyCapabilities,
  getSpotifyArtistProfile,
  getSpotifyArtistById,
  getSpotifyRelatedArtists,
  searchSpotifyArtists
} from "./services/spotifyService.js";
export type { SpotifyCapabilities } from "./services/spotifyService.js";
export { extractYouTubeChannelIdentifier, getYouTubeChannelStats, parseYouTubeChannelInput } from "./services/youtubeService.js";
export { findVenueEventCandidates } from "./modules/venueEventFinder.js";
export type { OpportunitySearchRunResult } from "./pipeline.js";
export type {
  WebLocalSceneArtistDiscovery,
  WebLocalSceneProvider,
  WebLocalSceneProviderInput,
  WebLocalSceneProviderResult,
  WebLocalSceneSourcePage,
  WebLocalSceneSourceType
} from "./providers/WebLocalSceneProvider.js";
export type {
  CleanArtistGenresResult,
  GenreCleaningContext,
  GenreCompatibilityLevel,
  GenreCompatibilityResult,
  GenreFamily,
  GenreSpecificity
} from "./modules/genreCleaner.js";
export type {
  InstagramHandleExtraction,
  InstagramHandleExtractionInput
} from "./modules/instagramHandleExtractor.js";
export type { SimilarArtistsByTier } from "./modules/similarArtistsFinder.js";
export type {
  ArtistTier,
  ArtistInput,
  ArtistProfile,
  BookingCategory,
  EstimatedArtistLevel,
  EventCandidate,
  LineupStatus,
  Mode,
  Opportunity,
  OpportunitySearchResult,
  Popularity,
  PlatformStats,
  SimilarArtist,
  SimilarArtistPossibleUse,
  SizeSignalSource,
  SimilarArtistSource,
  SocialLinks,
  VerificationStatus,
  GenreEvidence,
  LocationEvidence,
  SizeEvidence,
  VenueCandidate
} from "./schemas.js";
export type {
  ArtistConsolidationCandidate,
  ArtistConsolidationContext,
  ArtistConsolidationResult
} from "./services/artistConsolidationService.js";
export type { FirecrawlEnv } from "./services/firecrawlService.js";
export type {
  ArtistVerificationCandidate,
  ArtistVerificationContext,
  ArtistVerificationResult,
  ArtistVerificationStatus,
  WebSearchProvider,
  WebSearchResult
} from "./services/artistVerificationService.js";
export {
  ArtistTierSchema,
  ArtistInputSchema,
  ArtistProfileSchema,
  BookingCategorySchema,
  ConfidenceScoreSchema,
  EstimatedArtistLevelSchema,
  EventCandidateSchema,
  GenreEvidenceSchema,
  LocationEvidenceSchema,
  LineupStatusSchema,
  ModeSchema,
  OpportunitySchema,
  OpportunitySearchResultSchema,
  PopularitySchema,
  PlatformStatsSchema,
  SimilarArtistSchema,
  SimilarArtistPossibleUseSchema,
  SimilarArtistSourceSchema,
  SizeEvidenceSchema,
  SocialLinksSchema,
  VerificationStatusSchema,
  VenueCandidateSchema
} from "./schemas.js";
export { eventsToCsv, exportOpportunities, opportunitiesToCsv, similarArtistsToCsv } from "./services/exportService.js";
