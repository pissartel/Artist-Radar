import { describe, expect, it } from "vitest";
import { getOpportunitiesForVenue, getVenueById } from "@/lib/venue";
import type { Opportunity } from "@/types";

function buildOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    type: "concert",
    category: "concert",
    title: "Neon Riot at Le Point Ephemere",
    location: "Paris, France",
    description: "Reach out via the booking form.",
    tags: [],
    matchScore: 82,
    matchReasons: ["Genre match"],
    genres: [],
    recentEvents: [],
    lineup: [],
    ...overrides,
  };
}

describe("getOpportunitiesForVenue", () => {
  it("returns only opportunities resolved to the given venueId", () => {
    const opportunities = [
      buildOpportunity({ id: "a", venueId: "le-point-ephemere-paris-france" }),
      buildOpportunity({ id: "b", venueId: "another-venue-paris-france" }),
      buildOpportunity({ id: "c", venueId: "le-point-ephemere-paris-france" }),
    ];

    const result = getOpportunitiesForVenue(opportunities, "le-point-ephemere-paris-france");
    expect(result.map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list when no opportunity resolves to that venueId", () => {
    expect(getOpportunitiesForVenue([buildOpportunity()], "unknown-venue")).toEqual([]);
  });
});

describe("getVenueById", () => {
  it("returns null when no opportunity resolves to the venueId", () => {
    expect(getVenueById([buildOpportunity()], "unknown-venue")).toBeNull();
  });

  it("builds a canonical VenueInfo from the matching opportunity's fields", () => {
    const opportunities = [
      buildOpportunity({
        venueId: "le-point-ephemere-paris-france",
        venue: "Le Point Ephemere",
        venueType: "venue",
        address: "200 Quai de Valmy",
        city: "Paris",
        country: "France",
        venueCapacity: 450,
        venueConfidence: 80,
        venueImageUrl: "https://example.test/logo.png",
        contact: "booking@lepointephemere.test",
      }),
    ];

    const venue = getVenueById(opportunities, "le-point-ephemere-paris-france");

    expect(venue).toEqual({
      id: "le-point-ephemere-paris-france",
      name: "Le Point Ephemere",
      imageUrl: "https://example.test/logo.png",
      venueTypeLabel: null,
      address: "200 Quai de Valmy",
      city: "Paris",
      country: "France",
      capacity: 450,
      confidence: 80,
      website: undefined,
      contact: "booking@lepointephemere.test",
    });
  });

  it("merges fields across multiple opportunities at the same venue, never overwriting a known field with a missing one", () => {
    const opportunities = [
      buildOpportunity({
        id: "a",
        venueId: "le-point-ephemere-paris-france",
        venue: "Le Point Ephemere",
        venueCapacity: null,
        address: undefined,
      }),
      buildOpportunity({
        id: "b",
        venueId: "le-point-ephemere-paris-france",
        venue: "Le Point Ephemere",
        venueCapacity: 450,
        address: "200 Quai de Valmy",
      }),
    ];

    const venue = getVenueById(opportunities, "le-point-ephemere-paris-france");

    expect(venue?.capacity).toBe(450);
    expect(venue?.address).toBe("200 Quai de Valmy");
  });
});
