import { describe, expect, it, vi } from "vitest";
import { ChartmetricApiError, ChartmetricClient } from "../src/features/artist-enrichment/chartmetric/chartmetric.client.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
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

describe("ChartmetricClient", () => {
  it("throws an auth error without retrying when the refresh token is missing", async () => {
    const client = new ChartmetricClient({ env: {}, fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(client.getArtistBySpotifyId("abc")).rejects.toMatchObject({ kind: "auth" });
  });

  it("looks up a Spotify artist ID through search results and validates the returned Spotify code", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        obj: {
          artists: [
            { id: 1, name: "Wrong Artist", code2: { spotify: ["other"] } },
            { id: 2, name: "Broad Peak", verified: true, code2: { spotify: ["abc"] } }
          ]
        }
      }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("abc");

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.chartmetric.com/api/search?q=abc&type=artists&limit=10",
      expect.any(Object)
    );
    expect(outcome.data).toEqual({ id: 2, name: "Broad Peak", spotifyId: "abc", verified: true });
  });

  it("validates Spotify codes case-insensitively when looking up a Spotify artist ID", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        obj: {
          artists: [{ id: 2, name: "TYDEAL", code2: { spotify: ["4R903OQNO1MFW3MIG1TJIK"] } }]
        }
      }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("4r903oqNo1mfW3mIg1TjIk");

    expect(outcome.data).toEqual({ id: 2, name: "TYDEAL", spotifyId: "4R903OQNO1MFW3MIG1TJIK" });
  });

  it("returns null when search does not include the requested Spotify code", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ obj: { artists: [{ id: 1, name: "Broad Peak", code2: { spotify: ["other"] } }] } }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("abc");

    expect(outcome.data).toBeNull();
  });

  it("retries once on a 5xx response and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ obj: { artists: [{ id: 1, name: "Broad Peak", code2: { spotify: ["abc"] } }] } }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("abc");
    expect(outcome.data).toEqual({ id: 1, name: "Broad Peak", spotifyId: "abc" });
    expect(outcome.retryCount).toBe(1);
  });

  it("does not retry a 404 (not found)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, 404));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    await expect(client.getArtistBySpotifyId("abc")).rejects.toMatchObject({ kind: "not_found" });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // token + one request, no retry
  });

  it("does not retry a 401 (authentication error)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, 401));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    await expect(client.getArtistBySpotifyId("abc")).rejects.toMatchObject({ kind: "auth" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 429 (rate limited)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse({}, 429));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    await expect(client.getArtistBySpotifyId("abc")).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("classifies a request that never resolves as a timeout, not a generic network error", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(tokenResponse()).mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
        })
    );
    const client = new ChartmetricClient({
      env: { CHARTMETRIC_REFRESH_TOKEN: "refresh-token", CHARTMETRIC_REQUEST_TIMEOUT_MS: "50" },
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    await expect(client.getArtistBySpotifyId("abc")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("reports credits from a response header when present", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ obj: { artists: [{ id: 1, name: "Broad Peak", code2: { spotify: ["abc"] } }] } }, 200, { "x-cm-credits-used": "2" }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("abc");
    expect(outcome.reportedCredits).toBe(2);
  });

  it("parses artist Spotify URLs from the Chartmetric artist URLs endpoint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({
        obj: {
          urls: {
            spotify: [
              "https://open.spotify.com/artist/4r903oqNo1mfW3mIg1TjIk",
              "https://open.spotify.com/artist/4R903OQNO1MFW3MIG1TJIK"
            ]
          },
          spotify_ids: ["6oFkOkumLPxkam6W3qEALC"]
        }
      }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistUrls("13176332");

    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://api.chartmetric.com/api/artist/13176332/urls",
      expect.any(Object)
    );
    expect(outcome.data.spotifyUrls).toEqual(["https://open.spotify.com/artist/4r903oqNo1mfW3mIg1TjIk"]);
    expect(outcome.data.spotifyIds).toEqual(["4r903oqNo1mfW3mIg1TjIk", "6oFkOkumLPxkam6W3qEALC"]);
  });

  it("surfaces ChartmetricApiError as a proper Error subclass", () => {
    const error = new ChartmetricApiError("boom", "server");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("server");
  });
});
