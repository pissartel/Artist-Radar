import { describe, expect, it, vi } from "vitest";
import { buildSongkickConcertProvider } from "../../../src/providers/concerts/songkick.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function artistSearchResponse(artists: Array<{ id: number; displayName: string }>) {
  return responseWithJson({ resultsPage: { status: "ok", results: { artist: artists } } });
}

function eventsResponse(events: unknown[]) {
  return responseWithJson({ resultsPage: { status: "ok", results: { event: events } } });
}

const identity = { name: "Paris Peer One" };
const options = { limit: 10 };
const enabledEnv = { SONGKICK_API_KEY: "key" };

describe("SongkickConcertProvider", () => {
  it("returns no events and does not call fetch when SONGKICK_API_KEY is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildSongkickConcertProvider({ env: {}, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves the artist ID then fetches the upcoming calendar", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(artistSearchResponse([{ id: 42, displayName: "Paris Peer One" }]))
      .mockResolvedValueOnce(eventsResponse([
        {
          id: 900,
          displayName: "Paris Peer One at La Maroquinerie",
          type: "Concert",
          status: "ok",
          start: { date: "2026-09-04" },
          venue: { displayName: "La Maroquinerie", lat: 48.8, lng: 2.3, metroArea: { displayName: "Paris", country: { displayName: "France" } } },
          performance: [{ artist: { id: 42, displayName: "Paris Peer One" } }],
          uri: "https://www.songkick.com/concerts/900"
        }
      ]));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "900",
      date: "2026-09-04",
      venue: { name: "La Maroquinerie", city: "Paris", country: "France" },
      lineup: [{ name: "Paris Peer One", externalId: "42" }],
      sources: [{ provider: "songkick", externalId: "900", url: "https://www.songkick.com/concerts/900" }]
    });
  });

  it("memoizes artist ID resolution across past and upcoming calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(artistSearchResponse([{ id: 42, displayName: "Paris Peer One" }]))
      .mockResolvedValueOnce(eventsResponse([]))
      .mockResolvedValueOnce(eventsResponse([]));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    await provider.getUpcomingConcerts(identity, options);
    await provider.getPastConcerts(identity, options);

    // 1 artist search (cached for the 2nd call) + 2 event fetches.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("stops gigography pagination once the date-from cutoff is passed", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(artistSearchResponse([{ id: 42, displayName: "Paris Peer One" }]))
      .mockResolvedValueOnce(eventsResponse([
        { id: 1, start: { date: "2026-06-01" }, venue: { displayName: "Recent Venue" }, status: "ok" },
        { id: 2, start: { date: "2020-01-01" }, venue: { displayName: "Old Venue" }, status: "ok" }
      ]));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getPastConcerts(identity, { limit: 10, dateFrom: "2025-01-01" });

    expect(events).toHaveLength(1);
    expect(events[0]?.venue?.name).toBe("Recent Venue");
    // Only 1 page fetched: the old event stopped further pagination.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("enforces the requested result limit on gigography", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(artistSearchResponse([{ id: 42, displayName: "Paris Peer One" }]))
      .mockResolvedValueOnce(eventsResponse(
        Array.from({ length: 5 }, (_, index) => ({
          id: index,
          start: { date: "2026-01-01" },
          venue: { displayName: `Venue ${index}` },
          status: "ok"
        }))
      ));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getPastConcerts(identity, { limit: 2 });

    expect(events).toHaveLength(2);
  });

  it("returns no events when the artist can't be resolved", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(artistSearchResponse([]));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("handles rejected credentials without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 401 }));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.getUpcomingConcerts(identity, options)).resolves.toEqual([]);
  });

  it("handles a malformed API response (non-ok resultsPage status) without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(responseWithJson({ resultsPage: { status: "error" } }));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.getUpcomingConcerts(identity, options)).resolves.toEqual([]);
  });

  it("drops events without a venue name", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(artistSearchResponse([{ id: 42, displayName: "Paris Peer One" }]))
      .mockResolvedValueOnce(eventsResponse([{ id: 1, start: { date: "2026-09-04" }, status: "ok" }]));
    const provider = buildSongkickConcertProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toEqual([]);
  });
});
