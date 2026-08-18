import { describe, expect, it } from "vitest";
import { discoverCommunityOpportunities } from "../src/community/discoverCommunityOpportunities.js";
import type { WebSearchProvider, WebSearchResult } from "../src/providers/web/WebSearchProvider.js";

class FixtureProvider implements WebSearchProvider {
  providerName = "fixture";
  constructor(private readonly results: WebSearchResult[]) {}
  async search(): Promise<WebSearchResult[]> { return this.results; }
}

describe("discoverCommunityOpportunities", () => {
  it("returns an active local collective with a concrete, source-backed opportunity", async () => {
    const result = await discoverCommunityOpportunities({
      artist: "New Band",
      city: "Lyon",
      genre: "pop punk",
      target: "France",
      limit: 5,
      similarArtists: [{ name: "Neck Deep" } as never]
    }, {
      webSearchProvider: new FixtureProvider([{
        title: "Lyon Punk Collective",
        url: "https://example.org/lyon-punk",
        snippet: "Active pop punk artist collective in Lyon, France. 2026 residency program: emerging artist showcase. Networking and rehearsal spaces with Neck Deep alumni.",
        links: ["https://example.org/lyon-punk/apply", "https://example.org/lyon-punk/contact"],
        sourceProvider: "fixture",
        confidence: 0.9
      }]),
      maxQueriesPerStrategy: 1,
      now: new Date("2026-08-18T00:00:00Z")
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      opportunityType: "collective",
      city: "Lyon",
      country: "France",
      applicationUrl: "https://example.org/lyon-punk/apply",
      associatedArtists: ["Neck Deep"],
      communityOrganization: {
        organizationType: "collective",
        isCurrentlyActive: true,
        supportedArtistLevel: "emerging",
        applicationOrMembershipUrl: "https://example.org/lyon-punk/apply"
      }
    });
    expect(result.opportunities[0]?.compatibilityExplanation).toContain("Concrete opportunity");
  });

  it("rejects inactive or undated organizations and venue-only entities", async () => {
    const result = await discoverCommunityOpportunities({ artist: "New Band", city: "Lyon", genre: "rock", limit: 5 }, {
      webSearchProvider: new FixtureProvider([
        { title: "Old Music Association", url: "https://example.org/old", snippet: "A music association and former support program.", sourceProvider: "fixture", confidence: 0.8 },
        { title: "The Music Hall", url: "https://example.org/hall", snippet: "Live music venue with upcoming concerts in 2026.", sourceProvider: "fixture", confidence: 0.8 }
      ]),
      maxQueriesPerStrategy: 1
    });

    expect(result.opportunities).toEqual([]);
    expect(result.metadata.rejectedCount).toBeGreaterThan(0);
  });

  it("uses genre, local and similar-artist signals in ranking", async () => {
    const results: WebSearchResult[] = [
      { title: "Remote Arts Association", url: "https://example.org/remote", snippet: "Active since 2026 cultural association with annual visual arts projects.", sourceProvider: "fixture", confidence: 0.9 },
      { title: "Local Punk Association", url: "https://example.org/local", snippet: "2026 pop punk association in Lyon supporting Neck Deep through annual showcases and artist development.", sourceProvider: "fixture", confidence: 0.9 }
    ];
    const result = await discoverCommunityOpportunities({ artist: "New Band", city: "Lyon", genre: "pop punk", limit: 5, similarArtists: [{ name: "Neck Deep" } as never] }, {
      webSearchProvider: new FixtureProvider(results), maxQueriesPerStrategy: 1
    });
    expect(result.opportunities[0]?.name).toBe("Local Punk Association");
    expect(result.opportunities[0]?.compatibilityScore).toBeGreaterThan(result.opportunities[1]?.compatibilityScore ?? 0);
  });
});
