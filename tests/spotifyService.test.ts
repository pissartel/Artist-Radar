import { describe, expect, it, vi } from "vitest";
import { extractSpotifyArtistId, getSpotifyArtistProfile } from "../src/services/spotifyService.js";

const spotifyArtistId = "2RO6dHJK11CKcEg1G7XYps";

describe("spotifyService", () => {
  it("extracts a Spotify artist ID from localized artist URLs", () => {
    expect(
      extractSpotifyArtistId(`https://open.spotify.com/intl-fr/artist/${spotifyArtistId}?si=abc123`)
    ).toBe(spotifyArtistId);
  });

  it("extracts a Spotify artist ID from standard artist URLs", () => {
    expect(extractSpotifyArtistId(`https://open.spotify.com/artist/${spotifyArtistId}`)).toBe(spotifyArtistId);
  });

  it("returns null for missing Spotify credentials without calling fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      getSpotifyArtistProfile(`https://open.spotify.com/artist/${spotifyArtistId}`, {}, fetchImpl)
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns deterministic mock Spotify data when MOCK_AI is true", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const profile = await getSpotifyArtistProfile(
      `https://open.spotify.com/artist/${spotifyArtistId}`,
      { MOCK_AI: "true" },
      fetchImpl
    );

    expect(profile).toEqual({
      id: spotifyArtistId,
      name: "Mock Spotify Artist",
      followers: 1200,
      popularity: 18,
      genres: ["metalcore", "hardcore"],
      spotifyUrl: `https://open.spotify.com/artist/${spotifyArtistId}`
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
