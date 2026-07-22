import { describe, expect, it } from "vitest";
import { discoverLabelOpportunities } from "../src/labels/discoverLabelOpportunities.js";
import type { LabelSearchInput } from "../src/labels/types.js";
import type { SimilarArtist } from "../src/schemas.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "../src/providers/web/WebSearchProvider.js";

const now = new Date("2026-07-22T00:00:00Z");

const baseInput: LabelSearchInput = {
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

function mockSearchProvider(byQuery: (query: string) => WebSearchResult[]): WebSearchProvider {
  return {
    providerName: "test-label-search",
    async search(query: string, _options?: WebSearchOptions): Promise<WebSearchResult[]> {
      return byQuery(query);
    }
  };
}

describe("discoverLabelOpportunities", () => {
  it("returns no opportunities and a warning when no web search provider is enabled", async () => {
    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: null });
    expect(result.opportunities).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/no web search provider/i);
  });

  it("finds a label through similar-artist release data", async () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const provider = mockSearchProvider((query) => {
      if (query.includes('"Thru It All"')) {
        return [{
          title: "Fake Records",
          url: "https://example.test/fake-records",
          snippet: "Independent record label that released Thru It All's debut EP, roster of pop punk artists, still releasing music in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.75,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(
      { ...baseInput, similarArtists: [similarArtist] },
      { webSearchProvider: provider, maxQueriesPerStrategy: 3, now }
    );

    expect(result.opportunities).toHaveLength(1);
    const opportunity = result.opportunities[0]!;
    expect(opportunity.opportunityType).toBe("label");
    expect(opportunity.associatedArtists).toContain("Thru It All");
    expect(opportunity.label?.signedArtists).toContain("Thru It All");
    expect(opportunity.compatibilityExplanation).toContain("Thru It All");
  });

  it("finds a label through genre-specific discovery, independent of any similar-artist connection", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk record label")) {
        return [{
          title: "Genre Label",
          url: "https://example.test/genre-label",
          snippet: "Independent pop punk record label with a growing roster and catalogue, active release schedule in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });

    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/genre-label")).toBe(true);
  });

  it("includes audience compatibility in the ranking via the label's roster tier", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk record label")) {
        return [{
          title: "Major Label",
          url: "https://example.test/major-label",
          snippet: "A major label with a global roster, pop punk catalogue, active in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    const opportunity = result.opportunities.find((o) => o.sourceUrl === "https://example.test/major-label");
    expect(opportunity?.audienceLevel).toBe("large");
  });

  it("distinguishes local, national and international/remote-compatible labels", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk label Paris")) {
        return [{
          title: "Local Label",
          url: "https://example.test/local-label",
          snippet: "Independent pop punk record label based in Paris, active release schedule in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      if (query.includes("international pop punk label accepting artists from abroad")) {
        return [{
          title: "Worldwide Label",
          url: "https://example.test/worldwide-label",
          snippet: "Independent pop punk record label with a worldwide roster, accepts international artists, active in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 4, now });
    const local = result.opportunities.find((o) => o.sourceUrl === "https://example.test/local-label");
    const worldwide = result.opportunities.find((o) => o.sourceUrl === "https://example.test/worldwide-label");
    expect(local?.geographicScope).toBe("local");
    expect(worldwide?.geographicScope).toBe("online");
  });

  it("classifies a label evidently based in a different country as international, distinct from local/national/remote-compatible", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk record label")) {
        return [{
          title: "Foreign Label",
          url: "https://example.test/foreign-label",
          snippet: "Independent pop punk record label based in Germany, active release schedule in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    const foreign = result.opportunities.find((o) => o.sourceUrl === "https://example.test/foreign-label");
    expect(foreign?.geographicScope).toBe("international");
    expect(foreign?.country).toBe("Germany");
  });

  it("filters out labels with explicit inactivity evidence", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk record label")) {
        return [{
          title: "Defunct Label",
          url: "https://example.test/defunct-label",
          snippet: "This independent pop punk record label ceased operations in 2018 and is no longer active.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/defunct-label")).toBe(false);
    expect(result.metadata.droppedForInactivity).toBeGreaterThan(0);
  });

  it("only displays a demo submission link when it is backed by a real source link", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk record label")) {
        return [{
          title: "Demo Label",
          url: "https://example.test/demo-label",
          snippet: "Independent pop punk record label, we accept demos from new artists, active in 2025.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: ["https://example.test/demo-submission-form"]
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    const opportunity = result.opportunities.find((o) => o.sourceUrl === "https://example.test/demo-label");
    expect(opportunity?.label?.acceptsDemos).toBe(true);
    expect(opportunity?.label?.demoSubmissionUrl).toBe("https://example.test/demo-submission-form");
  });

  it("does not classify a result as a label from a bare keyword without music-industry evidence", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk record label")) {
        return [{
          title: "Clothing Label Store",
          url: "https://example.test/clothing-label",
          snippet: "Private label clothing store, family owned, best prices in town.",
          sourceProvider: "test-label-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverLabelOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/clothing-label")).toBe(false);
    expect(result.metadata.droppedForMissingEvidence).toBeGreaterThan(0);
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
