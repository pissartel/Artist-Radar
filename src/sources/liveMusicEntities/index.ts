export {
  LIVE_OPPORTUNITY_ENTITY_TYPES,
  LiveOpportunityEntityTypeSchema,
  VENUE_LIKE_ENTITY_TYPES,
  ORGANIZATION_LIKE_ENTITY_TYPES,
  isVenueEntityType,
  isOrganizationEntityType,
  LiveMusicSourceTypeSchema,
  LiveMusicSourceRecordSchema,
  ActivityEvidenceKindSchema,
  ActivityEvidenceSchema,
  LiveMusicEntityCandidateSchema,
  parseLiveMusicEntityCandidate
} from "./types.js";
export type {
  LiveOpportunityEntityType,
  LiveMusicSourceType,
  LiveMusicSourceRecord,
  ActivityEvidenceKind,
  ActivityEvidence,
  LiveMusicEntityCandidate,
  VerificationStatus,
  VenueEntity,
  OrganizationEntity,
  ArtistEntity,
  LiveMusicEventObservation,
  OrganizationOrganizesEventRelationship,
  EventTakesPlaceAtVenueRelationship,
  ArtistPerformsAtEventRelationship,
  OrganizationOperatesVenueRelationship,
  OrganizationRegularlyUsesVenueRelationship,
  LiveMusicEntityRelationship
} from "./types.js";

export {
  classifyLiveMusicEntityTypeFromText,
  classifyLiveMusicEntityTypeFromOsmTags
} from "./entityTypeMapping.js";
export type { EntityTypeClassification, OsmTags } from "./entityTypeMapping.js";

export { hasQualifyingActivityEvidence, qualifyLiveMusicEntityCandidates } from "./activityEvidence.js";
export type { LiveMusicEntityLike } from "./activityEvidence.js";

export {
  DEFAULT_LIVE_MUSIC_SEARCH_RADIUS_KM,
  resolveLiveMusicSearchRadiusKm,
  resolveGeographicSearchScope,
  allSearchLocations,
  distanceKm,
  isWithinRadiusKm
} from "./geoDiscoveryConfig.js";
export type { GeographicSearchScopeInput, GeographicSearchScope, GeoPoint } from "./geoDiscoveryConfig.js";

export { buildLiveMusicEntityDiscoveryQueries } from "./queryTemplates.js";
export type { LiveMusicQueryContext } from "./queryTemplates.js";

export { computeLiveMusicEntityMatchKeys, mergeLiveMusicEntityCandidates } from "./entityResolution.js";

export { separateVenuesAndOrganizations } from "./venueOrganizationSeparation.js";
export type {
  IdentifiedCandidate,
  SeparateVenuesAndOrganizationsOptions,
  SeparateVenuesAndOrganizationsResult
} from "./venueOrganizationSeparation.js";
