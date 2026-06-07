import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enrichArtistWithMusicBrainz,
  getMusicBrainzUserAgent,
  searchMusicBrainzArtistByName
} from "../src/services/musicBrainzService.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("musicBrainzService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses APP_USER_AGENT when provided", () => {
    expect(
      getMusicBrainzUserAgent({
        APP_USER_AGENT: "ArtistRadar/1.2.3 ( https://example.com )"
      })
    ).toBe("ArtistRadar/1.2.3 ( https://example.com )");
  });

  it("falls back to a safe default User-Agent when APP_USER_AGENT is missing", () => {
    expect(getMusicBrainzUserAgent({})).toBe("ArtistRadar/0.1.0 ( https://github.com/pissartel/Artist-Radar )");
  });

  it("sends User-Agent on search and lookup requests and maps metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWithJson({
          artists: [
            {
              id: "mbid-1",
              name: "blink-182",
              country: "FR",
              area: { name: "France" },
              "begin-area": { name: "Bordeaux" },
              tags: [{ name: "pop punk" }, { name: "punk rock" }],
              score: 98
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          id: "mbid-1",
          name: "blink-182",
          country: "FR",
          area: { name: "France" },
          "begin-area": { name: "Bordeaux" },
          tags: [{ name: "pop punk" }, { name: "punk rock" }]
        })
      );

    const artist = await searchMusicBrainzArtistByName(
      "blink-182",
      { APP_USER_AGENT: "ArtistRadar/1.2.3 ( https://example.com )" },
      fetchImpl
    );

    expect(artist).toMatchObject({
      musicBrainzId: "mbid-1",
      name: "blink-182",
      country: "France",
      area: "France",
      beginArea: "Bordeaux",
      tags: ["pop punk", "punk rock"],
      sourceUrl: "https://musicbrainz.org/artist/mbid-1",
      score: 98
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        "User-Agent": "ArtistRadar/1.2.3 ( https://example.com )"
      }
    });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        "User-Agent": "ArtistRadar/1.2.3 ( https://example.com )"
      }
    });
  });

  it("does not print debug logs when DEBUG_MUSICBRAINZ is false", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_MUSICBRAINZ", "false");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      responseWithJson({ artists: [] })
    );

    await searchMusicBrainzArtistByName("Unknown Artist", { APP_USER_AGENT: "ArtistRadar/1.2.3 ( https://example.com )" }, fetchImpl);
    expect(log).not.toHaveBeenCalled();
  });

  it("prints debug logs when DEBUG_MUSICBRAINZ is true", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_MUSICBRAINZ", "true");
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWithJson({
          artists: [
            {
              id: "mbid-1",
              name: "blink-182",
              country: "FR",
              area: { name: "France" },
              "begin-area": { name: "Bordeaux" },
              tags: [{ name: "pop punk" }],
              score: 98
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          id: "mbid-1",
          name: "blink-182",
          country: "FR",
          area: { name: "France" },
          "begin-area": { name: "Bordeaux" },
          tags: [{ name: "pop punk" }]
        })
      );

    await searchMusicBrainzArtistByName(
      "blink-182",
      { APP_USER_AGENT: "ArtistRadar/1.2.3 ( https://example.com )" },
      fetchImpl
    );

    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain("[musicbrainz]");
  });

  it("keeps enrichment null when MusicBrainz returns no usable result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      responseWithJson({ artists: [] })
    );

    await expect(
      enrichArtistWithMusicBrainz("Unknown Artist", { APP_USER_AGENT: "ArtistRadar/1.2.3 ( https://example.com )" }, fetchImpl)
    ).resolves.toBeNull();
  });
});
