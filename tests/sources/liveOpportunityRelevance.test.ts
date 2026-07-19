import { describe, expect, it } from "vitest";
import {
  computeLiveOpportunityRelevance,
  scoreLiveOpportunities,
  sortScoredLiveOpportunities,
  type LiveOpportunityRelevanceContext
} from "../../src/sources/liveOpportunityRelevance.js";
import type { UnifiedOpportunity } from "../../src/schemas.js";

const NOW = new Date("2026-07-20T12:00:00Z");

function concert(overrides: Partial<UnifiedOpportunity> = {}): UnifiedOpportunity {
  return {
    id: "concert-1",
    type: "CONCERT",
    name: "Fake Band at The Venue",
    city: "Lyon",
    country: "France",
    sourceUrl: "https://example.com/event",
    eventDate: "2026-09-12",
    venueName: "The Venue",
    headliners: ["Fake Band"],
    genres: ["pop punk"],
    artistSizes: [],
    ...overrides
  };
}

function context(overrides: Partial<LiveOpportunityRelevanceContext> = {}): LiveOpportunityRelevanceContext {
  return {
    artistGenres: ["pop punk"],
    artistCity: "Lyon",
    artistCountry: "France",
    artistLevel: "emerging",
    ...overrides
  };
}

describe("computeLiveOpportunityRelevance", () => {
  it("throws for opportunity types outside CONCERT/FESTIVAL", () => {
    expect(() =>
      computeLiveOpportunityRelevance({ ...concert(), type: "VENUE" } as UnifiedOpportunity, context(), NOW)
    ).toThrow();
  });

  it("rejects a past event before scoring", () => {
    const result = computeLiveOpportunityRelevance(concert({ eventDate: "2026-01-01" }), context(), NOW);
    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons).toContain("past_event");
    expect(result.score).toBeNull();
  });

  it("rejects an opportunity missing essential fields (date, location)", () => {
    const result = computeLiveOpportunityRelevance(concert({ eventDate: null }), context(), NOW);
    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons).toContain("missing_date");
    expect(result.score).toBeNull();
  });

  it("rejects an opportunity with no accessible source evidence", () => {
    const result = computeLiveOpportunityRelevance(concert({ sourceUrl: null }), context(), NOW);
    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons).toContain("missing_source_evidence");
    expect(result.score).toBeNull();
  });

  it("rejects a strong genre mismatch regardless of how complete the record is", () => {
    const veryComplete = concert({
      genres: ["techno"],
      description: "A fully detailed techno night.",
      doorsTime: "20:00",
      ticketUrl: "https://example.com/tickets",
      lineup: ["Fake Band", "DJ Someone"],
      venueCapacity: 500,
      contactEmail: "booking@venue.example.com"
    });

    const result = computeLiveOpportunityRelevance(veryComplete, context({ artistGenres: ["pop punk"] }), NOW);
    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons).toContain("strong_genre_mismatch");
    expect(result.score).toBeNull();
  });

  it("rejects an event located outside the configured territory", () => {
    const result = computeLiveOpportunityRelevance(
      concert({ country: "Germany" }),
      context({ configuredTerritories: ["France", "Belgium"] }),
      NOW
    );
    expect(result.rejected).toBe(true);
    expect(result.rejectionReasons).toContain("outside_configured_territory");
    expect(result.score).toBeNull();
  });

  it("does not reject when no territory is configured", () => {
    const result = computeLiveOpportunityRelevance(concert({ country: "Germany" }), context(), NOW);
    expect(result.rejected).toBe(false);
  });

  it("scores a genre-compatible, well-evidenced opportunity and exposes its main reasons", () => {
    const result = computeLiveOpportunityRelevance(
      concert({ contactEmail: "booking@venue.example.com", venueCapacity: 200 }),
      context(),
      NOW
    );

    expect(result.rejected).toBe(false);
    expect(result.score).not.toBeNull();
    expect(result.score).toBeGreaterThan(50);
    expect(result.components?.genreCompatibilityScore).toBe(95);
    expect(result.reasons.length).toBeGreaterThan(1);
    expect(result.reasons[0]).toContain("relevance score");
  });

  it("scores an event with no actionable path below an otherwise identical event with a booking contact", () => {
    const withoutContact = computeLiveOpportunityRelevance(concert({ id: "no-contact" }), context(), NOW);
    const withContact = computeLiveOpportunityRelevance(
      concert({ id: "with-contact", contactEmail: "booking@venue.example.com" }),
      context(),
      NOW
    );

    expect(withoutContact.rejected).toBe(false);
    expect(withContact.rejected).toBe(false);
    expect(withContact.score! > withoutContact.score!).toBe(true);
  });

  it("scores an event with an application route above one with no actionable path", () => {
    const withoutRoute = computeLiveOpportunityRelevance(concert({ id: "no-route" }), context(), NOW);
    const withDeadline = computeLiveOpportunityRelevance(
      concert({ id: "with-deadline", applicationDeadline: "2026-08-10" }),
      context(),
      NOW
    );

    expect(withDeadline.score! > withoutRoute.score!).toBe(true);
  });

  it("scores venue capacity fit for the artist's level when known", () => {
    const tooLarge = computeLiveOpportunityRelevance(
      concert({ id: "too-large", venueCapacity: 5000 }),
      context({ artistLevel: "emerging" }),
      NOW
    );
    const goodFit = computeLiveOpportunityRelevance(
      concert({ id: "good-fit", venueCapacity: 200 }),
      context({ artistLevel: "emerging" }),
      NOW
    );

    expect(goodFit.components!.venueCapacityScore).toBeGreaterThan(tooLarge.components!.venueCapacityScore);
  });

  it("uses similar-artist lineup evidence as a positive signal", () => {
    const withEvidence = computeLiveOpportunityRelevance(
      concert({ id: "similar", lineup: ["Fake Band", "Some Similar Act"] }),
      context({ similarArtistNames: ["Some Similar Act"] }),
      NOW
    );
    const withoutEvidence = computeLiveOpportunityRelevance(concert({ id: "no-similar" }), context(), NOW);

    expect(withEvidence.components!.similarArtistEvidenceScore).toBeGreaterThan(
      withoutEvidence.components!.similarArtistEvidenceScore
    );
  });
});

describe("scoreLiveOpportunities", () => {
  it("only scores CONCERT/FESTIVAL entries, leaving other opportunity types out", () => {
    const venue: UnifiedOpportunity = { id: "venue-1", type: "VENUE", name: "The Venue", genres: [], artistSizes: [] };
    const scored = scoreLiveOpportunities([concert(), venue], context(), NOW);
    expect(scored).toHaveLength(1);
    expect(scored[0]?.opportunity.id).toBe("concert-1");
  });
});

describe("sortScoredLiveOpportunities", () => {
  it("sorts by relevance, highest score first", () => {
    const scored = scoreLiveOpportunities(
      [
        concert({ id: "low", genres: ["pop rock"] }),
        concert({ id: "high", genres: ["pop punk"], contactEmail: "booking@venue.example.com" })
      ],
      context(),
      NOW
    );

    const sorted = sortScoredLiveOpportunities(scored, "relevance");
    expect(sorted.map((entry) => entry.opportunity.id)).toEqual(["high", "low"]);
  });

  it("sorts by date, soonest first", () => {
    const scored = scoreLiveOpportunities(
      [
        concert({ id: "later", eventDate: "2026-12-01" }),
        concert({ id: "sooner", eventDate: "2026-08-01" })
      ],
      context(),
      NOW
    );

    const sorted = sortScoredLiveOpportunities(scored, "date");
    expect(sorted.map((entry) => entry.opportunity.id)).toEqual(["sooner", "later"]);
  });

  it("sorts by distance, closest first", () => {
    const scored = scoreLiveOpportunities(
      [
        concert({ id: "far", latitude: 48.8566, longitude: 2.3522 }),
        concert({ id: "near", latitude: 45.75, longitude: 4.85 })
      ],
      context({ artistLatitude: 45.75, artistLongitude: 4.85 }),
      NOW
    );

    const sorted = sortScoredLiveOpportunities(scored, "distance");
    expect(sorted.map((entry) => entry.opportunity.id)).toEqual(["near", "far"]);
  });
});
