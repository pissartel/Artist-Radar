import { describe, expect, it, vi } from "vitest";
import { matchChartmetricArtist } from "../src/features/artist-enrichment/chartmetric/chartmetric.matcher.js";
import type { ChartmetricClient } from "../src/features/artist-enrichment/chartmetric/chartmetric.client.js";
import type { ArtistEnrichmentInput } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

function fakeClient(overrides: Partial<ChartmetricClient> = {}): ChartmetricClient {
  return {
    getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 1 }),
    searchArtistsByName: vi.fn().mockResolvedValue({ data: [], retryCount: 0, durationMs: 1 }),
    getArtistUrls: vi.fn().mockResolvedValue({ data: { spotifyIds: [], spotifyUrls: [] }, retryCount: 0, durationMs: 1 }),
    getArtistStats: vi.fn(),
    ...overrides
  } as unknown as ChartmetricClient;
}

const baseInput: ArtistEnrichmentInput = { artistName: "Broad Peak" };

describe("matchChartmetricArtist", () => {
  it("matches with exact confidence on a Spotify artist ID hit", async () => {
    const client = fakeClient({
      getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: { id: 42, name: "Broad Peak" }, retryCount: 0, durationMs: 1 })
    });

    const outcome = await matchChartmetricArtist({ ...baseInput, spotifyArtistId: "spotify123" }, client);

    expect(outcome).toEqual({
      status: "matched",
      chartmetricArtistId: "42",
      matchMethod: "spotify_id",
      matchConfidence: "exact"
    });
  });

  it("matches with exact confidence via a Spotify artist URL when no ID was given", async () => {
    const getArtistBySpotifyId = vi.fn().mockResolvedValue({ data: { id: 7, name: "Broad Peak" }, retryCount: 0, durationMs: 1 });
    const client = fakeClient({ getArtistBySpotifyId });

    const outcome = await matchChartmetricArtist(
      { ...baseInput, spotifyUrl: "https://open.spotify.com/artist/abc123" },
      client
    );

    expect(getArtistBySpotifyId).toHaveBeenCalledWith("abc123");
    expect(outcome.status).toBe("matched");
    expect(outcome.matchMethod).toBe("spotify_url");
    expect(outcome.matchConfidence).toBe("exact");
  });

  it("returns not_found when nothing matches by identifier or name", async () => {
    const client = fakeClient();
    const outcome = await matchChartmetricArtist(baseInput, client);
    expect(outcome.status).toBe("not_found");
  });

  it("never guesses: returns ambiguous when several artists share the exact name", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [
          { id: 1, name: "Sunset" },
          { id: 2, name: "Sunset" }
        ],
        retryCount: 0,
        durationMs: 1
      })
    });

    const outcome = await matchChartmetricArtist({ artistName: "Sunset" }, client);
    expect(outcome.status).toBe("ambiguous");
    expect(outcome.chartmetricArtistId).toBeUndefined();
  });

  it("uses a known Spotify ID to disambiguate multiple exact-name candidates", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [
          { id: 1, name: "Broad Peak", spotifyId: "other-spotify-id" },
          {
            id: 2,
            name: "Broad Peak",
            spotifyId: "SPOTIFY123",
            spotifyMonthlyListeners: 3766,
            spotifyFollowers: 1346
          }
        ],
        retryCount: 0,
        durationMs: 1
      })
    });

    const outcome = await matchChartmetricArtist({ ...baseInput, spotifyArtistId: "spotify123" }, client);

    expect(outcome).toEqual({
      status: "matched",
      chartmetricArtistId: "2",
      matchMethod: "name_with_platform_links",
      matchConfidence: "high",
      spotifyMonthlyListeners: 3766,
      spotifyFollowers: 1346
    });
  });

  it("uses Chartmetric artist URLs to disambiguate exact-name candidates when search results omit Spotify codes", async () => {
    const getArtistUrls = vi
      .fn()
      .mockResolvedValueOnce({
        data: { spotifyIds: [], spotifyUrls: ["https://open.spotify.com/artist/other"] },
        retryCount: 0,
        durationMs: 1
      })
      .mockResolvedValueOnce({
        data: { spotifyIds: [], spotifyUrls: ["https://open.spotify.com/artist/4r903oqNo1mfW3mIg1TjIk"] },
        retryCount: 0,
        durationMs: 1
      });
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [
          { id: 1, name: "TYDEAL" },
          { id: 2, name: "TYDEAL", spotifyMonthlyListeners: 3766, spotifyFollowers: 1346 }
        ],
        retryCount: 0,
        durationMs: 1
      }),
      getArtistUrls
    });

    const outcome = await matchChartmetricArtist({ artistName: "TYDEAL", spotifyArtistId: "4r903oqNo1mfW3mIg1TjIk" }, client);

    expect(getArtistUrls).toHaveBeenCalledWith("1");
    expect(getArtistUrls).toHaveBeenCalledWith("2");
    expect(outcome).toEqual({
      status: "matched",
      chartmetricArtistId: "2",
      matchMethod: "name_with_platform_links",
      matchConfidence: "high",
      spotifyMonthlyListeners: 3766,
      spotifyFollowers: 1346
    });
  });

  it("does not treat an input Spotify URL as corroboration when the Chartmetric candidate has no matching platform ID", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [{ id: 13176332, name: "TYDEAL", verified: true }],
        retryCount: 0,
        durationMs: 1
      })
    });

    const outcome = await matchChartmetricArtist({
      artistName: "TYDEAL",
      spotifyUrl: "https://open.spotify.com/artist/4r903oqNo1mfW3mIg1TjIk"
    }, client);

    expect(outcome.status).toBe("low_confidence");
    expect(outcome.matchConfidence).toBe("low");
  });

  it("matches with high confidence when a single name candidate's known Spotify ID lines up", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [{ id: 9, name: "Broad Peak", spotifyId: "spotify123" }],
        retryCount: 0,
        durationMs: 1
      })
    });

    const outcome = await matchChartmetricArtist({ ...baseInput, spotifyArtistId: "spotify123" }, client);
    expect(outcome).toEqual({
      status: "matched",
      chartmetricArtistId: "9",
      matchMethod: "name_with_platform_links",
      matchConfidence: "high"
    });
  });

  it("returns low_confidence (medium) for a single name candidate corroborated only by genre/location", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({ data: [{ id: 5, name: "Broad Peak" }], retryCount: 0, durationMs: 1 })
    });

    const outcome = await matchChartmetricArtist({ ...baseInput, genres: ["pop punk"], city: "Lyon" }, client);
    expect(outcome.status).toBe("low_confidence");
    expect(outcome.matchConfidence).toBe("medium");
  });

  it("matches a unique verified exact-name candidate with high confidence when corroborating evidence is present", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [{ id: 13176332, name: "Tuesday Fall", verified: true }],
        retryCount: 0,
        durationMs: 1
      })
    });

    const outcome = await matchChartmetricArtist({
      artistName: "Tuesday Fall",
      spotifyUrl: "https://open.spotify.com/artist/2RO6dHJK11CKcEg1G7XYps",
      genres: ["pop punk"],
      city: "Paris"
    }, client);

    expect(outcome).toEqual({
      status: "matched",
      chartmetricArtistId: "13176332",
      matchMethod: "name_with_genre_location",
      matchConfidence: "high"
    });
  });

  it("returns low_confidence (low) for a single name candidate with zero corroborating evidence", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({ data: [{ id: 5, name: "Broad Peak" }], retryCount: 0, durationMs: 1 })
    });

    const outcome = await matchChartmetricArtist(baseInput, client);
    expect(outcome.status).toBe("low_confidence");
    expect(outcome.matchConfidence).toBe("low");
  });
});
