import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpportunitySearch } from "../src/pipeline.js";
import type { ArtistInput, OpportunitySearchResult } from "../src/schemas.js";
import type { OpportunityGenerator } from "../src/services/openaiService.js";

const input: ArtistInput = {
  mode: "booking",
  artist: "Fake Band",
  city: "Lyon",
  genre: "metalcore",
  target: null,
  links: [],
  limit: 1
};

const promoInput: ArtistInput = {
  ...input,
  mode: "promo"
};

const validResult: OpportunitySearchResult = {
  opportunities: [
    {
      name: "First Venue",
      type: "venue",
      city: "Lyon",
      country: "France",
      source_url: null,
      contact: null,
      reason: "Relevant local venue for the artist genre.",
      score: 80,
      suggested_message: "Hello, I would like to introduce Fake Band for a possible show."
    },
    {
      name: "Second Venue",
      type: "venue",
      city: "Lyon",
      country: "France",
      source_url: null,
      contact: null,
      reason: "Another relevant local venue.",
      score: 72,
      suggested_message: "Hello, I would like to introduce Fake Band for a possible show."
    }
  ]
};

describe("runOpportunitySearch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the injected generator and applies the requested limit", async () => {
    const generator = generatorReturning(validResult);

    const result = await runOpportunitySearch(promoInput, { generator, seedCandidates: [] });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.name).toBe("First Venue");
    expect(result.artistProfile.artistName).toBe("Fake Band");
    expect(result.similarArtists).toEqual({ local_peer: [], regional_peer: [], support_target: [], reference: [], to_verify: [], unknown: [] });
    expect(result).not.toHaveProperty("similarArtistsByTier");
  });

  it("includes the normalized artist profile in the generator prompt", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");

    let prompt = "";
    const generator: OpportunityGenerator = {
      async generate(value) {
        prompt = value;
        return validResult;
      }
    };

    await runOpportunitySearch(
      {
        ...input,
        mode: "promo",
        links: ["https://www.instagram.com/fakeband"]
      },
      { generator, seedCandidates: [] }
    );

    expect(prompt).toContain("Normalized artist profile");
    expect(prompt).toContain("https://www.instagram.com/fakeband");
    expect(prompt).toContain('"estimatedLevel": "unknown"');
  });

  it("normalizes uncertain generated URL fields before returning opportunities", async () => {
    const generator = generatorReturning({
      opportunities: [
        {
          ...validResult.opportunities[0],
          contact: "",
          source_url: "site officiel"
        }
      ]
    } as unknown as OpportunitySearchResult);

    const result = await runOpportunitySearch(promoInput, { generator, seedCandidates: [] });

    expect(result.opportunities[0]?.source_url).toBeNull();
    expect(result.opportunities[0]?.contact).toBeNull();
  });

  it("returns visible similar artists grouped by tier for a Tuesday Fall-like mock profile", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const result = await runOpportunitySearch(
      {
        ...input,
        artist: "Tuesday Fall",
        city: "Paris",
        genre: "pop punk",
        target: "grandes villes françaises",
        spotifyUrl: "https://open.spotify.com/intl-fr/artist/2RO6dHJK11CKcEg1G7XYps?si=test",
        youtubeUrl: "https://www.youtube.com/@TUESDAYFALL",
        instagramUrl: "https://www.instagram.com/tuesdayfall/"
      },
      { generator: generatorReturning(validResult), seedCandidates: [] }
    );

    expect(result.similarArtists.local_peer.length + result.similarArtists.regional_peer.length + result.similarArtists.support_target.length + result.similarArtists.reference.length).toBe(9);
    expect(result.similarArtists.unknown).toEqual([]);
    expect(result).not.toHaveProperty("similarArtistsByTier");
    expect(result.venueCandidates.length).toBeGreaterThan(0);
    expect(result.eventCandidates.length).toBeGreaterThan(0);
    expect(result.eventCandidates[0]?.lineupStatus).toBe("support_not_announced");
    expect(result.artistProfile.estimatedLevel).toBe("emerging");
  });

  it("includes real-mode Spotify similar artists when search returns results", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_SPOTIFY_RELATED_ARTISTS", "true");
    vi.stubEnv("ENABLE_SPOTIFY_DEEP_ENRICHMENT", "true");

    const result = await runOpportunitySearch(
      {
        ...input,
        artist: "Tuesday Fall",
        city: "Paris",
        genre: "pop punk",
        target: "France",
        spotifyUrl: "https://open.spotify.com/artist/example",
        platformStats: {
          spotifyFollowers: 1200,
          spotifyPopularity: 18
        }
      },
      {
        generator: generatorReturning(validResult),
        seedCandidates: [],
        spotifyRelatedArtists: async () => [
          {
            id: "small",
            name: "Small Spotify Band",
            followers: 1000,
            popularity: 18,
            genres: ["pop punk"],
            spotifyUrl: "https://open.spotify.com/artist/small",
            images: []
          }
        ]
      }
    );

    expect(result.similarArtists.reference.length + result.similarArtists.to_verify.length + result.similarArtists.unknown.length).toBe(1);
    expect(result).not.toHaveProperty("similarArtistsByTier");
  });

  it("puts enriched Spotify search results into the large tier when metrics are high", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_SPOTIFY_RELATED_ARTISTS", "true");
    vi.stubEnv("ENABLE_SPOTIFY_DEEP_ENRICHMENT", "true");

    const result = await runOpportunitySearch(
      {
        ...input,
        artist: "Tuesday Fall",
        city: "Paris",
        genre: "pop punk",
        target: "France",
        spotifyUrl: "https://open.spotify.com/artist/example",
        platformStats: {
          spotifyFollowers: 1200,
          spotifyPopularity: 18
        }
      },
      {
        generator: generatorReturning(validResult),
        seedCandidates: [],
        spotifyRelatedArtists: async () => [],
        spotifySearch: async () => [
          {
            id: "6FBDaR13swtiWwGhX1WQsP",
            name: "blink-182",
            followers: null,
            popularity: null,
            genres: [],
            spotifyUrl: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP",
            images: []
          }
        ],
        spotifyArtistById: async () => ({
          id: "6FBDaR13swtiWwGhX1WQsP",
          name: "blink-182",
          followers: 6_000_000,
          popularity: 81,
          genres: ["punk", "rock"],
          spotifyUrl: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP",
          images: []
        })
      }
    );

    expect(result.similarArtists.reference).toHaveLength(1);
    expect(result.similarArtists.reference[0]?.name).toBe("blink-182");
    expect(result.similarArtists.reference[0]?.estimatedFollowers).toBe(6_000_000);
    expect(result.similarArtists.reference[0]?.estimatedPopularity).toBe(81);
  });

  it("falls back to Spotify top tracks when artist popularity and followers are missing", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_SPOTIFY_RELATED_ARTISTS", "true");
    vi.stubEnv("ENABLE_SPOTIFY_DEEP_ENRICHMENT", "true");
    vi.stubEnv("ENABLE_SPOTIFY_TOP_TRACKS", "true");

    const result = await runOpportunitySearch(
      {
        ...input,
        artist: "Tuesday Fall",
        city: "Paris",
        genre: "pop punk",
        target: "France",
        spotifyUrl: "https://open.spotify.com/artist/example",
        platformStats: {
          spotifyFollowers: 1200,
          spotifyPopularity: 18
        }
      },
      {
        generator: generatorReturning(validResult),
        seedCandidates: [],
        spotifyRelatedArtists: async () => [],
        spotifySearch: async () => [
          {
            id: "blink-182",
            name: "blink-182",
            followers: null,
            popularity: null,
            genres: [],
            spotifyUrl: "https://open.spotify.com/artist/blink-182",
            images: []
          }
        ],
        spotifyArtistById: async () => ({
          id: "blink-182",
          name: "blink-182",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/blink-182",
          images: [],
          topTrackPopularityMax: 66,
          topTrackPopularityAvg: 61,
          topTrackCount: 3,
          sizeSignalSource: "spotify_tracks"
        })
      }
    );

    expect(result.similarArtists.reference).toHaveLength(1);
    expect(result.similarArtists.reference[0]?.name).toBe("blink-182");
    expect(result.similarArtists.reference[0]?.sizeSignalSource).toBe("spotify_tracks");
    expect(result.similarArtists.reference[0]?.topTrackPopularityMax).toBe(66);
  });

  it("classifies enriched Spotify search candidates as large when metrics are available", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_SPOTIFY_RELATED_ARTISTS", "true");
    vi.stubEnv("ENABLE_SPOTIFY_DEEP_ENRICHMENT", "true");

    const result = await runOpportunitySearch(
      {
        ...input,
        artist: "Tuesday Fall",
        city: "Paris",
        genre: "pop punk",
        target: "France",
        spotifyUrl: "https://open.spotify.com/artist/example",
        platformStats: {
          spotifyFollowers: 1200,
          spotifyPopularity: 18
        }
      },
      {
        generator: generatorReturning(validResult),
        seedCandidates: [],
        spotifyRelatedArtists: async () => [],
        spotifySearch: async () => [
          {
            id: "green-day",
            name: "Green Day",
            followers: null,
            popularity: null,
            genres: [],
            spotifyUrl: "https://open.spotify.com/artist/green-day",
            images: []
          }
        ],
        spotifyArtistById: async () => ({
          id: "green-day",
          name: "Green Day",
          followers: 6_500_000,
          popularity: 82,
          genres: ["punk", "rock"],
          spotifyUrl: "https://open.spotify.com/artist/green-day",
          images: []
        })
      }
    );

    expect(result.similarArtists.reference).toHaveLength(1);
    expect(result.similarArtists.reference[0]?.name).toBe("Green Day");
    expect(result.similarArtists.reference[0]?.estimatedFollowers).toBe(6_500_000);
    expect(result.similarArtists.reference[0]?.estimatedPopularity).toBe(82);
  });

  it("keeps the pipeline running when Spotify metrics are missing", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_SPOTIFY_RELATED_ARTISTS", "true");
    vi.stubEnv("ENABLE_SPOTIFY_DEEP_ENRICHMENT", "false");

    const result = await runOpportunitySearch(
      {
        ...input,
        artist: "Tuesday Fall",
        city: "Paris",
        genre: "pop punk",
        target: "France",
        spotifyUrl: "https://open.spotify.com/artist/example",
        platformStats: {
          spotifyFollowers: null,
          spotifyPopularity: null,
          youtubeSubscribers: null,
          youtubeTotalViews: null,
          youtubeVideoCount: null
        }
      },
      {
        generator: generatorReturning(validResult),
        seedCandidates: [],
        spotifyRelatedArtists: async () => [],
        spotifySearch: async () => [
          {
            id: "unknown-size",
            name: "Unknown Size Band",
            followers: null,
            popularity: null,
            genres: [],
            spotifyUrl: "https://open.spotify.com/artist/unknown-size",
            images: []
          }
        ]
      }
    );

    expect(result.similarArtists.reference).toHaveLength(1);
    expect(result.artistProfile.estimatedLevel).toBe("unknown");
  });

  it("keeps promo mode working with the enriched result shape", async () => {
    const result = await runOpportunitySearch(
      {
        ...input,
        mode: "promo"
      },
      { generator: generatorReturning(validResult), seedCandidates: [] }
    );

    expect(result.opportunities).toHaveLength(1);
    expect(result.artistProfile.artistName).toBe("Fake Band");
    expect(result.similarArtists.unknown).toEqual([]);
  });

  it("validates generated opportunities after URL normalization", async () => {
    const generator = generatorReturning({
      opportunities: [
        {
          ...validResult.opportunities[0],
          name: ""
        }
      ]
    } as unknown as OpportunitySearchResult);

    await expect(runOpportunitySearch(promoInput, { generator, seedCandidates: [] })).rejects.toThrow();
  });

  it("validates raw input before calling the generator", async () => {
    let calls = 0;
    const generator: OpportunityGenerator = {
      async generate() {
        calls += 1;
        return validResult;
      }
    };

    await expect(
      runOpportunitySearch({ ...input, artist: "" }, { generator, seedCandidates: [] })
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

function generatorReturning(result: OpportunitySearchResult): OpportunityGenerator {
  return {
    async generate() {
      return result;
    }
  };
}
