import { describe, expect, it } from "vitest";
import { selectTopCompatibleSimilarArtists } from "../src/booking/similarArtistSelection.js";
import type { SimilarArtist } from "../src/schemas.js";

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
      platforms: {
        spotify: { followers: 1500, popularity: 18, sourceUrl: "https://example.test/comparable-punk-band" }
      }
    },
    discardedTags: [],
    ...overrides
  } as SimilarArtist;
}

describe("selectTopCompatibleSimilarArtists", () => {
  it("selects the top N by totalRelevance, highest first", () => {
    const artists = [
      baseSimilarArtist({ name: "Low", totalRelevance: 40 }),
      baseSimilarArtist({ name: "High", totalRelevance: 95 }),
      baseSimilarArtist({ name: "Mid", totalRelevance: 70 })
    ];

    const selected = selectTopCompatibleSimilarArtists(artists, 2);

    expect(selected.map((a) => a.name)).toEqual(["High", "Mid"]);
  });

  it("removes duplicate artist names (case-insensitive)", () => {
    const artists = [
      baseSimilarArtist({ name: "The Slugz", totalRelevance: 80 }),
      baseSimilarArtist({ name: "the slugz", totalRelevance: 60 }),
      baseSimilarArtist({ name: "Other Band", totalRelevance: 50 })
    ];

    const selected = selectTopCompatibleSimilarArtists(artists, 5);

    expect(selected).toHaveLength(2);
    expect(selected.map((a) => a.name)).toEqual(["The Slugz", "Other Band"]);
  });

  it("discards artists with empty names", () => {
    const artists = [baseSimilarArtist({ name: "", totalRelevance: 99 }), baseSimilarArtist({ name: "Valid", totalRelevance: 10 })];

    const selected = selectTopCompatibleSimilarArtists(artists, 5);

    expect(selected.map((a) => a.name)).toEqual(["Valid"]);
  });

  it("never selects more than the configured limit", () => {
    const artists = Array.from({ length: 10 }, (_, i) => baseSimilarArtist({ name: `Artist ${i}`, totalRelevance: i }));

    const selected = selectTopCompatibleSimilarArtists(artists, 3);

    expect(selected).toHaveLength(3);
  });
});
