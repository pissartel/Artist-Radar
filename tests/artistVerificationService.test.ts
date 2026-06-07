import { describe, expect, it } from "vitest";
import { verifyAndEnrichArtistCandidate, type WebSearchProvider } from "../src/services/artistVerificationService.js";
import type { ArtistProfile } from "../src/schemas.js";
import type { SpotifyArtistProfile } from "../src/services/spotifyService.js";

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

describe("verifyAndEnrichArtistCandidate", () => {
  it("verifies a candidate from an exact Spotify name match", async () => {
    const result = await verifyAndEnrichArtistCandidate(
      {
        name: "Broad Peak",
        genres: ["post hardcore"],
        sources: ["lastfm_similar"]
      },
      {
        profile,
        genre: "post hardcore",
        spotifySearch: async () => [spotifyArtist("broad-peak", "Broad Peak", ["post hardcore"])]
      }
    );

    expect(result.verificationStatus).toBe("verified");
    expect(result.spotifyId).toBe("broad-peak");
    expect(result.spotifyUrl).toBe("https://open.spotify.com/artist/broad-peak");
  });

  it("does not attach an uncertain Spotify match", async () => {
    const result = await verifyAndEnrichArtistCandidate(
      {
        name: "Broad Peak",
        genres: ["post hardcore"],
        sources: ["lastfm_similar"]
      },
      {
        profile,
        genre: "post hardcore",
        spotifySearch: async () => [spotifyArtist("wrong", "Broadway Peaks Tribute", ["classic rock"])]
      }
    );

    expect(result.spotifyId).toBeNull();
    expect(result.spotifyUrl).toBeNull();
    expect(result.verificationStatus).toBe("needs_verification");
  });

  it("verifies a candidate from an Instagram URL found in web search results", async () => {
    const webSearchProvider: WebSearchProvider = {
      async search() {
        return [
          {
            title: "Broad Peak links",
            url: "https://www.instagram.com/broadpeakband/",
            snippet: null
          }
        ];
      }
    };

    const result = await verifyAndEnrichArtistCandidate(
      {
        name: "Broad Peak",
        genres: ["post hardcore"],
        sources: ["lastfm_similar"]
      },
      {
        profile,
        genre: "post hardcore",
        spotifySearch: async () => [],
        webSearchProvider
      }
    );

    expect(result.verificationStatus).toBe("verified");
    expect(result.instagramHandle).toBe("broadpeakband");
    expect(result.instagramUrl).toBe("https://www.instagram.com/broadpeakband/");
  });

  it("marks a Last.fm-only candidate as needs_verification", async () => {
    const result = await verifyAndEnrichArtistCandidate(
      {
        name: "Broad Peak",
        genres: ["post hardcore"],
        sources: ["lastfm_similar"]
      },
      {
        profile,
        genre: "post hardcore",
        spotifySearch: async () => []
      }
    );

    expect(result.verificationStatus).toBe("needs_verification");
    expect(result.evidenceNotes).toContain("Candidate is musically promising but still needs identity verification.");
  });
});

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
