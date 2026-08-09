import { describe, expect, it } from "vitest";
import { scoreManagerCompatibility } from "../src/managers/scoreManagerCompatibility.js";
import type { ManagerSearchInput } from "../src/managers/types.js";
import type { SimilarArtist } from "../src/schemas.js";

const input: ManagerSearchInput = {
  artist: "Tuesday Fall", city: "Paris", genre: "pop punk", limit: 10,
  artistProfile: { artistName: "Tuesday Fall", city: "Paris", country: "France", genres: ["pop punk"], spotifyArtistName: null, spotifyGenres: [], socialLinks: {}, platformStats: {}, estimatedLevel: "emerging", confidence: .8, notes: [] }
};

describe("scoreManagerCompatibility", () => {
  it("ranks a connected boutique emerging-artist manager above an inaccessible major company", () => {
    const similar = { name: "Thru It All", artistTier: "small" } as SimilarArtist;
    const compatible = scoreManagerCompatibility(input, { text: "boutique pop punk management for emerging artists", matchedSimilarArtists: [similar], audienceLevel: "small", rosterSize: 5, relationshipStatus: "current", acceptsSubmissions: true, isActive: true, worksWithEmergingArtists: true });
    const major = scoreManagerCompatibility(input, { text: "global major management superstar clients", matchedSimilarArtists: [], audienceLevel: "large", rosterSize: 60, relationshipStatus: "unknown", acceptsSubmissions: false, isActive: true, worksWithEmergingArtists: false });
    expect(compatible.score).toBeGreaterThan(major.score);
    expect(compatible.explanation).toContain("Thru It All");
  });

  it("penalizes former relationships compared with current ones", () => {
    const similar = { name: "Thru It All", artistTier: "small" } as SimilarArtist;
    const base = { text: "pop punk management", matchedSimilarArtists: [similar], audienceLevel: "small" as const, rosterSize: 5, acceptsSubmissions: null, isActive: true, worksWithEmergingArtists: true };
    expect(scoreManagerCompatibility(input, { ...base, relationshipStatus: "current" }).score)
      .toBeGreaterThan(scoreManagerCompatibility(input, { ...base, relationshipStatus: "former" }).score);
  });
});
