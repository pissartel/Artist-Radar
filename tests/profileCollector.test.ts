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
    vi.unstubAllGlobals();
  });

  it("extracts social URLs from generic links", () => {
    const socialLinks = extractSocialLinks({
      links: [
        "https://example.com",
        "https://open.spotify.com/artist/123",
        "https://www.youtube.com/@fakeband",
        "https://www.instagram.com/fakeband",
        "https://www.deezer.com/artist/456"
      ],
      spotifyUrl: null,
      youtubeUrl: null,
      instagramUrl: null,
      deezerUrl: null
    });

    expect(socialLinks.spotifyUrl).toBe("https://open.spotify.com/artist/123");
    expect(socialLinks.youtubeUrl).toBe("https://www.youtube.com/@fakeband");
    expect(socialLinks.instagramUrl).toBe("https://www.instagram.com/fakeband");
    expect(socialLinks.deezerUrl).toBe("https://www.deezer.com/artist/456");
  });

  it("prefers dedicated social URL flags over generic links", () => {
    const socialLinks = extractSocialLinks({
      links: ["https://open.spotify.com/artist/from-links"],
      spotifyUrl: "https://open.spotify.com/artist/from-flag",
      youtubeUrl: null,
      instagramUrl: null,
      deezerUrl: null
    });

    expect(socialLinks.spotifyUrl).toBe("https://open.spotify.com/artist/from-flag");
  });

  it("normalizes CLI input into an artist profile without Spotify metadata when credentials are missing", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_DEEZER_ARTIST_SEARCH", "false");

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
    expect(profile.imageUrl).toBeNull();
    expect(profile.imageSource).toBeNull();
    expect(profile.imageConfidence).toBeNull();
  });

  it("resolves the main artist Spotify profile by exact name when no Spotify URL is provided", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
    vi.stubEnv("ENABLE_DEEZER_ARTIST_SEARCH", "false");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            artists: {
              items: [
                {
                  id: "spotify-tuesday-fall",
                  name: "Tuesday Fall",
                  followers: { total: 1200 },
                  popularity: 18,
                  genres: ["pop punk"],
                  external_urls: { spotify: "https://open.spotify.com/artist/spotify-tuesday-fall" },
                  images: []
                }
              ]
            }
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await collectArtistProfile({
      ...baseInput,
      artist: "Tuesday Fall",
      genre: "pop punk"
    });

    expect(profile.spotify?.id).toBe("spotify-tuesday-fall");
    expect(profile.socialLinks.spotifyUrl).toBe("https://open.spotify.com/artist/spotify-tuesday-fall");
    expect(profile.platformStats.spotifyFollowers).toBe(1200);
    expect(profile.platformStats.spotifyPopularity).toBe(18);
  });

  it("resolves Deezer fans by exact name and uses them as profile audience data", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    vi.stubEnv("ENABLE_DEEZER_ARTIST_SEARCH", "true");

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 456,
              name: "Tuesday Fall",
              nb_fan: 930,
              link: "https://www.deezer.com/artist/456",
              picture_medium: "https://image.example/tuesday-fall.jpg"
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await collectArtistProfile({
      ...baseInput,
      artist: "Tuesday Fall",
      genre: "pop punk"
    });

    expect(profile.socialLinks.deezerUrl).toBe("https://www.deezer.com/artist/456");
    expect(profile.platformStats.deezerFans).toBe(930);
    expect(profile.estimatedLevel).toBe("emerging");
  });

  it("resolves a generic imageUrl from Spotify metadata when a confident match exists", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
    vi.stubEnv("ENABLE_DEEZER_ARTIST_SEARCH", "false");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "token" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "2RO6dHJK11CKcEg1G7XYps",
            name: "Fake Band",
            followers: { total: 4321 },
            popularity: 27,
            genres: ["metalcore"],
            external_urls: { spotify: "https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps" },
            images: [{ url: "https://image.example/fake-band.jpg" }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await collectArtistProfile({
      ...baseInput,
      links: ["https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps"]
    });

    expect(profile.spotify?.imageUrl).toBe("https://image.example/fake-band.jpg");
    expect(profile.imageUrl).toBe("https://image.example/fake-band.jpg");
    expect(profile.imageSource).toBe("spotify");
    expect(profile.imageConfidence).toBeGreaterThan(0);
  });

  it("enriches the artist profile with deterministic Spotify data in mock mode", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const profile = await collectArtistProfile({
      ...baseInput,
      links: ["https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps"]
    });

    expect(profile.spotifyArtistName).toBe("Mock Spotify Artist");
    expect(profile.youtubeChannelId).toBeNull();
    expect(profile.platformStats.spotifyFollowers).toBe(1200);
    expect(profile.platformStats.spotifyPopularity).toBe(18);
    expect(profile.spotifyGenres).toEqual(["metalcore", "hardcore"]);
    expect(profile.genres).toEqual(["metalcore", "hardcore"]);
    expect(profile.estimatedLevel).toBe("emerging");
  });

  it("enriches the artist profile with deterministic YouTube stats in mock mode", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const profile = await collectArtistProfile({
      ...baseInput,
      youtubeUrl: "https://www.youtube.com/@TUESDAYFALL"
    });

    expect(profile.youtubeChannelId).toBe("mock-youtube-channel");
    expect(profile.youtubeTitle).toBe("Tuesday Fall");
    expect(profile.platformStats.youtubeSubscribers).toBe(2400);
    expect(profile.platformStats.youtubeTotalViews).toBe(185000);
    expect(profile.platformStats.youtubeVideoCount).toBe(24);
    expect(profile.platformStats.hiddenSubscriberCount).toBe(false);
  });

  it("infers a basic level from provided mock stats", async () => {
    vi.stubEnv("ENABLE_DEEZER_ARTIST_SEARCH", "false");

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

  it("classifies strong Spotify signals as established", () => {
    expect(estimateArtistLevel({ spotifyFollowers: 1000, spotifyPopularity: 46 })).toBe("established");
    expect(estimateArtistLevel({ spotifyFollowers: 51000, spotifyPopularity: 10 })).toBe("established");
  });

  it("uses YouTube metrics as supporting evidence with large thresholds", () => {
    expect(estimateArtistLevel({ youtubeSubscribers: 7000, youtubeTotalViews: 120000, youtubeVideoCount: 10 })).toBe(
      "developing"
    );
    expect(estimateArtistLevel({ youtubeSubscribers: 60000, youtubeTotalViews: 200000, youtubeVideoCount: 8 })).toBe("established");
    expect(
      estimateArtistLevel({ youtubeSubscribers: 120000, youtubeTotalViews: 6_000_000, youtubeVideoCount: 40 })
    ).toBe("established");
  });
});
