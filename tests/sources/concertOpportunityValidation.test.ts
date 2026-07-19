import { describe, expect, it } from "vitest";
import {
  classifyConcertOpportunityQuality,
  filterConcertOpportunitiesForStandardResults,
  mergeDuplicateConcertOpportunities,
  validateConcertOpportunities
} from "../../src/sources/concertOpportunityValidation.js";
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
    genres: [],
    artistSizes: [],
    ...overrides
  };
}

describe("classifyConcertOpportunityQuality", () => {
  it("marks a fully-evidenced future concert as COMPLETE", () => {
    const result = classifyConcertOpportunityQuality(concert(), NOW);
    expect(result.status).toBe("COMPLETE");
    expect(result.issues).toEqual([]);
  });

  it("rejects a past event as INVALID", () => {
    const result = classifyConcertOpportunityQuality(concert({ eventDate: "2026-01-01" }), NOW);
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain("past_event");
  });

  it("rejects an event without a date as INVALID", () => {
    const result = classifyConcertOpportunityQuality(concert({ eventDate: null }), NOW);
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain("missing_date");
  });

  it("rejects an event without a venue or city as INVALID", () => {
    const result = classifyConcertOpportunityQuality(concert({ venueName: null, city: null }), NOW);
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain("missing_location");
  });

  it("rejects a page whose extraction is not backed by a source URL", () => {
    const result = classifyConcertOpportunityQuality(concert({ sourceUrl: null }), NOW);
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain("missing_source_evidence");
  });

  it("rejects a generic editorial/listing page mistaken for a single event", () => {
    const result = classifyConcertOpportunityQuality(concert({ name: "Toute l'actualite concerts" }), NOW);
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain("generic_editorial_page");
  });

  it("downgrades a concert missing its headliner to PARTIAL when no exception applies", () => {
    const result = classifyConcertOpportunityQuality(concert({ headliners: [] }), NOW);
    expect(result.status).toBe("PARTIAL");
    expect(result.issues).toContain("missing_headliner");
  });

  it("downgrades a concert missing only the venue name to PARTIAL", () => {
    const result = classifyConcertOpportunityQuality(concert({ venueName: null }), NOW);
    expect(result.status).toBe("PARTIAL");
    expect(result.issues).toContain("missing_venue_name");
  });

  it("allows a festival with an incomplete lineup to stay PARTIAL instead of INVALID", () => {
    const result = classifyConcertOpportunityQuality(
      concert({ type: "FESTIVAL", name: "Fake Fest", headliners: [] }),
      NOW
    );
    expect(result.status).toBe("PARTIAL");
    expect(result.issues).toContain("incomplete_lineup");
  });

  it("allows an open call without a headliner to stay PARTIAL when it has a deadline", () => {
    const result = classifyConcertOpportunityQuality(
      concert({ headliners: [], applicationDeadline: "2026-08-01" }),
      NOW
    );
    expect(result.status).toBe("PARTIAL");
    expect(result.issues).toContain("open_call_pending_lineup");
  });

  it("throws for opportunity types outside CONCERT/FESTIVAL", () => {
    expect(() =>
      classifyConcertOpportunityQuality({ ...concert(), type: "VENUE" } as UnifiedOpportunity, NOW)
    ).toThrow();
  });
});

describe("validateConcertOpportunities", () => {
  it("attaches qualityStatus and qualityIssues to CONCERT/FESTIVAL entries only", () => {
    const venue: UnifiedOpportunity = { id: "venue-1", type: "VENUE", name: "The Venue", genres: [], artistSizes: [] };
    const result = validateConcertOpportunities([concert(), venue], NOW);

    expect(result[0]?.qualityStatus).toBe("COMPLETE");
    expect(result[1]?.qualityStatus).toBeUndefined();
  });
});

describe("filterConcertOpportunitiesForStandardResults", () => {
  it("excludes INVALID concerts (including past events) but keeps PARTIAL ones", () => {
    const validated = validateConcertOpportunities(
      [
        concert({ id: "future", eventDate: "2026-09-12" }),
        concert({ id: "past", eventDate: "2026-01-01" }),
        concert({ id: "partial", venueName: null })
      ],
      NOW
    );

    const standard = filterConcertOpportunitiesForStandardResults(validated);
    expect(standard.map((opportunity) => opportunity.id)).toEqual(["future", "partial"]);
    expect(standard.find((opportunity) => opportunity.id === "partial")?.qualityStatus).toBe("PARTIAL");
  });
});

describe("mergeDuplicateConcertOpportunities", () => {
  it("merges duplicate listings of the same event from different sources", () => {
    const a = concert({
      id: "a",
      confidenceScore: 0.9,
      sourceUrl: "https://venue.example.com/event",
      venueName: "The Venue"
    });
    const b = concert({
      id: "b",
      confidenceScore: 0.6,
      sourceUrl: "https://agenda.example.com/event",
      venueName: "The Venue",
      headliners: []
    });

    const { merged, duplicatesMerged } = mergeDuplicateConcertOpportunities([a, b]);

    expect(duplicatesMerged).toBe(1);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("a");
    expect(merged[0]?.sourceUrl).toBe("https://venue.example.com/event");
    expect(merged[0]?.mergedSourceUrls).toEqual(["https://agenda.example.com/event"]);
  });

  it("fills gaps in the highest-confidence record from lower-confidence duplicates", () => {
    const a = concert({ id: "a", confidenceScore: 0.9, headliners: [], venueName: "The Venue" });
    const b = concert({ id: "b", confidenceScore: 0.5, headliners: ["Fake Band"], venueName: "The Venue" });

    const { merged } = mergeDuplicateConcertOpportunities([a, b]);
    expect(merged[0]?.headliners).toEqual(["Fake Band"]);
  });

  it("leaves distinct events untouched", () => {
    const a = concert({ id: "a", name: "Fake Band at The Venue", eventDate: "2026-09-12" });
    const b = concert({ id: "b", name: "Other Band at Other Venue", eventDate: "2026-10-01", venueName: "Other Venue" });

    const { merged, duplicatesMerged } = mergeDuplicateConcertOpportunities([a, b]);
    expect(duplicatesMerged).toBe(0);
    expect(merged).toHaveLength(2);
  });

  it("leaves non-event opportunities untouched", () => {
    const venue: UnifiedOpportunity = { id: "venue-1", type: "VENUE", name: "The Venue", genres: [], artistSizes: [] };
    const { merged, duplicatesMerged } = mergeDuplicateConcertOpportunities([venue]);
    expect(duplicatesMerged).toBe(0);
    expect(merged).toEqual([venue]);
  });
});
