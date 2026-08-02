import { describe, expect, it, vi } from "vitest";
import { ChartmetricClient } from "../src/features/artist-enrichment/chartmetric/chartmetric.client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function tokenResponse(): Response {
  return jsonResponse({ token: "access-token", expires_in: 3600 });
}

function buildClient(fetchImpl: typeof fetch): ChartmetricClient {
  return new ChartmetricClient({
    env: { CHARTMETRIC_REFRESH_TOKEN: "refresh-token", CHARTMETRIC_REQUEST_TIMEOUT_MS: "500" },
    fetchImpl
  });
}

describe("ChartmetricClient.getArtistScoreAndSocial", () => {
  it("parses known field aliases and leaves unreported fields undefined (never 0)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ obj: { cm_artist_score: 72, ins_followers: 5000 } }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistScoreAndSocial("1");
    expect(outcome.data.chartmetricArtistScore).toBe(72);
    expect(outcome.data.instagramFollowers).toBe(5000);
    expect(outcome.data.tiktokFollowers).toBeUndefined();
    expect(outcome.data.youtubeSubscribers).toBeUndefined();
  });

  it("returns an empty object rather than throwing on a malformed payload shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({ obj: null }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistScoreAndSocial("1");
    expect(outcome.data).toEqual({});
  });
});

describe("ChartmetricClient.getArtistPlaylistReach", () => {
  it("parses playlist reach fields when present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ obj: { playlist_reach_score: 41, num_playlists: 12 } }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistPlaylistReach("1");
    expect(outcome.data.playlistReachScore).toBe(41);
    expect(outcome.data.totalCurrentPlaylists).toBe(12);
  });
});

describe("ChartmetricClient.getSimilarArtists", () => {
  it("parses a list of neighbouring artists with optional scores", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({ obj: [{ id: 2, name: "Neighbour One", score: 0.87 }, { id: 3, name: "Neighbour Two" }] })
      );
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getSimilarArtists("1");
    expect(outcome.data).toEqual([
      { id: 2, name: "Neighbour One", score: 0.87 },
      { id: 3, name: "Neighbour Two" }
    ]);
  });

  it("returns an empty array when the response has no usable list", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({ obj: {} }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getSimilarArtists("1");
    expect(outcome.data).toEqual([]);
  });
});
