import { describe, expect, it } from "vitest";
import { scoreLabelCompatibility } from "../src/labels/scoreLabelCompatibility.js";
import type { LabelSearchInput } from "../src/labels/types.js";
import type { SimilarArtist } from "../src/schemas.js";

const baseInput: LabelSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  limit: 10,
  artistProfile: {
    artistName: "Tuesday Fall",
    city: "Paris",
    country: "France",
    genres: ["pop punk"],
    spotifyArtistName: null,
    spotifyGenres: [],
    socialLinks: {},
    platformStats: {},
    estimatedLevel: "emerging",
    confidence: 0.7,
    notes: []
  }
};

describe("scoreLabelCompatibility", () => {
  it("scores a genre-matched label connected to a similar artist, accepting demos, local and active highly", () => {
    const similarArtist = baseSimilarArtist();
    const result = scoreLabelCompatibility(baseInput, {
      genres: ["pop punk"],
      text: "Independent pop punk label based in Paris, roster of emerging bands.",
      matchedSimilarArtists: [similarArtist],
      audienceLevel: "small",
      geographicScope: "local",
      acceptsDemos: true,
      isActive: true,
      distributor: "Believe"
    });

    expect(result.score).toBeGreaterThan(80);
    expect(result.explanation).toContain(similarArtist.name);
    expect(result.explanation).toMatch(/demo/i);
  });

  it("scores a genre-mismatched, unconnected, inactive-leaning label low", () => {
    const result = scoreLabelCompatibility(baseInput, {
      genres: ["jazz"],
      text: "Jazz label based overseas.",
      matchedSimilarArtists: [],
      audienceLevel: "large",
      geographicScope: "unknown",
      acceptsDemos: false,
      isActive: null,
      distributor: null
    });

    expect(result.score).toBeLessThan(50);
  });

  it("prioritizes genre compatibility over audience size, per booking domain rules", () => {
    const strongGenreWeakAudience = scoreLabelCompatibility(baseInput, {
      genres: ["pop punk"],
      text: "pop punk label",
      matchedSimilarArtists: [],
      audienceLevel: "large",
      geographicScope: "national",
      acceptsDemos: null,
      isActive: null,
      distributor: null
    });
    const weakGenreStrongAudience = scoreLabelCompatibility(baseInput, {
      genres: [],
      text: "generic label",
      matchedSimilarArtists: [],
      audienceLevel: "small",
      geographicScope: "national",
      acceptsDemos: null,
      isActive: null,
      distributor: null
    });

    expect(strongGenreWeakAudience.score).toBeGreaterThan(weakGenreStrongAudience.score);
  });

  it("explains which similar artists or releases support the recommendation", () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const result = scoreLabelCompatibility(baseInput, {
      genres: ["pop punk"],
      text: "Label that released Thru It All's debut EP.",
      matchedSimilarArtists: [similarArtist],
      audienceLevel: "unknown",
      geographicScope: "unknown",
      acceptsDemos: null,
      isActive: null,
      distributor: null
    });

    expect(result.explanation).toContain("Thru It All");
  });
});

function baseSimilarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Comparable Punk Band",
    url: "https://example.test/comparable-punk-band",
    spotifyId: null,
    genres: ["pop punk", "punk rock"],
    city: "Paris",
    country: "France",
    source: "mock",
    sources: ["mock"],
    reason: "Comparable pop punk artist.",
    confidence: 0.9,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: 1500,
    estimatedPopularity: 18,
    sizeSignalSource: "manual",
    genreRelevance: 95,
    localRelevance: 80,
    sizeRelevance: 85,
    sceneRelevance: 80,
    totalRelevance: 90,
    relevanceToUserArtist: 90,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: ["Strong genre compatibility."],
    sourceUrls: ["https://example.test/comparable-punk-band"],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: "small",
      confidence: 0.8,
      sizeSignalSource: "manual",
      platforms: {}
    },
    discardedTags: [],
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null,
    ...overrides
  };
}
