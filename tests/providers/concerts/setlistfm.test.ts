import { describe, expect, it, vi } from "vitest";
import { buildSetlistFmConcertProvider } from "../../../src/providers/concerts/setlistfm.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const identity = { name: "Paris Peer One" };
const options = { limit: 10 };
const enabledEnv = { SETLISTFM_API_KEY: "key" };

describe("SetlistFmConcertProvider", () => {
  it("always returns [] for getUpcomingConcerts (past-only by design)", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns no events and does not call fetch when SETLISTFM_API_KEY is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildSetlistFmConcertProvider({ env: {}, fetchImpl });

    const events = await provider.getPastConcerts(identity, options);

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves by MusicBrainz ID when available, converting the dd-MM-yyyy date", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson({
        setlist: [
          {
            id: "abc123",
            eventDate: "12-03-2026",
            artist: { mbid: "mbid-1", name: "Paris Peer One" },
            venue: { name: "Supersonic", city: { name: "Paris", state: "Île-de-France", country: { name: "France" } } },
            tour: { name: "Spring Tour" },
            url: "https://www.setlist.fm/setlist/abc123.html"
          }
        ]
      })
    );
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getPastConcerts({ ...identity, musicBrainzId: "mbid-1" }, options);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "abc123",
      date: "2026-03-12",
      status: "past",
      venue: { name: "Supersonic", city: "Paris", region: "Île-de-France", country: "France" },
      tourName: "Spring Tour",
      sources: [{ provider: "setlistfm", externalId: "abc123", url: "https://www.setlist.fm/setlist/abc123.html" }]
    });
    const requestedUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/artist/mbid-1/setlists");
  });

  it("falls back to a name search when no MusicBrainz ID is available, and rejects a non-matching artist name", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson({
        setlist: [
          {
            id: "wrong-artist",
            eventDate: "01-01-2026",
            artist: { name: "Totally Different Artist" },
            venue: { name: "Some Venue", city: { name: "Lyon", country: { name: "France" } } }
          },
          {
            id: "right-artist",
            eventDate: "02-01-2026",
            artist: { name: "Paris Peer One" },
            venue: { name: "Le Sample", city: { name: "Paris", country: { name: "France" } } }
          }
        ]
      })
    );
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getPastConcerts(identity, options);

    expect(events).toHaveLength(1);
    expect(events[0]?.externalId).toBe("right-artist");
    const requestedUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/search/setlists");
    expect(requestedUrl).toContain("artistName=");
  });

  it("stops pagination once the date-from cutoff is passed", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      responseWithJson({
        setlist: [
          { id: "1", eventDate: "01-06-2026", artist: { mbid: "mbid-1" }, venue: { name: "Recent Venue", city: { name: "Paris" } } },
          { id: "2", eventDate: "01-01-2020", artist: { mbid: "mbid-1" }, venue: { name: "Old Venue", city: { name: "Paris" } } }
        ]
      })
    );
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getPastConcerts({ ...identity, musicBrainzId: "mbid-1" }, { limit: 10, dateFrom: "2025-01-01" });

    expect(events).toHaveLength(1);
    expect(events[0]?.venue?.name).toBe("Recent Venue");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats HTTP 404 (no setlists found) as an empty, non-error result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.getPastConcerts({ ...identity, musicBrainzId: "mbid-1" }, options)).resolves.toEqual([]);
  });

  it("handles rejected credentials and rate limiting without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.getPastConcerts({ ...identity, musicBrainzId: "mbid-1" }, options)).resolves.toEqual([]);
  });

  it("handles a malformed response (missing setlist array) without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ unexpected: true }));
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.getPastConcerts({ ...identity, musicBrainzId: "mbid-1" }, options)).resolves.toEqual([]);
  });

  it("drops setlists without a venue name", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson({ setlist: [{ id: "1", eventDate: "01-01-2026", artist: { mbid: "mbid-1" } }] })
    );
    const provider = buildSetlistFmConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getPastConcerts({ ...identity, musicBrainzId: "mbid-1" }, options);

    expect(events).toEqual([]);
  });
});
