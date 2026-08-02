import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpportunitySearch } from "../src/pipeline.js";
import { getPipelineExecutionState } from "../src/pipelineExecutionState.js";
import { buildMockBookingSourceProvider } from "../src/booking/providers/MockBookingSourceProvider.js";
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

  it("records real-time stage progress and completes at 100% when an executionId is provided (promo mode)", async () => {
    const executionId = `promo-${crypto.randomUUID()}`;
    let stageDuringGeneration: string | undefined;
    const generator: OpportunityGenerator = {
      async generate() {
        stageDuringGeneration = getPipelineExecutionState(executionId)?.stage;
        return validResult;
      }
    };

    const result = await runOpportunitySearch(promoInput, { generator, seedCandidates: [], executionId });

    expect(result.opportunities).toHaveLength(1);
    // The generator call sits inside SEARCHING_OPPORTUNITIES, so the state
    // must already reflect that stage while the call is in flight — not a
    // stage faked ahead of actual execution.
    expect(stageDuringGeneration).toBe("SEARCHING_OPPORTUNITIES");

    const finalState = getPipelineExecutionState(executionId);
    expect(finalState?.stage).toBe("COMPLETED");
    expect(finalState?.status).toBe("completed");
    expect(finalState?.percentage).toBe(100);
  });

  it("records real-time stage progress and completes at 100% when an executionId is provided (booking mode)", async () => {
    const executionId = `booking-${crypto.randomUUID()}`;

    const result = await runOpportunitySearch(input, {
      generator: generatorReturning(validResult),
      seedCandidates: [],
      executionId,
      bookingSearchOptions: { providers: [buildMockBookingSourceProvider()] }
    });

    expect(result.bookingSearch).toBeDefined();
    const finalState = getPipelineExecutionState(executionId);
    expect(finalState?.stage).toBe("COMPLETED");
    expect(finalState?.status).toBe("completed");
    expect(finalState?.percentage).toBe(100);
  });

  // Issue #201 follow-up regression: a real event's image/poster and
  // readable title must survive end to end through the full backend
  // pipeline (booking-search normalization -> legacy Opportunity mapping),
  // not just at the frontend mapping boundary.
  it("preserves an event opportunity's imageUrl and readable title through the complete backend pipeline", async () => {
    const provider = {
      providerName: "test_image_title_provider",
      async search() {
        return {
          sourceProvider: "test_image_title_provider",
          searchedQueries: [],
          warnings: [],
          metadata: {},
          targets: [
            {
              name: "The Slugz at La Maroquinerie",
              category: "event" as const,
              city: "Paris",
              country: "France",
              description: "Live show.",
              sourceUrl: "https://example.test/the-slugz-maroquinerie",
              sourceType: "event_page" as const,
              genres: ["metalcore"],
              estimatedCapacity: null,
              estimatedArtistTier: null,
              venueName: "La Maroquinerie",
              imageUrl: "https://images.example.test/the-slugz-poster.jpg",
              eventDate: "2026-09-12",
              contacts: [],
              confidence: 0.8,
              evidence: []
            }
          ]
        };
      }
    };

    const result = await runOpportunitySearch(input, {
      generator: generatorReturning(validResult),
      seedCandidates: [],
      bookingSearchOptions: { providers: [provider] }
    });

    const opportunity = result.opportunities.find((o) => o.source_url === "https://example.test/the-slugz-maroquinerie");
    expect(opportunity).toBeDefined();
    expect(opportunity!.imageUrl).toBe("https://images.example.test/the-slugz-poster.jpg");
    expect(opportunity!.name).toBe("The Slugz at La Maroquinerie");
    expect(opportunity!.name).not.toMatch(/concerts in|music events|gigs.*tickets/i);
  });

  it("exposes a recoverable failed stage when the pipeline throws, without leaving the state stuck mid-run", async () => {
    const executionId = `fail-${crypto.randomUUID()}`;
    const generator: OpportunityGenerator = {
      async generate() {
        return validResult;
      }
    };

    await expect(
      runOpportunitySearch({ ...input, mode: "promo", artist: "" }, { generator, seedCandidates: [], executionId })
    ).rejects.toThrow();

    const state = getPipelineExecutionState(executionId);
    expect(state?.status).toBe("failed");
    expect(state?.stage).toBe("VALIDATING_ARTIST");
    expect(state?.error).toEqual({ stage: "VALIDATING_ARTIST" });
  });

  it("does not track any execution state when no executionId is provided", async () => {
    await runOpportunitySearch(promoInput, { generator: generatorReturning(validResult), seedCandidates: [] });
    // No executionId means nothing to look up; this just documents that the
    // feature is fully opt-in and adds no overhead for untracked calls.
    expect(getPipelineExecutionState("")).toBeNull();
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
