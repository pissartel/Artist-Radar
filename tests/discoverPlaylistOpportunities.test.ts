import { describe, expect, it } from "vitest";
import { discoverPlaylistOpportunities } from "../src/playlists/discoverPlaylistOpportunities.js";
import type { WebSearchProvider, WebSearchResult } from "../src/providers/web/WebSearchProvider.js";

class FixtureProvider implements WebSearchProvider {
  providerName = "fixture";
  constructor(private readonly results: WebSearchResult[]) {}
  async search(): Promise<WebSearchResult[]> { return this.results; }
}

const activePlaylist: WebSearchResult = {
  title: "Fresh Pop Punk Finds",
  url: "https://open.spotify.com/playlist/verified123",
  snippet: "Pop punk playlist curated by Indie Ears. Updated weekly. 8.5K followers. Features Neck Deep. Free submission.",
  links: ["https://submithub.com/blog/indie-ears"],
  sourceProvider: "fixture",
  confidence: 0.9
};

describe("discoverPlaylistOpportunities", () => {
  it("discovers similar-artist playlists and retains a specific verified submission route", async () => {
    const result = await discoverPlaylistOpportunities({
      artist: "New Band",
      city: "Lyon",
      genre: "pop punk",
      target: "France",
      limit: 5,
      similarArtists: [{ name: "Neck Deep" } as never]
    }, {
      webSearchProvider: new FixtureProvider([activePlaylist]),
      maxQueriesPerStrategy: 1,
      maxResultsPerQuery: 2,
      now: new Date("2026-08-17T00:00:00Z")
    });

    expect(result.opportunities).toHaveLength(1);
    const opportunity = result.opportunities[0]!;
    expect(opportunity.opportunityType).toBe("playlist");
    expect(opportunity.associatedArtists).toEqual(["Neck Deep"]);
    expect(opportunity.playlist).toMatchObject({
      platform: "Spotify",
      followerCount: 8500,
      updateFrequency: "weekly",
      submissionMethod: "submithub",
      submissionPlatform: "SubmitHub",
      submissionUrl: "https://submithub.com/blog/indie-ears",
      submissionType: "free",
      curatorActivity: "active"
    });
    expect(opportunity.compatibilityExplanation).toContain("does not guarantee placement");
  });

  it("ranks active compatible playlists over inactive ones and downgrades suspicious claims", async () => {
    const inactive: WebSearchResult = {
      title: "Old Pop Punk Playlist",
      url: "https://open.spotify.com/playlist/old123",
      snippet: "Pop punk. Inactive and no longer updated. Guaranteed placement and guaranteed streams. 200K followers.",
      sourceProvider: "fixture",
      confidence: 0.95
    };
    const result = await discoverPlaylistOpportunities({
      artist: "New Band", city: "Lyon", genre: "pop punk", limit: 5
    }, {
      webSearchProvider: new FixtureProvider([inactive, activePlaylist]),
      maxQueriesPerStrategy: 1
    });

    expect(result.opportunities[0]?.name).toBe("Fresh Pop Punk Finds");
    expect(result.opportunities[1]?.playlist?.growthSignal).toBe("suspicious");
    expect(result.opportunities[1]?.compatibilityScore).toBeLessThan(result.opportunities[0]?.compatibilityScore ?? 0);
  });

  it("rejects platform homepages because they are not specific public profiles", async () => {
    const result = await discoverPlaylistOpportunities({ artist: "New Band", city: "Lyon", genre: "pop punk", limit: 5 }, {
      webSearchProvider: new FixtureProvider([{
        title: "SubmitHub playlists", url: "https://submithub.com/", snippet: "Playlist curators", sourceProvider: "fixture", confidence: 0.8
      }]),
      maxQueriesPerStrategy: 1
    });
    expect(result.opportunities).toEqual([]);
    expect(result.metadata.rejectedCount).toBeGreaterThan(0);
  });
});
