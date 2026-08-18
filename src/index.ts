export { runOpportunitySearch } from "./pipeline.js";
export {
  PIPELINE_STAGE_ORDER,
  getPipelineExecutionState
} from "./pipelineExecutionState.js";
export type { PipelineExecutionError, PipelineExecutionState } from "./pipelineExecutionState.js";
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
  ExaSearchProvider,
  FirecrawlExtractProvider,
  FirecrawlSearchProvider,
  JinaExtractProvider,
  NoopSearchProvider,
  TavilySearchProvider,
  buildDefaultWebExtractProvider,
  buildDefaultWebSearchProvider,
  getEnabledExtractProviders,
  getEnabledSearchProviders
} from "./providers/web/providers.js";
export {
  buildDefaultBookingSourceProviders,
  buildNoopBookingSourceProvider
} from "./booking/providers/BookingSourceProvider.js";
export { buildFirecrawlBookingSourceProvider } from "./booking/providers/FirecrawlBookingSourceProvider.js";
export { buildMockBookingSourceProvider } from "./booking/providers/MockBookingSourceProvider.js";
export { buildOpenAgendaBookingSourceProvider } from "./booking/providers/OpenAgendaBookingSourceProvider.js";
export { buildWebSearchBookingSourceProvider } from "./booking/providers/WebSearchBookingSourceProvider.js";
export { classifyBookingTarget } from "./booking/classifyTarget.js";
export { extractPublicContactSignals, pickBestContact } from "./booking/contactExtraction.js";
export { getRelatedGenres, matchBookingGenres } from "./booking/genreMatching.js";
export { normalizeBookingSource } from "./booking/normalizeBookingTarget.js";
export { recommendBookingAction, scoreBookingCompatibility } from "./booking/scoring.js";
export { searchBookingOpportunities } from "./booking/searchBookingOpportunities.js";
export {
  buildDefaultManagerDiscoveryOptions,
  clearManagerDiscoveryCacheForTests,
  discoverManagerOpportunities,
  mergeAndDeduplicate
} from "./managers/discoverManagerOpportunities.js";
export type {
  DiscoverManagerOpportunitiesOptions,
  ManagerDiscoveryResult
} from "./managers/discoverManagerOpportunities.js";
export type {
  ManagementRelationshipStatus,
  ManagerDiscoveryMode,
  ManagerDiscoveryStrategy,
  ManagerEntityType,
  ManagerSearchInput,
  RawManagerCandidate
} from "./managers/types.js";
export {
  BookingOutputWriteError,
  formatBookingOutputLog,
  writeBookingRequestOutputs
} from "./booking/output/writeBookingRequestOutputs.js";
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
export {
  computeArtistScaleForAnalysis,
  type ComputeArtistScaleForAnalysisInput,
  type ComputeArtistScaleForAnalysisResult
} from "./modules/artistScaleEnrichment.js";
export {
  DEFAULT_COMPONENT_WEIGHTS as ARTIST_SCALE_DEFAULT_COMPONENT_WEIGHTS,
  DEFAULT_MAX_COMPONENT_SHARE as ARTIST_SCALE_DEFAULT_MAX_COMPONENT_SHARE,
  DEFAULT_SCALE_BANDS as ARTIST_SCALE_DEFAULT_SCALE_BANDS,
  scoreArtistScale,
  type ArtistScaleComponentWeights,
  type ArtistScaleScoreInput,
  type ArtistScaleScoreOptions,
  type ArtistScaleScoreResult,
  type ScaleBandThreshold
} from "./scoring/artistScaleScore.js";
export {
  DEFAULT_ARTIST_SCALE_COMPARISON_THRESHOLDS,
  compareArtistScaleToSimilarArtists,
  type ArtistScaleComparisonResult,
  type ArtistScaleComparisonThresholds
} from "./scoring/artistScaleComparison.js";
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
  PipelineExecutionStatus,
  PipelineStage,
  Popularity,
  PlatformStats,
  SimilarArtist,
  ArtistScale,
  ArtistScaleBand,
  ArtistScaleComparison,
  ArtistScaleComparisonClassification,
  ArtistScaleComparisonUnavailableReason,
  ArtistScaleScoreComponents,
  ArtistScaleScoreConfidence,
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
  ArtistVerificationStatus
} from "./services/artistVerificationService.js";
export type {
  WebSearchProvider,
  WebSearchResult
} from "./providers/web/WebSearchProvider.js";
export type {
  WebExtractOptions,
  WebExtractProvider,
  WebExtractResult
} from "./providers/web/WebExtractProvider.js";
export type { WebProviderEnv } from "./providers/web/providers.js";
export type {
  BookingOpportunity,
  BookingScore,
  BookingSearchInput,
  BookingSearchResult,
  BookingSourceType,
  BookingSourceMetadata,
  BookingTarget,
  BookingTargetCategory,
  ContactCandidate,
  ContactCandidateType
} from "./booking/types.js";
export type {
  BookingSourceProvider,
  BookingSourceProviderContext,
  BookingSourceProviderResult
} from "./booking/providers/BookingSourceProvider.js";
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
  PipelineExecutionStatusSchema,
  PipelineStageSchema,
  PopularitySchema,
  PlatformStatsSchema,
  SimilarArtistSchema,
  ArtistScaleSchema,
  ArtistScaleBandSchema,
  ArtistScaleComparisonSchema,
  ArtistScaleComparisonClassificationSchema,
  ArtistScaleComparisonUnavailableReasonSchema,
  ArtistScaleScoreComponentsSchema,
  ArtistScaleScoreConfidenceSchema,
  SimilarArtistPossibleUseSchema,
  SimilarArtistSourceSchema,
  SizeEvidenceSchema,
  SocialLinksSchema,
  VerificationStatusSchema,
  VenueCandidateSchema
} from "./schemas.js";
export {
  eventsToCsv,
  exportOpportunities,
  opportunitiesToCsv,
  similarArtistsToCsv
} from "./services/exportService.js";
