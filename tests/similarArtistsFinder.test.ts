import { describe, expect, it } from "vitest";
import {
  determineAbsoluteArtistTier,
  findSimilarArtists,
  groupSimilarArtistsByTier,
  mapSpotifyArtistToSimilarArtist,
  scoreGenreRelevance,
  scoreSizeRelevance
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
  it("returns deterministic mock similar artists across small, medium and large tiers", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "true" }
    });

    expect(artists).toHaveLength(9);
    expect(artists.filter((artist) => artist.artistTier === "small")).toHaveLength(3);
    expect(artists.filter((artist) => artist.artistTier === "medium")).toHaveLength(3);
    expect(artists.filter((artist) => artist.artistTier === "large")).toHaveLength(3);
    expect(artists[0]).toMatchObject({
      name: "Paris Pop Punk Collective",
      url: null,
      spotifyId: null,
      source: "mock",
      city: "Paris",
      country: "France",
      artistTier: "small",
      possibleUse: "co_bill"
    });
  });

  it("uses Spotify related artists before search", async () => {
    let searchCalls = 0;
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [
        spotifyArtist("related-small", "Related Pop Punk Band", 1000, 19, ["pop punk"])
      ],
      spotifySearch: async () => {
        searchCalls += 1;
        return [spotifyArtist("search", "Search Band", 1000, 19, ["pop punk"])];
      }
    });

    expect(searchCalls).toBe(0);
    expect(artists).toHaveLength(1);
    expect(artists[0]?.source).toBe("spotify_related");
  });

  it("falls back to Spotify search when related artists are unavailable", async () => {
    const queries: string[] = [];
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async (query) => {
        queries.push(query);
        return [
          spotifyArtist("search-small", "Search Pop Punk Band", 1000, 18, ["pop punk"]),
          spotifyArtist("search-large", "Search Big Punk Band", 200000, 60, ["punk rock"])
        ];
      }
    });

    expect(queries).toContain("pop punk france");
    expect(queries).toContain("pop punk paris");
    expect(artists).not.toHaveLength(0);
    expect(artists.map((artist) => artist.source)).toEqual(["spotify_search", "spotify_search"]);
  });

  it("scores genre relevance across different genres", () => {
    expect(scoreGenreRelevance(["pop punk"], ["pop punk"])).toBeGreaterThanOrEqual(85);
    expect(scoreGenreRelevance(["pop punk"], ["rock"])).toBeLessThan(scoreGenreRelevance(["pop punk"], ["pop punk"]));
    expect(scoreGenreRelevance(["rap"], ["hip hop"])).toBeGreaterThanOrEqual(85);
    expect(scoreGenreRelevance(["techno"], ["acoustic folk"])).toBeLessThan(25);
  });

  it("classifies much bigger mainstream artists as large/reference", () => {
    const size = scoreSizeRelevance({ followers: 1200, popularity: 18 }, { followers: 400000, popularity: 70 });

    expect(size.artistTier).toBe("large");
    expect(size.score).toBeLessThan(50);
  });

  it("does not keep broad rock candidates with low genre relevance for a pop punk profile", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [
        spotifyArtist("shaka-like", "Broad Rock Candidate", 500000, 72, ["french rock", "rock"])
      ],
      spotifySearch: async () => []
    });

    expect(artists).toEqual([]);
  });

  it("keeps genre-relevant candidates with missing size metrics in unknown tier", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "unknown-size",
          name: "Unknown Size Pop Punk Band",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/unknown-size"
        }
      ]
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.artistTier).toBe("unknown");
    expect(artists[0]?.city).toBeNull();
    expect(artists[0]?.country).toBeNull();
    expect(artists[0]?.matchedQuery).toBe("pop punk france");
    expect(groupSimilarArtistsByTier(artists).unknown).toHaveLength(1);
  });

  it("keeps candidates with empty genres when the matched query is focused", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "focused-empty-genres",
          name: "Focused Empty Genres Band",
          followers: 2500,
          popularity: 19,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/focused-empty-genres"
        }
      ]
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.genreRelevance).toBeGreaterThanOrEqual(45);
    expect(artists[0]?.artistTier).toBe("small");
    expect(artists[0]?.matchedQuery).toBe("pop punk france");
  });

  it("rejects unrelated candidates or ranks them very low", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "unrelated",
          name: "Unrelated Mainstream Act",
          followers: 400000,
          popularity: 78,
          genres: ["electropop"],
          spotifyUrl: "https://open.spotify.com/artist/unrelated"
        }
      ]
    });

    expect(artists).toHaveLength(0);
  });

  it("maps Spotify artist results into SimilarArtist objects", () => {
    const artist = mapSpotifyArtistToSimilarArtist(
      spotifyArtist("spotify-artist-1", "Search Result Band", 8000, 31, ["pop punk", "emo"]),
      { profile, genre: "pop punk", city: "Paris", target: "France" },
      "spotify_search"
    );

    expect(artist).toMatchObject({
      name: "Search Result Band",
      url: "https://open.spotify.com/artist/spotify-artist-1",
      spotifyId: "spotify-artist-1",
      source: "spotify_search",
      artistTier: "medium",
      possibleUse: "support_target",
      estimatedFollowers: 8000,
      estimatedPopularity: 31
    });
    expect(artist.genreRelevance).toBeGreaterThanOrEqual(85);
    expect(artist.totalRelevance).toBeGreaterThan(50);
  });

  it("tiers Spotify artists with absolute thresholds when user metrics are missing", () => {
    expect(determineAbsoluteArtistTier(2000, 18)).toBe("small");
    expect(determineAbsoluteArtistTier(9000, 34)).toBe("medium");
    expect(determineAbsoluteArtistTier(70000, 50)).toBe("large");
    expect(determineAbsoluteArtistTier(null, null)).toBe("unknown");
  });

  it("deduplicates and excludes the user artist", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [
        spotifyArtist("user", "Tuesday Fall", 1200, 18, ["pop punk"]),
        spotifyArtist("small", "Small Spotify Band", 1000, 18, ["pop punk"]),
        spotifyArtist("small", "Small Spotify Band", 1000, 18, ["pop punk"]),
        spotifyArtist("medium", "Medium Spotify Band", 10000, 35, ["pop punk", "emo"]),
        spotifyArtist("large", "Large Spotify Band", 200000, 60, ["punk rock"])
      ]
    });

    expect(artists.map((artist) => artist.name)).not.toContain("Tuesday Fall");
    expect(artists).toHaveLength(3);
    const grouped = groupSimilarArtistsByTier(artists);
    expect(grouped.small).toHaveLength(1);
    expect(grouped.medium).toHaveLength(1);
    expect(grouped.large).toHaveLength(1);
  });

  it("returns non-empty similar artists by tier when Spotify search returns candidates", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      env: { MOCK_AI: "false" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async (query) => {
        if (query === "pop punk france") {
          return [
            spotifyArtist("small-query", "Small Query Band", 1200, 18, []),
            spotifyArtist("medium-query", "Medium Query Band", 12000, 32, []),
            spotifyArtist("large-query", "Large Query Band", 300000, 67, [])
          ];
        }

        return [];
      }
    });

    const grouped = groupSimilarArtistsByTier(artists);
    expect(artists).not.toHaveLength(0);
    expect(grouped.small.length + grouped.medium.length + grouped.large.length + grouped.unknown.length).toBeGreaterThan(0);
  });

  it("groups explicit unknown-tier artists", () => {
    const artist: SimilarArtist = {
      name: "Unknown Band",
      url: null,
      spotifyId: null,
      genres: ["pop punk"],
      city: null,
      country: null,
      source: "user",
      reason: "No metrics available.",
      confidence: 0.5,
      artistTier: "unknown",
      estimatedFollowers: null,
      estimatedPopularity: null,
      genreRelevance: 60,
      sizeRelevance: 35,
      sceneRelevance: 45,
      totalRelevance: 50,
      relevanceToUserArtist: 50,
      possibleUse: "unknown",
      estimatedLevel: null
    };

    expect(groupSimilarArtistsByTier([artist]).unknown).toEqual([artist]);
  });
});

function spotifyArtist(
  id: string,
  name: string,
  followers: number,
  popularity: number,
  genres: string[]
) {
  return {
    id,
    name,
    followers,
    popularity,
    genres,
    spotifyUrl: `https://open.spotify.com/artist/${id}`
  };
}
