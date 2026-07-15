import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtistRadarClientError, fetchArtistRadarData } from "@/lib/artistRadarClient";
import type { ArtistRadarRequest } from "@/types/artistRadar";

const REQUEST: ArtistRadarRequest = {
  artistName: "Tuesday Fall",
  genre: "pop punk",
  location: "Bordeaux",
};

function mockFetchOnce(response: { ok: boolean; json: () => Promise<unknown> } | null, throwError = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => (throwError ? Promise.reject(new Error("network down")) : Promise.resolve(response))),
  );
}

describe("fetchArtistRadarData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always requests a same-origin relative path, never localhost or an absolute URL", () => {
    // Source-level check: fetchArtistRadarData must not be able to point at
    // a hardcoded/preview-only host in production — this is the exact class
    // of bug (frontend request URLs) implicated in the production incident.
    const source = readFileSync(
      path.resolve(__dirname, "..", "src/lib/artistRadarClient.ts"),
      "utf-8",
    );
    expect(source).toMatch(/fetch\(\s*"\/api\/artist-radar"/);
    expect(source).not.toMatch(/localhost/i);
    expect(source).not.toMatch(/127\.0\.0\.1/);
    expect(source).not.toMatch(/NEXT_PUBLIC_API_URL|NEXT_PUBLIC_BACKEND_URL/);
  });

  it("resolves with the parsed payload on a successful response", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ artist: { name: "Tuesday Fall" } }) });

    const result = await fetchArtistRadarData(REQUEST);

    expect(result).toEqual({ artist: { name: "Tuesday Fall" } });
  });

  it("throws ArtistRadarClientError with the structured code/message on a { success:false } error response", async () => {
    mockFetchOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { code: "ARTIST_ANALYSIS_FAILED", message: "The artist analysis could not be completed." },
      }),
    });

    await expect(fetchArtistRadarData(REQUEST)).rejects.toMatchObject({
      name: "ArtistRadarClientError",
      message: "The artist analysis could not be completed.",
      code: "ARTIST_ANALYSIS_FAILED",
    });
  });

  it("falls back to a safe default message when the error response isn't the expected shape", async () => {
    mockFetchOnce({ ok: false, json: async () => null });

    await expect(fetchArtistRadarData(REQUEST)).rejects.toBeInstanceOf(ArtistRadarClientError);
  });

  it("throws a clear error (instead of hanging) when the network request itself fails", async () => {
    mockFetchOnce(null, true);

    await expect(fetchArtistRadarData(REQUEST)).rejects.toThrow(ArtistRadarClientError);
  });
});
