import { hasQualifyingActivityEvidence } from "./activityEvidence.js";
import { isOrganizationEntityType, isVenueEntityType } from "./types.js";
import type {
  LiveMusicEntityCandidate,
  LiveMusicEntityRelationship,
  LiveMusicEventObservation,
  OrganizationEntity,
  VenueEntity,
  VerificationStatus
} from "./types.js";

export interface IdentifiedCandidate {
  id: string;
  candidate: LiveMusicEntityCandidate;
}

export interface SeparateVenuesAndOrganizationsOptions {
  /** Minimum distinct events at the same venue before "regularly uses" is inferred. */
  regularUseEventThreshold?: number;
}

export interface SeparateVenuesAndOrganizationsResult {
  venues: VenueEntity[];
  organizations: OrganizationEntity[];
  relationships: LiveMusicEntityRelationship[];
  warnings: string[];
}

const DEFAULT_REGULAR_USE_EVENT_THRESHOLD = 2;
const OPERATES_EVIDENCE_PATTERN = /\b(operated by|run by|owned by|managed by|g[ée]r[ée] par|exploit[ée] par)\b/i;

/**
 * Builds separate Venue and Organization entities from resolved candidates,
 * plus the relationships linking them through observed events. This is the
 * core of issue #183's requirement to never merge a promoter into a venue
 * just because they share an event: each candidate keeps its own entity
 * record, and co-occurrence only ever produces a relationship, never a
 * merge.
 */
export function separateVenuesAndOrganizations(
  identifiedCandidates: IdentifiedCandidate[],
  events: LiveMusicEventObservation[],
  options: SeparateVenuesAndOrganizationsOptions = {}
): SeparateVenuesAndOrganizationsResult {
  const warnings: string[] = [];
  const venues: VenueEntity[] = [];
  const organizations: OrganizationEntity[] = [];

  for (const { id, candidate } of identifiedCandidates) {
    if (isVenueEntityType(candidate.entityType)) {
      venues.push(toVenueEntity(id, candidate));
    } else if (isOrganizationEntityType(candidate.entityType)) {
      organizations.push(toOrganizationEntity(id, candidate));
    } else {
      warnings.push(`Candidate "${candidate.name}" (${id}) has an unrecognized entity type and was skipped.`);
    }
  }

  const relationships: LiveMusicEntityRelationship[] = [];
  const eventCountByOrganizerVenuePair = new Map<string, number>();
  const venueIds = new Set(venues.map((venue) => venue.id));
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));

  for (const event of events) {
    const venueId = event.venueCandidateId;
    const organizerId = event.organizerCandidateId;

    if (venueId && venueIds.has(venueId)) {
      relationships.push({ relationshipType: "takes_place_at", eventId: event.id, venueId });
    }
    // Only an actual Organization entity can "organize" an event: a venue
    // credited as its own organizer (venueId === organizerId) never gets a
    // fabricated organizer relationship pointing back at itself.
    if (organizerId && organizationById.has(organizerId)) {
      relationships.push({ relationshipType: "organizes", organizationId: organizerId, eventId: event.id });
    }
    for (const artistName of event.performingArtistNames) {
      relationships.push({ relationshipType: "performs_at", artistName, eventId: event.id });
    }

    if (venueId && organizerId && venueId !== organizerId && venueIds.has(venueId) && organizationById.has(organizerId)) {
      const pairKey = `${organizerId}|${venueId}`;
      eventCountByOrganizerVenuePair.set(pairKey, (eventCountByOrganizerVenuePair.get(pairKey) ?? 0) + 1);
    }
  }

  const regularUseThreshold = options.regularUseEventThreshold ?? DEFAULT_REGULAR_USE_EVENT_THRESHOLD;

  for (const [pairKey, eventCount] of eventCountByOrganizerVenuePair) {
    const [organizationId, venueId] = pairKey.split("|");
    if (!venueIds.has(venueId) || !organizationById.has(organizationId)) {
      continue;
    }

    const organization = organizationById.get(organizationId)!;
    if (!organization.relatedVenueIds.includes(venueId)) {
      organization.relatedVenueIds.push(venueId);
    }

    if (hasOperatesEvidence(organization)) {
      relationships.push({ relationshipType: "operates", organizationId, venueId });
    } else if (eventCount >= regularUseThreshold) {
      relationships.push({ relationshipType: "regularly_uses", organizationId, venueId, eventCount });
    }
  }

  return { venues, organizations, relationships, warnings };
}

function hasOperatesEvidence(organization: OrganizationEntity): boolean {
  return organization.activityEvidence.some((evidence) => OPERATES_EVIDENCE_PATTERN.test(evidence.description));
}

function toVenueEntity(id: string, candidate: LiveMusicEntityCandidate): VenueEntity {
  return {
    id,
    name: candidate.name,
    entityType: candidate.entityType,
    city: candidate.city ?? null,
    country: candidate.country ?? null,
    latitude: candidate.latitude ?? null,
    longitude: candidate.longitude ?? null,
    address: candidate.address ?? null,
    websiteUrl: candidate.websiteUrl ?? null,
    programmeUrl: candidate.programmeUrl ?? null,
    sourceRecords: candidate.sourceRecords,
    activityEvidence: candidate.activityEvidence,
    verificationStatus: verificationStatusFor(candidate),
    confidence: confidenceFor(candidate),
    lastVerifiedAt: lastVerifiedAtFor(candidate)
  };
}

function toOrganizationEntity(id: string, candidate: LiveMusicEntityCandidate): OrganizationEntity {
  return {
    id,
    name: candidate.name,
    entityType: candidate.entityType,
    city: candidate.city ?? null,
    country: candidate.country ?? null,
    websiteUrl: candidate.websiteUrl ?? null,
    programmeUrl: candidate.programmeUrl ?? null,
    sourceRecords: candidate.sourceRecords,
    activityEvidence: candidate.activityEvidence,
    verificationStatus: verificationStatusFor(candidate),
    confidence: confidenceFor(candidate),
    lastVerifiedAt: lastVerifiedAtFor(candidate),
    relatedVenueIds: []
  };
}

function verificationStatusFor(candidate: LiveMusicEntityCandidate): VerificationStatus {
  return hasQualifyingActivityEvidence(candidate.activityEvidence) ? "verified" : "unverified";
}

function confidenceFor(candidate: LiveMusicEntityCandidate): number {
  const reliabilityScores = candidate.sourceRecords.map((record) => record.reliabilityScore);
  return reliabilityScores.length > 0 ? Math.max(...reliabilityScores) : 0;
}

function lastVerifiedAtFor(candidate: LiveMusicEntityCandidate): string | null {
  const timestamps = candidate.sourceRecords.map((record) => record.retrievedAt).sort();
  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
}
