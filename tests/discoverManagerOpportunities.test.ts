import { describe, expect, it, vi } from "vitest";
import { discoverManagerOpportunities, mergeAndDeduplicate } from "../src/managers/discoverManagerOpportunities.js";
import type { ManagerSearchInput, RawManagerCandidate } from "../src/managers/types.js";
import type { SimilarArtist } from "../src/schemas.js";
import { TtlCache } from "../src/utils/ttlCache.js";
import type { WebSearchProvider } from "../src/providers/web/WebSearchProvider.js";

const similarArtist = { name: "Thru It All", artistTier: "small" } as SimilarArtist;
const input: ManagerSearchInput = {
  artist: "Tuesday Fall", city: "Paris", genre: "pop punk", target: "France", limit: 20,
  artistProfile: {
    artistName: "Tuesday Fall", city: "Paris", country: "France", genres: ["pop punk"],
    spotifyArtistName: null, spotifyGenres: [], socialLinks: {}, platformStats: {},
    estimatedLevel: "emerging", confidence: .8, notes: []
  },
  similarArtists: [similarArtist]
};

function provider(): WebSearchProvider & { search: ReturnType<typeof vi.fn> } {
  const search = vi.fn(async (query: string) => query.includes("Thru It All") ? [{
    title: "Small Hours Management", url: "https://management.test/roster",
    snippet: "Small Hours is a boutique artist management company. Current roster: Thru It All, New Band. It manages emerging pop punk artists and accepts new artists in 2026.",
    sourceProvider: "test", confidence: .9, links: ["https://management.test/contact"]
  }] : []);
  return { providerName: "test", search };
}

describe("discoverManagerOpportunities", () => {
  it("uses similar artists as the lightweight evidence gate and caps overview results", async () => {
    const result = await discoverManagerOpportunities({ ...input, mode: "lightweight" }, {
      webSearchProvider: provider(), cache: new TtlCache(60_000), now: new Date("2026-08-17")
    });
    expect(result.metadata.mode).toBe("lightweight");
    expect(result.searchedQueries.length).toBeLessThanOrEqual(3);
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.manager?.relevantArtists).toEqual(["Thru It All"]);
    expect(result.opportunities[0]?.compatibilityExplanation).toContain("Thru It All");
    expect(result.opportunities[0]?.manager?.relationshipStatus).toBe("current");
  });

  it("makes deep mode distinguishable and caches an identical expensive search", async () => {
    const searchProvider = provider();
    const cache = new TtlCache<string, Awaited<ReturnType<typeof discoverManagerOpportunities>>>(60_000);
    const first = await discoverManagerOpportunities({ ...input, mode: "deep" }, { webSearchProvider: searchProvider, cache });
    const callCount = searchProvider.search.mock.calls.length;
    const second = await discoverManagerOpportunities({ ...input, mode: "deep" }, { webSearchProvider: searchProvider, cache });
    expect(first.metadata.mode).toBe("deep");
    expect(second.fromCache).toBe(true);
    expect(searchProvider.search).toHaveBeenCalledTimes(callCount);
  });

  it("filters explicitly inactive management companies", async () => {
    const searchProvider: WebSearchProvider = { providerName: "test", async search(query) {
      return query.includes("Thru It All") ? [{ title: "Closed Management", url: "https://closed.test", snippet: "Artist management company roster: Thru It All. Ceased operations in 2024.", sourceProvider: "test", confidence: .9 }] : [];
    }};
    const result = await discoverManagerOpportunities({ ...input, mode: "deep" }, { webSearchProvider: searchProvider, cache: new TtlCache(60_000), now: new Date("2026-08-17") });
    expect(result.opportunities).toHaveLength(0);
    expect(result.metadata.droppedForInactivity).toBeGreaterThan(0);
  });

  it("does not treat a bare management keyword as professional evidence", async () => {
    const searchProvider: WebSearchProvider = { providerName: "test", async search(query) {
      return query.includes("Thru It All") ? [{ title: "Management Tips", url: "https://blog.test", snippet: "Management ideas for musicians.", sourceProvider: "test", confidence: .9 }] : [];
    }};
    const result = await discoverManagerOpportunities({ ...input, mode: "deep" }, { webSearchProvider: searchProvider, cache: new TtlCache(60_000) });
    expect(result.opportunities).toHaveLength(0);
  });
});

describe("mergeAndDeduplicate manager candidates", () => {
  it("merges repeated domains and preserves evidence text", () => {
    const candidate = (overrides: Partial<RawManagerCandidate>): RawManagerCandidate => ({
      name: "Small Hours", url: "https://management.test/about", sourceName: "web", strategy: "similar_artist_management",
      entityType: "management_company", text: "manages Thru It All", links: [], confidence: .7, ...overrides
    });
    const merged = mergeAndDeduplicate([
      candidate({}), candidate({ url: "https://www.management.test/roster", text: "roster: New Band", confidence: .9 })
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toContain("New Band");
    expect(merged[0]?.confidence).toBe(.9);
  });
});
