import { describe, expect, it } from "vitest";
import { scoreBookerCompatibility } from "../src/bookers/scoreBookerCompatibility.js";
import type { BookerSearchInput } from "../src/bookers/types.js";
import type { SimilarArtist } from "../src/schemas.js";

const baseInput: BookerSearchInput = {
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

describe("scoreBookerCompatibility", () => {
  it("scores a genre-matched booking agency connected to a similar artist, open to submissions, local, active and working with emerging acts highly", () => {
    const similarArtist = baseSimilarArtist();
    const result = scoreBookerCompatibility(baseInput, {
      genres: ["pop punk"],
      text: "Independent pop punk booking agency based in Paris, works with emerging bands.",
      matchedSimilarArtists: [similarArtist],
      audienceLevel: "small",
      geographicScope: "local",
      acceptsSubmissions: true,
      isActive: true,
      hasVenueNetwork: true,
      worksWithEmergingActs: true
    });

    expect(result.score).toBeGreaterThan(80);
    expect(result.explanation).toContain(similarArtist.name);
    expect(result.explanation).toMatch(/submission/i);
    expect(result.explanation).toMatch(/emerging/i);
  });

  it("scores a genre-mismatched, unconnected, inactive-leaning booker low", () => {
    const result = scoreBookerCompatibility(baseInput, {
      genres: ["jazz"],
      text: "Jazz booking agency based overseas.",
      matchedSimilarArtists: [],
      audienceLevel: "large",
      geographicScope: "unknown",
      acceptsSubmissions: false,
      isActive: null,
      hasVenueNetwork: false,
      worksWithEmergingActs: false
    });

    expect(result.score).toBeLessThan(50);
  });

  it("prioritizes genre compatibility over audience size, per booking domain rules", () => {
    const strongGenreWeakAudience = scoreBookerCompatibility(baseInput, {
      genres: ["pop punk"],
      text: "pop punk booking agency",
      matchedSimilarArtists: [],
      audienceLevel: "large",
      geographicScope: "national",
      acceptsSubmissions: null,
      isActive: null,
      hasVenueNetwork: false,
      worksWithEmergingActs: false
    });
    const weakGenreStrongAudience = scoreBookerCompatibility(baseInput, {
      genres: [],
      text: "generic booking agency",
      matchedSimilarArtists: [],
      audienceLevel: "small",
      geographicScope: "national",
      acceptsSubmissions: null,
      isActive: null,
      hasVenueNetwork: false,
      worksWithEmergingActs: false
    });

    expect(strongGenreWeakAudience.score).toBeGreaterThan(weakGenreStrongAudience.score);
  });

  it("explains which similar artists support the recommendation", () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const result = scoreBookerCompatibility(baseInput, {
      genres: ["pop punk"],
      text: "Booking agency that represents Thru It All.",
      matchedSimilarArtists: [similarArtist],
      audienceLevel: "unknown",
      geographicScope: "unknown",
      acceptsSubmissions: null,
      isActive: null,
      hasVenueNetwork: false,
      worksWithEmergingActs: false
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
