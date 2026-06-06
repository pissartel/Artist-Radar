import { describe, expect, it } from "vitest";
import { findVenueEventCandidates } from "../src/modules/venueEventFinder.js";
import type { ArtistProfile } from "../src/schemas.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genres: ["pop punk"],
  socialLinks: {},
  platformStats: {},
  estimatedLevel: "emerging",
  confidence: 0.5,
  notes: ["Test profile."]
};

describe("findVenueEventCandidates", () => {
  it("returns no candidates outside mock mode", async () => {
    await expect(findVenueEventCandidates({ profile, env: { MOCK_AI: "false" } })).resolves.toEqual({
      venueCandidates: [],
      eventCandidates: []
    });
  });

  it("returns deterministic mock venues and events in MOCK_AI mode", async () => {
    const result = await findVenueEventCandidates({
      profile,
      genre: "pop punk",
      city: "Paris",
      target: "grandes villes françaises",
      env: { MOCK_AI: "true" }
    });

    expect(result.venueCandidates.length).toBeGreaterThan(0);
    expect(result.eventCandidates.length).toBeGreaterThan(0);
    expect(result.venueCandidates.some((venue) => venue.estimatedCapacityTier === "small")).toBe(true);
    expect(result.venueCandidates.some((venue) => venue.estimatedCapacityTier === "medium")).toBe(true);
    expect(result.eventCandidates[0]?.lineupStatus).toBe("support_not_announced");
  });
});
