import { describe, expect, it, vi } from "vitest";
import {
  extractSpotifyArtistId,
  getSpotifyArtistProfile,
  getSpotifyArtistById,
  getSpotifyRelatedArtists,
  searchSpotifyArtists
} from "../src/services/spotifyService.js";

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

    expect(profile).toMatchObject({
      id: spotifyArtistId,
      name: "Mock Spotify Artist",
      followers: 1200,
      popularity: 18,
      genres: ["metalcore", "hardcore"],
      spotifyUrl: `https://open.spotify.com/artist/${spotifyArtistId}`,
      images: [],
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "spotify_artist"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps Spotify artist profile fields from the API response", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          id: spotifyArtistId,
          name: "Tuesday Fall",
          followers: { total: 4321 },
          popularity: 27,
          genres: ["pop punk", "punk rock"],
          external_urls: {
            spotify: "https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps"
          }
        })
      );

    const profile = await getSpotifyArtistProfile(
      `https://open.spotify.com/artist/${spotifyArtistId}`,
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_TOP_TRACKS: "true"
      },
      fetchImpl
    );

    expect(profile).toMatchObject({
      id: spotifyArtistId,
      name: "Tuesday Fall",
      followers: 4321,
      popularity: 27,
      genres: ["pop punk", "punk rock"],
      spotifyUrl: "https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps",
      images: [],
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "spotify_artist"
    });
  });

  it("fetches and normalizes a Spotify artist by id", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          id: "6FBDaR13swtiWwGhX1WQsP",
          name: "blink-182",
          followers: { total: 6500000 },
          popularity: 82,
          genres: ["punk", "rock"],
          external_urls: {
            spotify: "https://open.spotify.com/artist/spotify-id"
          },
          images: [{ url: "https://image.example/green-day.jpg" }]
        })
      );

    const artist = await getSpotifyArtistById(
      "6FBDaR13swtiWwGhX1WQsP",
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_TOP_TRACKS: "true"
      },
      fetchImpl
    );

    expect(artist).toMatchObject({
      id: "6FBDaR13swtiWwGhX1WQsP",
      name: "blink-182",
      followers: 6500000,
      popularity: 82,
      genres: ["punk", "rock"],
      spotifyUrl: "https://open.spotify.com/artist/spotify-id",
      images: ["https://image.example/green-day.jpg"],
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "spotify_artist"
    });
  });

  it("falls back to top track popularity when artist popularity and followers are missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          id: "6FBDaR13swtiWwGhX1WQsP",
          name: "blink-182",
          followers: { total: null },
          popularity: null,
          genres: [],
          external_urls: {
            spotify: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP"
          }
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          tracks: [
            { popularity: 66 },
            { popularity: 61 },
            { popularity: 58 }
          ]
        })
      );

    const artist = await getSpotifyArtistById(
      "6FBDaR13swtiWwGhX1WQsP",
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_TOP_TRACKS: "true"
      },
      fetchImpl
    );

    expect(artist).toMatchObject({
      id: "6FBDaR13swtiWwGhX1WQsP",
      name: "blink-182",
      followers: null,
      popularity: null,
      genres: [],
      spotifyUrl: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP",
      topTrackPopularityMax: 66,
      topTrackPopularityAvg: 62,
      topTrackCount: 3,
      sizeSignalSource: "spotify_tracks"
    });
  });

  it("preserves zero and empty Spotify artist metadata values", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          id: spotifyArtistId,
          name: "Zero Value Artist",
          followers: { total: 0 },
          popularity: 0,
          genres: [],
          external_urls: {
            spotify: "https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps"
          }
        })
      );

    const profile = await getSpotifyArtistProfile(
      `https://open.spotify.com/artist/${spotifyArtistId}`,
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_TOP_TRACKS: "true"
      },
      fetchImpl
    );

    expect(profile).toMatchObject({
      id: spotifyArtistId,
      name: "Zero Value Artist",
      followers: 0,
      popularity: 0,
      genres: [],
      spotifyUrl: "https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps",
      images: [],
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "spotify_artist"
    });
  });

  it("returns an empty artist search result when Spotify credentials are missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(searchSpotifyArtists("pop punk France", 5, {}, fetchImpl)).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call related artists when the feature is disabled", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      getSpotifyRelatedArtists(
        spotifyArtistId,
        {
          SPOTIFY_CLIENT_ID: "id",
          SPOTIFY_CLIENT_SECRET: "secret",
          ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
        },
        fetchImpl
      )
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not call top tracks when the feature is disabled", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          id: "6FBDaR13swtiWwGhX1WQsP",
          name: "blink-182",
          followers: { total: null },
          popularity: null,
          genres: [],
          external_urls: {
            spotify: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP"
          }
        })
      );

    await getSpotifyArtistById(
      "6FBDaR13swtiWwGhX1WQsP",
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_TOP_TRACKS: "false"
      },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("searches Spotify artists and maps API results", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          artists: {
            items: [
              {
                id: "artist-1",
                name: "Spotify Search Band",
                followers: { total: 9000 },
                popularity: 34,
                genres: ["pop punk"],
                external_urls: {
                  spotify: "https://open.spotify.com/artist/artist-1"
                }
              }
            ]
          }
        })
      );

    const artists = await searchSpotifyArtists(
      "pop punk France",
      5,
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "true"
      },
      fetchImpl
    );

    expect(artists).toEqual([
      {
        id: "artist-1",
        name: "Spotify Search Band",
        followers: 9000,
        popularity: 34,
        genres: ["pop punk"],
        spotifyUrl: "https://open.spotify.com/artist/artist-1",
        images: [],
        topTrackPopularityMax: null,
        topTrackPopularityAvg: null,
        topTrackCount: null,
        sizeSignalSource: "spotify_artist"
      }
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns an empty artist search result and warns when Spotify search fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(responseWithJson({}, false, 500));

    await expect(
      searchSpotifyArtists("pop punk France", 5, { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret" }, fetchImpl)
    ).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Spotify artist search failed"));
    warn.mockRestore();
  });

  it("fetches Spotify related artists and maps API results", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(
        responseWithJson({
          artists: [
            {
              id: "related-1",
              name: "Related Spotify Band",
              followers: { total: 12000 },
              popularity: 38,
              genres: ["pop punk"],
              external_urls: {
                spotify: "https://open.spotify.com/artist/related-1"
              }
            }
          ]
        })
      );

    const artists = await getSpotifyRelatedArtists(
      spotifyArtistId,
      {
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "true"
      },
      fetchImpl
    );

    expect(artists).toEqual([
      {
        id: "related-1",
        name: "Related Spotify Band",
        followers: 12000,
        popularity: 38,
        genres: ["pop punk"],
        spotifyUrl: "https://open.spotify.com/artist/related-1",
        images: [],
        topTrackPopularityMax: null,
        topTrackPopularityAvg: null,
        topTrackCount: null,
        sizeSignalSource: "spotify_artist"
      }
    ]);
  });

  it("does not print the unavailable log for 403 related artists when DEBUG_SPOTIFY is disabled", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(responseWithJson({}, false, 403));

    await expect(
      getSpotifyRelatedArtists(
        spotifyArtistId,
        {
          SPOTIFY_CLIENT_ID: "id",
          SPOTIFY_CLIENT_SECRET: "secret",
          ENABLE_SPOTIFY_RELATED_ARTISTS: "true"
        },
        fetchImpl
      )
    ).resolves.toEqual([]);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });

  it("prints the unavailable log for 403 related artists when DEBUG_SPOTIFY is enabled", async () => {
    vi.stubEnv("DEBUG_SPOTIFY", "true");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ access_token: "token" }))
      .mockResolvedValueOnce(responseWithJson({}, false, 403));

    await expect(
      getSpotifyRelatedArtists(
        spotifyArtistId,
        {
          SPOTIFY_CLIENT_ID: "id",
          SPOTIFY_CLIENT_SECRET: "secret",
          ENABLE_SPOTIFY_RELATED_ARTISTS: "true"
        },
        fetchImpl
      )
    ).resolves.toEqual([]);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Spotify related artists unavailable."));
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });
});

function responseWithJson(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  } as Response;
}
