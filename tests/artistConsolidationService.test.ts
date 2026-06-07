import { describe, expect, it } from "vitest";
import { consolidateArtistCandidate } from "../src/services/artistConsolidationService.js";
import { buildFirecrawlWebSearchProvider } from "../src/services/firecrawlService.js";
import type { ArtistProfile } from "../src/schemas.js";
import type { SpotifyArtistProfile } from "../src/services/spotifyService.js";
import type { YouTubeChannelStats } from "../src/services/youtubeService.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genres: ["pop punk"],
  socialLinks: {},
  platformStats: {},
  estimatedLevel: "emerging",
  confidence: 0.7,
  notes: []
};

describe("consolidateArtistCandidate", () => {
  it("attaches a Spotify URL for an exact name match", async () => {
    const result = await consolidateArtistCandidate(
      baseCandidate("Bad Frequencies"),
      {
        profile,
        userGenres: ["pop punk"],
        spotifySearch: async () => [spotifyArtist("bad-frequencies", "Bad Frequencies", ["pop punk"])],
        musicBrainzSearch: async () => null
      }
    );

    expect(result.spotifyId).toBe("bad-frequencies");
    expect(result.spotifyUrl).toBe("https://open.spotify.com/artist/bad-frequencies");
    expect(result.verificationStatus).toBe("verified");
  });

  it("attaches an Instagram handle from web search results", async () => {
    const result = await consolidateArtistCandidate(
      baseCandidate("Bad Frequencies"),
      {
        profile,
        userGenres: ["pop punk"],
        spotifySearch: async () => [],
        musicBrainzSearch: async () => null,
        webSearchProvider: {
          async search() {
            return [{ title: "Bad Frequencies", url: "https://www.instagram.com/badfrequenciesband/", snippet: null }];
          }
        }
      }
    );

    expect(result.instagramHandle).toBe("badfrequenciesband");
    expect(result.instagramUrl).toBe("https://www.instagram.com/badfrequenciesband/");
  });

  it("skips Firecrawl enrichment cleanly when disabled", async () => {
    const provider = buildFirecrawlWebSearchProvider({
      ENABLE_FIRECRAWL_CONSOLIDATION: "false",
      FIRECRAWL_API_KEY: "test-key"
    });
    const result = await consolidateArtistCandidate(
      baseCandidate("Bad Frequencies"),
      {
        profile,
        userGenres: ["pop punk"],
        spotifySearch: async () => [],
        musicBrainzSearch: async () => null,
        env: {
          ENABLE_FIRECRAWL_CONSOLIDATION: "false",
          FIRECRAWL_API_KEY: "test-key"
        }
      }
    );

    expect(provider).toBeNull();
    expect(result.genreEvidence).toEqual([]);
    expect(result.locationEvidence).toEqual([]);
  });

  it("adds genre and location evidence from Firecrawl-style web results", async () => {
    const result = await consolidateArtistCandidate(
      baseCandidate("Bad Frequencies"),
      {
        profile,
        userGenres: ["pop punk"],
        spotifySearch: async () => [],
        musicBrainzSearch: async () => null,
        webSearchProvider: {
          async search() {
            return [
              {
                title: "Bad Frequencies - French pop punk band",
                url: "https://example.com/bad-frequencies",
                snippet: "Bad Frequencies are a French pop punk band from France.",
                markdown: "Bad Frequencies are a French pop punk band.",
                links: ["https://www.instagram.com/badfrequenciesband/"]
              }
            ];
          }
        }
      }
    );

    expect(result.genres).toContain("pop punk");
    expect(result.country).toBe("France");
    expect(result.city).not.toBe("France");
    expect(result.genreEvidence.some((entry) => entry.source === "firecrawl" && entry.genres.includes("pop punk"))).toBe(true);
    expect(result.locationEvidence.some((entry) => entry.source === "firecrawl" && entry.country === "France")).toBe(true);
    expect(result.instagramHandle).toBe("badfrequenciesband");
  });

  it("adds YouTube stats as size evidence when a channel URL is found", async () => {
    const result = await consolidateArtistCandidate(
      baseCandidate("Bad Frequencies"),
      {
        profile,
        userGenres: ["pop punk"],
        spotifySearch: async () => [],
        musicBrainzSearch: async () => null,
        webSearchProvider: {
          async search(query) {
            return query.includes("YouTube")
              ? [{ title: "Bad Frequencies - YouTube", url: "https://www.youtube.com/@badfrequencies", snippet: null }]
              : [];
          }
        },
        youtubeChannelStats: async () => youtubeStats(),
        env: { WEB_SEARCH_MAX_QUERIES_PER_CANDIDATE: "4" }
      }
    );

    expect(result.youtubeUrl).toBe("https://www.youtube.com/@badfrequencies");
    expect(result.youtubeChannelId).toBe("youtube-bad-frequencies");
    expect(result.youtubeSubscribers).toBe(1200);
    expect(result.sizeEvidence.some((entry) => entry.source === "youtube" && entry.subscribers === 1200)).toBe(true);
  });

  it("adds Last.fm tags as genre evidence", async () => {
    const result = await consolidateArtistCandidate(
      baseCandidate("Bad Frequencies"),
      {
        profile,
        userGenres: ["pop punk"],
        spotifySearch: async () => [],
        musicBrainzSearch: async () => null,
        lastfmArtistInfo: async () => ({
          name: "Bad Frequencies",
          url: "https://www.last.fm/music/Bad+Frequencies",
          tags: ["pop punk", "punk rock"],
          listeners: 1200,
          playcount: 5000
        })
      }
    );

    expect(result.genres).toContain("pop punk");
    expect(result.genreEvidence.some((entry) => entry.source === "lastfm" && entry.genres.includes("pop punk"))).toBe(true);
  });
});

function baseCandidate(name: string) {
  return {
    name,
    genres: [],
    city: null,
    country: null,
    sources: ["lastfm_similar"],
    sourceUrls: []
  };
}

function spotifyArtist(id: string, name: string, genres: string[]): SpotifyArtistProfile {
  return {
    id,
    name,
    followers: null,
    popularity: null,
    genres,
    spotifyUrl: `https://open.spotify.com/artist/${id}`,
    images: []
  };
}

function youtubeStats(): YouTubeChannelStats {
  return {
    youtubeChannelId: "youtube-bad-frequencies",
    youtubeTitle: "Bad Frequencies",
    youtubeHandle: "@badfrequencies",
    youtubeSubscribers: 1200,
    youtubeTotalViews: 90000,
    youtubeVideoCount: 12,
    hiddenSubscriberCount: false,
    youtubeUrl: "https://www.youtube.com/@badfrequencies"
  };
}
