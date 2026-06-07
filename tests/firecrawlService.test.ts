import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIRECRAWL_SEARCH_ENDPOINT,
  buildFirecrawlWebSearchProvider
} from "../src/services/firecrawlService.js";
import { findSimilarArtists } from "../src/modules/similarArtistsFinder.js";
import type { ArtistProfile } from "../src/schemas.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genres: ["pop punk"],
  spotifyArtistName: "Tuesday Fall",
  spotifyGenres: ["pop punk"],
  socialLinks: {},
  platformStats: {},
  estimatedLevel: "emerging",
  confidence: 0.75,
  notes: []
};

describe("Firecrawl service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the v1 search endpoint and request format", async () => {
    const fetchMock = vi.fn(async () => responseWithJson({ data: [] })) as unknown as typeof fetch;
    const provider = buildFirecrawlWebSearchProvider(
      {
        FIRECRAWL_API_KEY: "test-key",
        ENABLE_FIRECRAWL_CONSOLIDATION: "true"
      },
      fetchMock
    );

    await provider?.search('"Broad Peak" "pop punk" band', 5);

    expect(vi.mocked(fetchMock)).toHaveBeenCalledWith(
      FIRECRAWL_SEARCH_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          query: '"Broad Peak" "pop punk" band',
          limit: 5
        })
      })
    );
  });

  it("returns [] when fetch fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const provider = buildFirecrawlWebSearchProvider(
      {
        FIRECRAWL_API_KEY: "test-key",
        ENABLE_FIRECRAWL_CONSOLIDATION: "true"
      },
      fetchMock
    );

    await expect(provider?.search('"Broad Peak" "pop punk" band', 5)).resolves.toEqual([]);
  });

  it("logs a detailed safe error when DEBUG_FIRECRAWL is true", async () => {
    vi.stubEnv("DEBUG_FIRECRAWL", "true");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = new Error("fetch failed");
    Object.defineProperty(error, "cause", { value: new Error("network unavailable") });
    const fetchMock = vi.fn(async () => {
      throw error;
    }) as unknown as typeof fetch;
    const provider = buildFirecrawlWebSearchProvider(
      {
        FIRECRAWL_API_KEY: "secret-key",
        ENABLE_FIRECRAWL_CONSOLIDATION: "true",
        FIRECRAWL_TIMEOUT_MS: "1234"
      },
      fetchMock
    );

    await provider?.search('"Broad Peak" "pop punk" band', 5);

    const output = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain(FIRECRAWL_SEARCH_ENDPOINT);
    expect(output).toContain('\\"Broad Peak\\" \\"pop punk\\" band');
    expect(output).toContain("fetch failed");
    expect(output).toContain("network unavailable");
    expect(output).toContain("firecrawlApiKeyPresent");
    expect(output).toContain("requestTimeoutMs");
    expect(output).not.toContain("secret-key");
  });

  it("continues consolidation when a Firecrawl query fails and keeps candidate in to_verify", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [{ name: "Broad Peak", url: null, match: 0.94 }],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => [],
      webSearchProvider: {
        async search() {
          throw new Error("fetch failed");
        }
      }
    });

    const candidate = artists.find((artist) => artist.name === "Broad Peak");
    expect(candidate?.bookingCategory).toBe("to_verify");
    expect(candidate?.evidenceNotes.map((note) => note.toLowerCase())).toContain("firecrawl search failed; candidate still needs verification.");
  });
});

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
