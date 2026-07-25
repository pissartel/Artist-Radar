import { describe, expect, it } from "vitest";
import { separateVenuesAndOrganizations } from "../../../src/sources/liveMusicEntities/venueOrganizationSeparation.js";
import type { LiveMusicEntityCandidate, LiveMusicEventObservation } from "../../../src/sources/liveMusicEntities/types.js";

function candidate(overrides: Partial<LiveMusicEntityCandidate>): LiveMusicEntityCandidate {
  return {
    externalIds: { id: "1" },
    name: "Entity",
    entityType: "concert_venue",
    sourceRecords: [
      {
        sourceType: "web_discovery",
        sourceName: "Web discovery",
        sourceUrl: "https://example.com",
        retrievedAt: "2026-07-01T00:00:00.000Z",
        reliabilityScore: 0.6
      }
    ],
    activityEvidence: [
      {
        kind: "recent_event",
        description: "Hosted a show last month.",
        sourceUrl: "https://example.com/events/1",
        observedAt: "2026-06-01",
        collectedAt: "2026-07-01T00:00:00.000Z",
        confidence: 0.7
      }
    ],
    ...overrides
  };
}

function event(overrides: Partial<LiveMusicEventObservation>): LiveMusicEventObservation {
  return {
    id: "event-1",
    name: "Show",
    date: "2026-06-01",
    venueCandidateId: null,
    organizerCandidateId: null,
    performingArtistNames: [],
    sourceUrl: "https://example.com/events/1",
    ...overrides
  };
}

describe("separateVenuesAndOrganizations", () => {
  it("classifies venue-like and organization-like candidates into separate entity lists", () => {
    const venue = candidate({ name: "Le Krakatoa", entityType: "concert_venue" });
    const promoter = candidate({ externalIds: { id: "2" }, name: "Concerts Bordeaux Prod", entityType: "promoter" });

    const result = separateVenuesAndOrganizations(
      [
        { id: "venue-1", candidate: venue },
        { id: "org-1", candidate: promoter }
      ],
      []
    );

    expect(result.venues).toHaveLength(1);
    expect(result.venues[0].id).toBe("venue-1");
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0].id).toBe("org-1");
  });

  it("does not merge a promoter into a venue just because they share an event", () => {
    const venue = candidate({ name: "Le Krakatoa", entityType: "concert_venue" });
    const promoter = candidate({ externalIds: { id: "2" }, name: "Concerts Bordeaux Prod", entityType: "promoter" });

    const result = separateVenuesAndOrganizations(
      [
        { id: "venue-1", candidate: venue },
        { id: "org-1", candidate: promoter }
      ],
      [event({ id: "event-1", venueCandidateId: "venue-1", organizerCandidateId: "org-1" })]
    );

    // Two distinct entities remain, plus the relationships that link them
    // through the event, instead of collapsing into one.
    expect(result.venues.map((entity) => entity.id)).toEqual(["venue-1"]);
    expect(result.organizations.map((entity) => entity.id)).toEqual(["org-1"]);
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        { relationshipType: "organizes", organizationId: "org-1", eventId: "event-1" },
        { relationshipType: "takes_place_at", eventId: "event-1", venueId: "venue-1" }
      ])
    );
  });

  it("links a promoter to several venues it uses across different events (regularly_uses)", () => {
    const venueA = candidate({ name: "Le Krakatoa", entityType: "concert_venue" });
    const venueB = candidate({ externalIds: { id: "3" }, name: "Rock School Barbey", entityType: "concert_venue" });
    const promoter = candidate({ externalIds: { id: "2" }, name: "Concerts Bordeaux Prod", entityType: "promoter" });

    const result = separateVenuesAndOrganizations(
      [
        { id: "venue-a", candidate: venueA },
        { id: "venue-b", candidate: venueB },
        { id: "org-1", candidate: promoter }
      ],
      [
        event({ id: "event-1", venueCandidateId: "venue-a", organizerCandidateId: "org-1" }),
        event({ id: "event-2", venueCandidateId: "venue-a", organizerCandidateId: "org-1" }),
        event({ id: "event-3", venueCandidateId: "venue-b", organizerCandidateId: "org-1" })
      ]
    );

    const organization = result.organizations.find((entity) => entity.id === "org-1")!;
    expect(organization.relatedVenueIds.sort()).toEqual(["venue-a", "venue-b"]);
    expect(result.relationships).toEqual(
      expect.arrayContaining([
        { relationshipType: "regularly_uses", organizationId: "org-1", venueId: "venue-a", eventCount: 2 }
      ])
    );
    expect(result.relationships.some((relationship) => relationship.relationshipType === "operates")).toBe(false);
  });

  it("marks 'operates' only when the organization's evidence explicitly says it runs the venue", () => {
    const venue = candidate({ name: "Le Krakatoa", entityType: "concert_venue" });
    const owner = candidate({
      externalIds: { id: "2" },
      name: "Association Krakatoa",
      entityType: "association",
      activityEvidence: [
        {
          kind: "organizes_concerts_confirmation",
          description: "The venue is operated by Association Krakatoa.",
          sourceUrl: "https://krakatoa.org/about",
          observedAt: null,
          collectedAt: "2026-07-01T00:00:00.000Z",
          confidence: 0.8
        }
      ]
    });

    const result = separateVenuesAndOrganizations(
      [
        { id: "venue-1", candidate: venue },
        { id: "org-1", candidate: owner }
      ],
      [event({ id: "event-1", venueCandidateId: "venue-1", organizerCandidateId: "org-1" })]
    );

    expect(result.relationships).toEqual(
      expect.arrayContaining([{ relationshipType: "operates", organizationId: "org-1", venueId: "venue-1" }])
    );
  });

  it("does not fabricate an organizer relationship when the venue is its own organizer", () => {
    const venue = candidate({ name: "Le Krakatoa", entityType: "concert_venue" });

    const result = separateVenuesAndOrganizations(
      [{ id: "venue-1", candidate: venue }],
      [event({ id: "event-1", venueCandidateId: "venue-1", organizerCandidateId: "venue-1" })]
    );

    expect(result.organizations).toHaveLength(0);
    expect(result.relationships.some((relationship) => relationship.relationshipType === "organizes")).toBe(false);
  });

  it("records performs_at relationships for artists in an event lineup", () => {
    const venue = candidate({ name: "Le Krakatoa", entityType: "concert_venue" });
    const result = separateVenuesAndOrganizations(
      [{ id: "venue-1", candidate: venue }],
      [event({ id: "event-1", venueCandidateId: "venue-1", performingArtistNames: ["Tuesday Fall"] })]
    );

    expect(result.relationships).toEqual(
      expect.arrayContaining([{ relationshipType: "performs_at", artistName: "Tuesday Fall", eventId: "event-1" }])
    );
  });
});
