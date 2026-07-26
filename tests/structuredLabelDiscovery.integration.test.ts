import { describe, expect, it } from "vitest";
import { discoverLabelOpportunities } from "../src/labels/discoverLabelOpportunities.js";
import type { LabelSearchInput, RawLabelCandidate } from "../src/labels/types.js";
import type { SimilarArtist } from "../src/schemas.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "../src/providers/web/WebSearchProvider.js";

const now = new Date("2026-07-22T00:00:00Z");

function similarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Thru It All",
    url: null,
    spotifyId: null,
    genres: ["pop punk"],
    city: null,
    country: "France",
    source: "mock",
    sources: ["mock"],
    reason: "test fixture",
    confidence: 0.9,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: null,
    estimatedPopularity: null,
    sizeSignalSource: "manual",
    genreRelevance: 90,
    localRelevance: 0,
    sizeRelevance: 0,
    sceneRelevance: 0,
    totalRelevance: 90,
    relevanceToUserArtist: 90,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: [],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: { estimatedLevel: "small", confidence: 0.8, sizeSignalSource: "manual", platforms: {} },
    discardedTags: [],
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null,
    ...overrides
  } as SimilarArtist;
}

const baseInput: LabelSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  limit: 10,
  similarArtists: [similarArtist()]
};

function musicBrainzCandidate(overrides: Partial<RawLabelCandidate> = {}): RawLabelCandidate {
  return {
    name: "Fake Records",
    url: "https://fakerecords.example",
    sourceName: "musicbrainz",
    strategy: "similar_artist_release",
    text: "Fake Records is a record label. Released music by Thru It All. Known releases on this label: Debut EP. Most recently released music in 2025.",
    links: [],
    confidence: 0.8,
    externalIds: { musicBrainzId: "label-1" },
    evidence: [
      {
        provider: "musicbrainz",
        sourceUrl: "https://musicbrainz.org/release/rel-1",
        similarArtistName: "Thru It All",
        releaseTitle: "Debut EP",
        releaseId: "rel-1",
        confidence: 0.8
      }
    ],
    ...overrides
  };
}

function emptySearchProvider(): WebSearchProvider {
  return {
    providerName: "empty-web-search",
    async search(): Promise<WebSearchResult[]> {
      return [];
    }
  };
}

describe("structured label discovery integration", () => {
  it("adds a MusicBrainz-derived opportunity whose explanation names the supporting artist and release", async () => {
    const result = await discoverLabelOpportunities(baseInput, {
      webSearchProvider: emptySearchProvider(),
      now,
      discoverMusicBrainzCandidates: async () => ({ candidates: [musicBrainzCandidate()], warnings: [] })
    });

    expect(result.opportunities).toHaveLength(1);
    const opportunity = result.opportunities[0]!;
    expect(opportunity.name).toBe("Fake Records");
    expect(opportunity.associatedArtists).toContain("Thru It All");
    expect(opportunity.compatibilityExplanation).toContain("Thru It All");
    expect(opportunity.compatibilityExplanation).toContain("Debut EP");
  });

  it("keeps the PR #181 web-search fallback fully operational when no structured providers are configured", async () => {
    const provider: WebSearchProvider = {
      providerName: "test-label-search",
      async search(query: string, _options?: WebSearchOptions): Promise<WebSearchResult[]> {
        if (query.includes("pop punk record label")) {
          return [{
            title: "Genre Label",
            url: "https://example.test/genre-label",
            snippet: "Independent pop punk record label with a growing roster and catalogue, active in 2025.",
            sourceProvider: "test-label-search",
            confidence: 0.7,
            links: []
          }];
        }
        return [];
      }
    };

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });

    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/genre-label")).toBe(true);
  });

  it("isolates a MusicBrainz discovery failure without losing web-search results", async () => {
    const provider: WebSearchProvider = {
      providerName: "test-label-search",
      async search(query: string): Promise<WebSearchResult[]> {
        if (query.includes("pop punk record label")) {
          return [{
            title: "Genre Label",
            url: "https://example.test/genre-label",
            snippet: "Independent pop punk record label with a growing roster and catalogue, active in 2025.",
            sourceProvider: "test-label-search",
            confidence: 0.7,
            links: []
          }];
        }
        return [];
      }
    };

    const result = await discoverLabelOpportunities(baseInput, {
      webSearchProvider: provider,
      maxQueriesPerStrategy: 3,
      now,
      discoverMusicBrainzCandidates: async () => {
        throw new Error("MusicBrainz is down");
      }
    });

    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/genre-label")).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("MusicBrainz is down"))).toBe(true);
  });

  it("deduplicates overlapping candidates surfaced by both MusicBrainz and a later enrichment step", async () => {
    const original = musicBrainzCandidate();
    const duplicate = musicBrainzCandidate({ url: "https://fakerecords.example/en", confidence: 0.9 });

    const result = await discoverLabelOpportunities(baseInput, {
      webSearchProvider: emptySearchProvider(),
      now,
      discoverMusicBrainzCandidates: async () => ({ candidates: [original], warnings: [] }),
      enrichWithDiscogs: async (candidates) => ({ candidates: [...candidates, duplicate], warnings: [] })
    });

    expect(result.opportunities).toHaveLength(1);
  });

  it("returns an empty result with explicit warnings when every provider is unavailable or fails", async () => {
    const result = await discoverLabelOpportunities(baseInput, {
      webSearchProvider: null,
      now,
      discoverMusicBrainzCandidates: async () => {
        throw new Error("MusicBrainz unreachable");
      }
    });

    expect(result.opportunities).toHaveLength(0);
    expect(result.warnings.some((warning) => /no web search provider/i.test(warning))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("MusicBrainz unreachable"))).toBe(true);
  });
});
