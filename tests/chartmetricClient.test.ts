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

  it("retries once on a 5xx response and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ obj: { id: 1, name: "Broad Peak" } }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("abc");
    expect(outcome.data).toEqual({ id: 1, name: "Broad Peak" });
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
      .mockResolvedValueOnce(jsonResponse({ obj: { id: 1, name: "Broad Peak" } }, 200, { "x-cm-credits-used": "2" }));
    const client = buildClient(fetchImpl as unknown as typeof fetch);

    const outcome = await client.getArtistBySpotifyId("abc");
    expect(outcome.reportedCredits).toBe(2);
  });

  it("surfaces ChartmetricApiError as a proper Error subclass", () => {
    const error = new ChartmetricApiError("boom", "server");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("server");
  });
});
