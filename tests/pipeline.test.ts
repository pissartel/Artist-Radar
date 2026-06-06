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

    const result = await runOpportunitySearch(input, { generator });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.name).toBe("First Venue");
    expect(result.artistProfile.artistName).toBe("Fake Band");
    expect(result.similarArtistsByTier).toEqual({ small: [], medium: [], large: [], unknown: [] });
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
        links: ["https://www.instagram.com/fakeband"]
      },
      { generator }
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

    const result = await runOpportunitySearch(input, { generator });

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
      { generator: generatorReturning(validResult) }
    );

    expect(result.similarArtists).toHaveLength(9);
    expect(result.similarArtistsByTier.small).toHaveLength(3);
    expect(result.similarArtistsByTier.medium).toHaveLength(3);
    expect(result.similarArtistsByTier.large).toHaveLength(3);
    expect(result.similarArtistsByTier.unknown).toEqual([]);
    expect(result.venueCandidates.length).toBeGreaterThan(0);
    expect(result.eventCandidates.length).toBeGreaterThan(0);
    expect(result.eventCandidates[0]?.lineupStatus).toBe("support_not_announced");
    expect(result.artistProfile.estimatedLevel).toBe("emerging");
  });

  it("includes real-mode Spotify similar artists when search returns results", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");

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
        spotifyRelatedArtists: async () => [
          {
            id: "small",
            name: "Small Spotify Band",
            followers: 1000,
            popularity: 18,
            genres: ["pop punk"],
            spotifyUrl: "https://open.spotify.com/artist/small"
          }
        ]
      }
    );

    expect(result.similarArtists).toHaveLength(1);
    expect(result.similarArtistsByTier.small).toHaveLength(1);
    expect(result.similarArtists[0]?.source).toBe("spotify_related");
  });

  it("keeps promo mode working with the enriched result shape", async () => {
    const result = await runOpportunitySearch(
      {
        ...input,
        mode: "promo"
      },
      { generator: generatorReturning(validResult) }
    );

    expect(result.opportunities).toHaveLength(1);
    expect(result.artistProfile.artistName).toBe("Fake Band");
    expect(result.similarArtistsByTier.unknown).toEqual([]);
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

    await expect(runOpportunitySearch(input, { generator })).rejects.toThrow();
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
      runOpportunitySearch({ ...input, artist: "" }, { generator })
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
