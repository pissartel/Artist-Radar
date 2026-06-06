import { describe, expect, it } from "vitest";
import {
  findSimilarArtists,
  groupSimilarArtistsByTier
} from "../src/modules/similarArtistsFinder.js";
import type { ArtistProfile, SimilarArtist } from "../src/schemas.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genres: ["pop punk", "hardcore"],
  spotifyArtistName: "Tuesday Fall",
  spotifyGenres: ["pop punk"],
  socialLinks: {
    spotifyUrl: "https://open.spotify.com/artist/example",
    youtubeUrl: null,
    instagramUrl: null
  },
  platformStats: {
    spotifyFollowers: 1200,
    spotifyPopularity: 18
  },
  estimatedLevel: "emerging",
  confidence: 0.75,
  notes: ["Test profile."]
};

describe("findSimilarArtists", () => {
  it("returns deterministic mock similar artists across small, medium and large tiers", () => {
    const artists = findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "true" }
    });

    expect(artists).toHaveLength(3);
    expect(artists.map((artist) => artist.artistTier)).toEqual(["small", "medium", "large"]);
    expect(artists[0]).toMatchObject({
      name: "Mock Paris Pop Punk Peer",
      url: null,
      source: "mock",
      city: "Paris",
      country: "France",
      artistTier: "small",
      possibleUse: "co_bill",
      estimatedFollowers: 900,
      estimatedPopularity: 14
    });
  });

  it("uses profile genres, city and target in mock relevance", () => {
    const artists = findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "true" }
    });

    expect(artists.some((artist) => artist.reason.includes("City: Paris"))).toBe(true);
    expect(artists.every((artist) => artist.relevanceToUserArtist.includes("grandes villes françaises"))).toBe(true);
    expect(artists.flatMap((artist) => artist.genres)).toContain("pop punk");
  });

  it("groups similar artists by tier", () => {
    const artists = findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "true" }
    });

    const grouped = groupSimilarArtistsByTier(artists);

    expect(grouped.small).toHaveLength(1);
    expect(grouped.medium).toHaveLength(1);
    expect(grouped.large).toHaveLength(1);
    expect(grouped.unknown).toEqual([]);
  });

  it("does not invent artists when mock mode is disabled and no user-provided artists exist", () => {
    expect(findSimilarArtists({ profile, env: { MOCK_AI: "false" } })).toEqual([]);
  });

  it("normalizes future user-provided similar artists without inventing URLs", () => {
    const artists = findSimilarArtists({
      profile,
      target: "Paris",
      genre: "pop punk",
      city: "Paris",
      userProvidedSimilarArtists: ["  User Band  ", ""],
      env: { MOCK_AI: "false" }
    });

    expect(artists).toEqual([
      {
        name: "User Band",
        url: null,
        genres: ["pop punk", "hardcore"],
        city: "Paris",
        country: "France",
        source: "user",
        reason: "User-provided similar artist for comparison in Paris.",
        confidence: 0.9,
        artistTier: "unknown",
        estimatedFollowers: null,
        estimatedPopularity: null,
        relevanceToUserArtist: "User-provided reference; no audience metrics are available yet.",
        possibleUse: "unknown",
        estimatedLevel: null
      }
    ]);
  });

  it("groups explicit unknown-tier artists", () => {
    const artist: SimilarArtist = {
      name: "Unknown Band",
      url: null,
      genres: ["pop punk"],
      city: null,
      country: null,
      source: "user",
      reason: "No metrics available.",
      confidence: 0.5,
      artistTier: "unknown",
      estimatedFollowers: null,
      estimatedPopularity: null,
      relevanceToUserArtist: "No metrics available.",
      possibleUse: "unknown",
      estimatedLevel: null
    };

    expect(groupSimilarArtistsByTier([artist]).unknown).toEqual([artist]);
  });
});
