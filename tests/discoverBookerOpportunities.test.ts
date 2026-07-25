import { describe, expect, it } from "vitest";
import { discoverBookerOpportunities } from "../src/bookers/discoverBookerOpportunities.js";
import type { BookerSearchInput } from "../src/bookers/types.js";
import type { SimilarArtist } from "../src/schemas.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "../src/providers/web/WebSearchProvider.js";

const now = new Date("2026-07-25T00:00:00Z");

const baseInput: BookerSearchInput = {
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
    providerName: "test-booker-search",
    async search(query: string, _options?: WebSearchOptions): Promise<WebSearchResult[]> {
      return byQuery(query);
    }
  };
}

describe("discoverBookerOpportunities", () => {
  it("returns no opportunities and a warning when no web search provider is enabled", async () => {
    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: null });
    expect(result.opportunities).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/no web search provider/i);
  });

  it("finds a booking agency through similar-artist representation data", async () => {
    const similarArtist = baseSimilarArtist({ name: "Thru It All" });
    const provider = mockSearchProvider((query) => {
      if (query.includes('"Thru It All"') && query.includes("booking agency")) {
        return [{
          title: "Fake Booking Agency",
          url: "https://example.test/fake-agency",
          snippet: "Independent booking agency representing Thru It All and a roster of pop punk artists, still active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.75,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(
      { ...baseInput, similarArtists: [similarArtist] },
      { webSearchProvider: provider, maxQueriesPerStrategy: 3, now }
    );

    expect(result.opportunities).toHaveLength(1);
    const opportunity = result.opportunities[0]!;
    expect(opportunity.opportunityType).toBe("booking_agency");
    expect(opportunity.associatedArtists).toContain("Thru It All");
    expect(opportunity.booker?.representedSimilarArtists).toContain("Thru It All");
    expect(opportunity.compatibilityExplanation).toContain("Thru It All");
  });

  it("finds a booking agency through genre-specific discovery, independent of any similar-artist connection", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency")) {
        return [{
          title: "Genre Agency",
          url: "https://example.test/genre-agency",
          snippet: "Independent pop punk booking agency with a growing roster, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });

    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/genre-agency")).toBe(true);
  });

  it("distinguishes an independent promoter from a booking agency", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency")) {
        return [{
          title: "Roster Agency",
          url: "https://example.test/roster-agency",
          snippet: "Independent pop punk booking agency representing a roster of touring artists, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      if (query.includes("independent promoter pop punk")) {
        return [{
          title: "Local Promoter",
          url: "https://example.test/local-promoter",
          snippet: "Independent promoter that organizes pop punk concerts every month, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 6, now });
    const agency = result.opportunities.find((o) => o.sourceUrl === "https://example.test/roster-agency");
    const promoter = result.opportunities.find((o) => o.sourceUrl === "https://example.test/local-promoter");
    expect(agency?.opportunityType).toBe("booking_agency");
    expect(promoter?.opportunityType).toBe("promoter");
  });

  it("includes audience compatibility in the ranking via the agency's roster tier", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency")) {
        return [{
          title: "Major Agency",
          url: "https://example.test/major-agency",
          snippet: "A major agency with a global roster, pop punk booking agency, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    const opportunity = result.opportunities.find((o) => o.sourceUrl === "https://example.test/major-agency");
    expect(opportunity?.audienceLevel).toBe("large");
  });

  it("distinguishes local, national and international/remote-compatible bookers", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency Paris")) {
        return [{
          title: "Local Agency",
          url: "https://example.test/local-agency",
          snippet: "Independent pop punk booking agency based in Paris, representing a roster of artists, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      if (query.includes("international pop punk booking agency accepting artists from abroad")) {
        return [{
          title: "Worldwide Agency",
          url: "https://example.test/worldwide-agency",
          snippet: "Independent pop punk booking agency with a worldwide roster, accepts international artists, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 5, now });
    const local = result.opportunities.find((o) => o.sourceUrl === "https://example.test/local-agency");
    const worldwide = result.opportunities.find((o) => o.sourceUrl === "https://example.test/worldwide-agency");
    expect(local?.geographicScope).toBe("local");
    expect(worldwide?.geographicScope).toBe("online");
  });

  it("filters out bookers/agencies/promoters with explicit inactivity evidence", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency")) {
        return [{
          title: "Defunct Agency",
          url: "https://example.test/defunct-agency",
          snippet: "This independent pop punk booking agency, representing a roster of artists, ceased operations in 2018 and is no longer active.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/defunct-agency")).toBe(false);
    expect(result.metadata.droppedForInactivity).toBeGreaterThan(0);
  });

  it("only displays a submission link when it is backed by a real source link, and never invents a personal contact", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency")) {
        return [{
          title: "Submission Agency",
          url: "https://example.test/submission-agency",
          snippet: "Independent pop punk booking agency, roster of artists, now accepting new artists, active in 2025.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: ["https://example.test/submit-your-artist"]
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    const opportunity = result.opportunities.find((o) => o.sourceUrl === "https://example.test/submission-agency");
    expect(opportunity?.booker?.acceptsSubmissions).toBe(true);
    expect(opportunity?.booker?.submissionUrl).toBe("https://example.test/submit-your-artist");
    expect(opportunity?.publicEmail).toBeNull();
  });

  it("does not classify a result as a booker/agency/promoter from a bare keyword without representation evidence", async () => {
    const provider = mockSearchProvider((query) => {
      if (query.includes("pop punk booking agency")) {
        return [{
          title: "Generic Agency Website",
          url: "https://example.test/generic-agency",
          snippet: "A generic booking agency website with no further details.",
          sourceProvider: "test-booker-search",
          confidence: 0.7,
          links: []
        }];
      }
      return [];
    });

    const result = await discoverBookerOpportunities(baseInput, { webSearchProvider: provider, maxQueriesPerStrategy: 3, now });
    expect(result.opportunities.some((o) => o.sourceUrl === "https://example.test/generic-agency")).toBe(false);
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
