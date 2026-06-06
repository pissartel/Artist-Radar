import { afterEach, describe, expect, it, vi } from "vitest";
import { collectArtistProfile, estimateArtistLevel, extractSocialLinks } from "../src/modules/profileCollector.js";
import type { ArtistInput } from "../src/schemas.js";

const baseInput: ArtistInput = {
  mode: "booking",
  artist: "Fake Band",
  city: "Lyon",
  genre: "metalcore",
  target: null,
  links: [],
  limit: 10
};

describe("profileCollector", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts social URLs from generic links", () => {
    const socialLinks = extractSocialLinks({
      links: [
        "https://example.com",
        "https://open.spotify.com/artist/123",
        "https://www.youtube.com/@fakeband",
        "https://www.instagram.com/fakeband"
      ],
      spotifyUrl: null,
      youtubeUrl: null,
      instagramUrl: null
    });

    expect(socialLinks.spotifyUrl).toBe("https://open.spotify.com/artist/123");
    expect(socialLinks.youtubeUrl).toBe("https://www.youtube.com/@fakeband");
    expect(socialLinks.instagramUrl).toBe("https://www.instagram.com/fakeband");
  });

  it("prefers dedicated social URL flags over generic links", () => {
    const socialLinks = extractSocialLinks({
      links: ["https://open.spotify.com/artist/from-links"],
      spotifyUrl: "https://open.spotify.com/artist/from-flag",
      youtubeUrl: null,
      instagramUrl: null
    });

    expect(socialLinks.spotifyUrl).toBe("https://open.spotify.com/artist/from-flag");
  });

  it("normalizes CLI input into an artist profile without Spotify metadata when credentials are missing", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");

    const profile = await collectArtistProfile({
      ...baseInput,
      links: ["https://open.spotify.com/artist/123"]
    });

    expect(profile.artistName).toBe("Fake Band");
    expect(profile.city).toBe("Lyon");
    expect(profile.genres).toEqual(["metalcore"]);
    expect(profile.socialLinks.spotifyUrl).toBe("https://open.spotify.com/artist/123");
    expect(profile.estimatedLevel).toBe("unknown");
    expect(profile.confidence).toBeGreaterThan(0);
    expect(profile.notes.join(" ")).toContain("without Spotify metadata");
  });

  it("enriches the artist profile with deterministic Spotify data in mock mode", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const profile = await collectArtistProfile({
      ...baseInput,
      links: ["https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps"]
    });

    expect(profile.spotifyArtistName).toBe("Mock Spotify Artist");
    expect(profile.platformStats.spotifyFollowers).toBe(1200);
    expect(profile.platformStats.spotifyPopularity).toBe(18);
    expect(profile.spotifyGenres).toEqual(["metalcore", "hardcore"]);
    expect(profile.genres).toEqual(["metalcore", "hardcore"]);
    expect(profile.estimatedLevel).toBe("emerging");
  });

  it("infers a basic level from provided mock stats", async () => {
    const profile = await collectArtistProfile({
      ...baseInput,
      platformStats: {
        spotifyFollowers: 8000,
        spotifyPopularity: 30
      }
    });

    expect(profile.estimatedLevel).toBe("developing");
    expect(profile.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("estimates artist levels from Spotify metrics", () => {
    expect(estimateArtistLevel({})).toBe("unknown");
    expect(estimateArtistLevel({ spotifyFollowers: 1200, spotifyPopularity: 18 })).toBe("emerging");
    expect(estimateArtistLevel({ spotifyFollowers: 8000, spotifyPopularity: 30 })).toBe("developing");
    expect(estimateArtistLevel({ spotifyFollowers: 120000, spotifyPopularity: 20 })).toBe("established");
  });

  it("does not mark an artist established from one borderline Spotify signal", () => {
    expect(estimateArtistLevel({ spotifyFollowers: 1000, spotifyPopularity: 46 })).toBe("developing");
    expect(estimateArtistLevel({ spotifyFollowers: 51000, spotifyPopularity: 10 })).toBe("developing");
  });
});
