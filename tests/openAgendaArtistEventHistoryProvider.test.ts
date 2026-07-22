import { describe, expect, it, vi } from "vitest";
import { buildOpenAgendaArtistEventHistoryProvider } from "../src/booking/providers/OpenAgendaArtistEventHistoryProvider.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const enabledEnv = {
  ENABLE_OPENAGENDA: "true",
  OPENAGENDA_API_KEY: "test-key",
  OPENAGENDA_AGENDA_UIDS: "123"
};

describe("OpenAgendaArtistEventHistoryProvider", () => {
  it("returns no events and does not call fetch when disabled", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: { ENABLE_OPENAGENDA: "false" }, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns no events and does not call fetch when enabled but missing the API key", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: { ENABLE_OPENAGENDA: "true" }, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("searches by artist name and applies past-date bounds using the configured agenda UID", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ events: [] }));
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    await provider.findPastEvents({
      artistName: "Paris Peer One",
      countries: ["France"],
      dateFrom: "2024-07-01",
      dateTo: "2026-07-01"
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/v2/agendas/123/events");
    expect(requestedUrl.searchParams.get("search")).toBe("Paris Peer One");
    expect(requestedUrl.searchParams.get("timings[gte]")).toBe("2024-07-01T00:00:00.000Z");
    expect(requestedUrl.searchParams.get("timings[lte]")).toBe("2026-07-01T23:59:59.000Z");
  });

  it("normalizes OpenAgenda events into HistoricalArtistEvent records", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson({
        events: [
          {
            uid: 1,
            title: { fr: "Peer One en concert" },
            canonicalUrl: "https://openagenda.com/agendas/123/events/1",
            location: { name: "Le Sample", city: "Paris", country: "France" },
            firstTiming: { begin: "2025-05-10T20:00:00+02:00" }
          }
        ]
      })
    );
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One", countries: ["France"] });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      artistName: "Paris Peer One",
      eventName: "Peer One en concert",
      eventDate: "2025-05-10T20:00:00+02:00",
      venueName: "Le Sample",
      city: "Paris",
      country: "France",
      sourceUrl: "https://openagenda.com/agendas/123/events/1",
      sourceProvider: "openagenda"
    });
  });

  it("handles missing optional fields without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson({
        events: [
          {
            uid: 2,
            url: "https://openagenda.com/agendas/123/events/2",
            location: { name: "Minimal Venue" }
          }
        ]
      })
    );
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      venueName: "Minimal Venue",
      sourceUrl: "https://openagenda.com/agendas/123/events/2",
      city: null,
      country: null,
      eventName: null,
      eventDate: null
    });
  });

  it("rejects records without a venue name or any traceable source URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson({
        events: [
          { uid: 3, canonicalUrl: "https://openagenda.com/agendas/123/events/3" }, // no location/venue name
          { uid: 4, location: { name: "Untraceable Venue" } } // no URL at all
        ]
      })
    );
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    const events = await provider.findPastEvents({ artistName: "Paris Peer One" });

    expect(events).toEqual([]);
  });

  it("memoizes agenda resolution per resolved location across multiple artists", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ agendas: [] }));
    // No configured/seeded UIDs: exercises the discovery path so the test
    // proves discovery only runs once per country, not once per artist.
    const provider = buildOpenAgendaArtistEventHistoryProvider({
      env: { ENABLE_OPENAGENDA: "true", OPENAGENDA_API_KEY: "test-key" },
      fetchImpl,
      seeds: []
    });

    await provider.findPastEvents({ artistName: "Paris Peer One", countries: ["France"] });
    const callsAfterFirstArtist = fetchImpl.mock.calls.length;
    expect(callsAfterFirstArtist).toBeGreaterThan(0);

    await provider.findPastEvents({ artistName: "Paris Peer Two", countries: ["France"] });

    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirstArtist);
  });

  it("rethrows when every agenda request fails so the caller can record a diagnostic", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    const provider = buildOpenAgendaArtistEventHistoryProvider({ env: enabledEnv, fetchImpl });

    await expect(provider.findPastEvents({ artistName: "Paris Peer One" })).rejects.toThrow("network down");
  });
});
