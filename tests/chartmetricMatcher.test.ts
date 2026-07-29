import { describe, expect, it, vi } from "vitest";
import { matchChartmetricArtist } from "../src/features/artist-enrichment/chartmetric/chartmetric.matcher.js";
import type { ChartmetricClient } from "../src/features/artist-enrichment/chartmetric/chartmetric.client.js";
import type { ArtistEnrichmentInput } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

function fakeClient(overrides: Partial<ChartmetricClient> = {}): ChartmetricClient {
  return {
    getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 1 }),
    searchArtistsByName: vi.fn().mockResolvedValue({ data: [], retryCount: 0, durationMs: 1 }),
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

  it("returns low_confidence (low) for a single name candidate with zero corroborating evidence", async () => {
    const client = fakeClient({
      searchArtistsByName: vi.fn().mockResolvedValue({ data: [{ id: 5, name: "Broad Peak" }], retryCount: 0, durationMs: 1 })
    });

    const outcome = await matchChartmetricArtist(baseInput, client);
    expect(outcome.status).toBe("low_confidence");
    expect(outcome.matchConfidence).toBe("low");
  });
});
