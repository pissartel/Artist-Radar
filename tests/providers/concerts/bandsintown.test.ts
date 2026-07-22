import { describe, expect, it, vi } from "vitest";
import { buildBandsintownConcertProvider } from "../../../src/providers/concerts/bandsintown.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const identity = { name: "Paris Peer One" };
const options = { limit: 10 };

describe("BandsintownConcertProvider", () => {
  it("returns no events and does not call fetch when BANDSINTOWN_APP_ID is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildBandsintownConcertProvider({ env: {}, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("always returns [] for getPastConcerts (no reliable historical archive)", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    const events = await provider.getPastConcerts(identity, options);

    expect(events).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes upcoming events into ArtistConcert records", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson([
        {
          id: "1001",
          url: "https://www.bandsintown.com/e/1001",
          datetime: "2026-09-04T19:00:00",
          venue: { name: "La Maroquinerie", city: "Paris", region: "", country: "France", latitude: "48.865", longitude: "2.383" },
          lineup: ["Paris Peer One", "Support Act"],
          offers: [{ type: "Tickets", url: "https://tickets.example/1001", status: "available" }]
        }
      ])
    );
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      externalId: "1001",
      date: "2026-09-04T19:00:00",
      status: "upcoming",
      venue: { name: "La Maroquinerie", city: "Paris", country: "France", latitude: 48.865, longitude: 2.383 },
      lineup: [{ name: "Paris Peer One" }, { name: "Support Act" }],
      sources: [{ provider: "bandsintown", externalId: "1001", url: "https://www.bandsintown.com/e/1001" }]
    });
  });

  it("handles missing optional fields without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson([{ id: "2", datetime: "2026-10-01T20:00:00", venue: { name: "Minimal Venue" } }])
    );
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toHaveLength(1);
    expect(events[0]?.venue).toMatchObject({ name: "Minimal Venue", city: null, region: null, country: null });
  });

  it("treats an artist with no events (HTTP 404) as an empty, non-error result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, options);

    expect(events).toEqual([]);
  });

  it("handles rejected credentials (401/403) without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    await expect(provider.getUpcomingConcerts(identity, options)).resolves.toEqual([]);
  });

  it("handles rate limiting (429) without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    await expect(provider.getUpcomingConcerts(identity, options)).resolves.toEqual([]);
  });

  it("handles a malformed (non-array) response without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ error: "unexpected shape" }));
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    await expect(provider.getUpcomingConcerts(identity, options)).resolves.toEqual([]);
  });

  it("handles a network/timeout error without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    await expect(provider.getUpcomingConcerts(identity, options)).resolves.toEqual([]);
  });

  it("enforces the requested result limit", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseWithJson(
        Array.from({ length: 5 }, (_, index) => ({
          id: String(index),
          datetime: `2026-09-0${index + 1}T20:00:00`,
          venue: { name: `Venue ${index}` }
        }))
      )
    );
    const provider = buildBandsintownConcertProvider({ env: { BANDSINTOWN_APP_ID: "app" }, fetchImpl });

    const events = await provider.getUpcomingConcerts(identity, { limit: 2 });

    expect(events).toHaveLength(2);
  });
});
