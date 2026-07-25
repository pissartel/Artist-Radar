import { z } from "zod";

// Every type an independent artist can actually be booked by (issue #183),
// not just conventional concert halls. Values are intentionally lowercase
// snake_case and use the Latin "mjc" (never the visually similar Cyrillic
// "мjc") since this literal is compared and persisted as plain ASCII.
export const LIVE_OPPORTUNITY_ENTITY_TYPES = [
  "concert_venue",
  "smac",
  "bar",
  "pub",
  "cafe_concert",
  "club",
  "cultural_center",
  "mjc",
  "municipal_venue",
  "third_place",
  "association",
  "collective",
  "promoter",
  "festival_organizer",
  "other_live_music_organization"
] as const;

export const LiveOpportunityEntityTypeSchema = z.enum(LIVE_OPPORTUNITY_ENTITY_TYPES);
export type LiveOpportunityEntityType = z.infer<typeof LiveOpportunityEntityTypeSchema>;

// Physical places that can host a show. An event "takes place at" one of these.
export const VENUE_LIKE_ENTITY_TYPES: ReadonlySet<LiveOpportunityEntityType> = new Set([
  "concert_venue",
  "smac",
  "bar",
  "pub",
  "cafe_concert",
  "club",
  "cultural_center",
  "mjc",
  "municipal_venue",
  "third_place"
]);

// Structures that organize/produce shows but are not themselves a single
// physical place. A promoter "organizes" an event; it does not become a venue
// just because it shares an event with one (issue #183 core requirement).
export const ORGANIZATION_LIKE_ENTITY_TYPES: ReadonlySet<LiveOpportunityEntityType> = new Set([
  "association",
  "collective",
  "promoter",
  "festival_organizer",
  "other_live_music_organization"
]);

export function isVenueEntityType(entityType: LiveOpportunityEntityType): boolean {
  return VENUE_LIKE_ENTITY_TYPES.has(entityType);
}

export function isOrganizationEntityType(entityType: LiveOpportunityEntityType): boolean {
  return ORGANIZATION_LIKE_ENTITY_TYPES.has(entityType);
}

export const LiveMusicSourceTypeSchema = z.enum([
  "openagenda",
  "overpass_osm",
  "musicbrainz",
  "trusted_directory",
  "web_discovery",
  "next_stage"
]);
export type LiveMusicSourceType = z.infer<typeof LiveMusicSourceTypeSchema>;

// One entity's contribution from a single discovery adapter, kept verbatim
// (never averaged/overwritten) so attribution and verification dates stay
// visible (acceptance criterion: "Entity sources and verification dates
// remain visible"). Provider-specific fields belong in `raw`, not in the
// shared candidate shape, per issue #183's adapter-abstraction requirement.
export const LiveMusicSourceRecordSchema = z.object({
  sourceType: LiveMusicSourceTypeSchema,
  sourceName: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  retrievedAt: z.string().trim().min(1),
  reliabilityScore: z.number().min(0).max(1),
  raw: z.record(z.string(), z.unknown()).optional()
});
export type LiveMusicSourceRecord = z.infer<typeof LiveMusicSourceRecordSchema>;

// Qualifying evidence kinds per issue #183's "Qualification evidence"
// requirement. A directory listing alone is never one of these kinds.
export const ActivityEvidenceKindSchema = z.enum([
  "recent_event",
  "current_programme_page",
  "historical_music_event",
  "explicit_live_music_activity",
  "organizes_concerts_confirmation"
]);
export type ActivityEvidenceKind = z.infer<typeof ActivityEvidenceKindSchema>;

export const ActivityEvidenceSchema = z.object({
  kind: ActivityEvidenceKindSchema,
  description: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  // When the evidence concerns a specific event (e.g. a recent/historical
  // show), the date of that event. Null when the evidence is a standing
  // signal (e.g. an "our programme" page) rather than a dated occurrence.
  observedAt: z.string().trim().min(1).nullable().default(null),
  collectedAt: z.string().trim().min(1),
  confidence: z.number().min(0).max(1)
});
export type ActivityEvidence = z.infer<typeof ActivityEvidenceSchema>;

// Common candidate structure every discovery adapter normalizes into,
// per issue #183's technical requirements. `address` and `phone` are kept
// optional additions (beyond the issue's literal shape) because entity
// resolution explicitly needs them as match keys.
export const LiveMusicEntityCandidateSchema = z.object({
  externalIds: z.record(z.string(), z.string()),
  name: z.string().trim().min(1),
  entityType: LiveOpportunityEntityTypeSchema,
  city: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  address: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  websiteUrl: z.string().trim().url().optional(),
  programmeUrl: z.string().trim().url().optional(),
  sourceRecords: z.array(LiveMusicSourceRecordSchema),
  activityEvidence: z.array(ActivityEvidenceSchema)
});
export type LiveMusicEntityCandidate = z.infer<typeof LiveMusicEntityCandidateSchema>;

export function parseLiveMusicEntityCandidate(input: unknown): LiveMusicEntityCandidate {
  return LiveMusicEntityCandidateSchema.parse(input);
}

export type VerificationStatus = "verified" | "unverified";

interface LiveMusicEntityCommon {
  id: string;
  name: string;
  entityType: LiveOpportunityEntityType;
  city: string | null;
  country: string | null;
  websiteUrl: string | null;
  programmeUrl: string | null;
  sourceRecords: LiveMusicSourceRecord[];
  activityEvidence: ActivityEvidence[];
  verificationStatus: VerificationStatus;
  confidence: number;
  lastVerifiedAt: string | null;
}

// The physical place an event takes place at.
export interface VenueEntity extends LiveMusicEntityCommon {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

// The structure that organizes/produces events, independent of any one venue.
export interface OrganizationEntity extends LiveMusicEntityCommon {
  relatedVenueIds: string[];
}

export interface ArtistEntity {
  id: string;
  name: string;
}

// A single observed/announced show, used to link Organization, Venue and
// Artist entities without merging them (issue #183: "Do not merge a
// promoter into a venue simply because they share the same event").
export interface LiveMusicEventObservation {
  id: string;
  name: string;
  date: string | null;
  venueCandidateId: string | null;
  organizerCandidateId: string | null;
  performingArtistNames: string[];
  sourceUrl: string | null;
}

export interface OrganizationOrganizesEventRelationship {
  relationshipType: "organizes";
  organizationId: string;
  eventId: string;
}

export interface EventTakesPlaceAtVenueRelationship {
  relationshipType: "takes_place_at";
  eventId: string;
  venueId: string;
}

export interface ArtistPerformsAtEventRelationship {
  relationshipType: "performs_at";
  artistName: string;
  eventId: string;
}

export interface OrganizationOperatesVenueRelationship {
  relationshipType: "operates";
  organizationId: string;
  venueId: string;
}

export interface OrganizationRegularlyUsesVenueRelationship {
  relationshipType: "regularly_uses";
  organizationId: string;
  venueId: string;
  eventCount: number;
}

export type LiveMusicEntityRelationship =
  | OrganizationOrganizesEventRelationship
  | EventTakesPlaceAtVenueRelationship
  | ArtistPerformsAtEventRelationship
  | OrganizationOperatesVenueRelationship
  | OrganizationRegularlyUsesVenueRelationship;
