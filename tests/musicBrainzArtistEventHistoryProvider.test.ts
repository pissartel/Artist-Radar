import { describe, expect, it, vi } from "vitest";
import { buildMusicBrainzArtistEventHistoryProvider } from "../src/booking/providers/MusicBrainzArtistEventHistoryProvider.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const enabledEnv = { ENABLE_MUSICBRAINZ_EVENT_HISTORY: "true" };

describe("MusicBrainzArtistEventHistoryProvider", () => {
  it("returns no events and does not call fetch when disabled (default)", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: {}, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves the artist MBID then browses events with place relations", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWithJson({
          artists: [{ id: "mbid-1", name: "Paris Peer One", score: 100, tags: [] }]
        })
      )
      .mockResolvedValueOnce(
        // searchMusicBrainzArtistByName follows up a search match with a
        // lookup call (for tags) before returning the resolved MBID.
        responseWithJson({ id: "mbid-1", name: "Paris Peer One", tags: [] })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          events: [
            {
              id: "event-mbid-1",
              name: "Peer One Release Show",
              "life-span": { begin: "2025-05-10" },
              relations: [
                { "target-type": "place", place: { name: "Le Sample", area: { name: "Paris" } } }
              ]
            }
          ]
        })
      );
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      artistName: "Paris Peer One",
      eventName: "Peer One Release Show",
      eventDate: "2025-05-10",
      venueName: "Le Sample",
      city: "Paris",
      sourceUrl: "https://musicbrainz.org/event/event-mbid-1",
      sourceProvider: "musicbrainz"
    });

    const eventBrowseUrl = new URL(String(fetchImpl.mock.calls[2]?.[0]));
    expect(eventBrowseUrl.pathname).toBe("/ws/2/event");
    expect(eventBrowseUrl.searchParams.get("artist")).toBe("mbid-1");
    expect(eventBrowseUrl.searchParams.get("inc")).toBe("place-rels");
  });

  it("uses an already-resolved MusicBrainz external ID without an extra name search", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(responseWithJson({ events: [] }));
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({
      artistName: "Paris Peer One",
      artistExternalIds: { musicbrainz: "mbid-known" }
    });

    expect(events).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const eventBrowseUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(eventBrowseUrl.searchParams.get("artist")).toBe("mbid-known");
  });

  it("returns no events when the artist can't be matched in MusicBrainz", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(responseWithJson({ artists: [] }));
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Totally Unknown Artist" });

    expect(events).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("drops events without a place/venue relation or without an event MBID", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ artists: [{ id: "mbid-1", name: "Paris Peer One", score: 100 }] }))
      .mockResolvedValueOnce(responseWithJson({ id: "mbid-1", name: "Paris Peer One" }))
      .mockResolvedValueOnce(
        responseWithJson({
          events: [
            { id: "event-no-venue", name: "No venue evidence", "life-span": { begin: "2025-01-01" }, relations: [] },
            { name: "No event id", relations: [{ "target-type": "place", place: { name: "Le Sample" } }] }
          ]
        })
      );
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toEqual([]);
  });

  it("caches MBID resolution across repeated calls for the same artist", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ artists: [{ id: "mbid-1", name: "Paris Peer One", score: 100 }] }))
      .mockResolvedValueOnce(responseWithJson({ id: "mbid-1", name: "Paris Peer One" }))
      .mockResolvedValueOnce(responseWithJson({ events: [] }))
      .mockResolvedValueOnce(responseWithJson({ events: [] }));
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    await provider.findPastEvents({ artistName: "Paris Peer One" });
    await provider.findPastEvents({ artistName: "Paris Peer One" });

    // 1 MBID search + 1 lookup (cached for the 2nd call) + 2 event browse calls.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("throws on an HTTP failure browsing events so the caller can record a diagnostic", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseWithJson({ artists: [{ id: "mbid-1", name: "Paris Peer One", score: 100 }] }))
      .mockResolvedValueOnce(responseWithJson({ id: "mbid-1", name: "Paris Peer One" }))
      .mockResolvedValueOnce(responseWithJson({ error: "rate limited" }, 503));
    const provider = buildMusicBrainzArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.findPastEvents({ artistName: "Paris Peer One" })).rejects.toThrow(/503/);
  });
});
