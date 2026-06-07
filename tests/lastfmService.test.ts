import { afterEach, describe, expect, it, vi } from "vitest";
import { getLastFmSimilarArtists } from "../src/services/lastfmService.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("lastfmService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns [] when LASTFM_API_KEY is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const results = await getLastFmSimilarArtists(
      "Tuesday Fall",
      5,
      {},
      fetchImpl
    );

    expect(results).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not print debug logs when DEBUG_LASTFM is false", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_LASTFM", "false");
    await getLastFmSimilarArtists("Tuesday Fall", 5, { LASTFM_API_KEY: "key" }, vi.fn<typeof fetch>());
    expect(log).not.toHaveBeenCalled();
  });

  it("prints debug logs when DEBUG_LASTFM is true", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_LASTFM", "true");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      responseWithJson({
        similarartists: {
          artist: [{ name: "blink-182", url: "https://www.last.fm/music/blink-182", match: "0.92" }]
        }
      })
    );

    await getLastFmSimilarArtists("Tuesday Fall", 5, { LASTFM_API_KEY: "key" }, fetchImpl);
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain("[lastfm]");
  });

  it("maps artist.getSimilar results into normalized candidates", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      responseWithJson({
        similarartists: {
          artist: [
            { name: "blink-182", url: "https://www.last.fm/music/blink-182", match: "0.92" },
            { name: "Paramore", url: "https://www.last.fm/music/Paramore", match: 0.87 }
          ]
        }
      })
    );

    const results = await getLastFmSimilarArtists(
      "Tuesday Fall",
      5,
      { LASTFM_API_KEY: "key" },
      fetchImpl
    );

    expect(results).toEqual([
      {
        name: "blink-182",
        url: "https://www.last.fm/music/blink-182",
        match: 0.92
      },
      {
        name: "Paramore",
        url: "https://www.last.fm/music/Paramore",
        match: 0.87
      }
    ]);
  });
});
