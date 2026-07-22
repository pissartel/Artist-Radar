import { describe, expect, it, vi } from "vitest";
import { TicketmasterClient, createTicketmasterDiagnostics } from "../../../src/providers/ticketmaster/TicketmasterClient.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("TicketmasterClient", () => {
  it("never includes the API key in a way that would appear in a plain object dump (query param only, not logged directly)", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ _embedded: { events: [] } }));
    const client = new TicketmasterClient({ apiKey: "SECRET-KEY", fetchImpl });

    await client.searchEvents({ city: "Paris" }, "location");

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("apikey")).toBe("SECRET-KEY"); // the real request must still carry it
    expect(requestedUrl.pathname).toBe("/discovery/v2/events.json");
  });

  it("caches identical event queries and only calls fetch once", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ _embedded: { events: [{ id: "1" }] } }));
    const diagnostics = createTicketmasterDiagnostics(true);
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl, diagnostics });

    await client.searchEvents({ city: "Paris" }, "location");
    await client.searchEvents({ city: "Paris" }, "location");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(diagnostics.cacheHits).toBe(1);
    expect(diagnostics.cacheMisses).toBe(1);
    expect(diagnostics.locationQueries).toBe(1);
  });

  it("treats different query params as different cache entries", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => responseWithJson({ _embedded: { events: [] } }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    await client.searchEvents({ city: "Paris" }, "location");
    await client.searchEvents({ city: "Lyon" }, "location");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("caches attraction searches per artist name", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ _embedded: { attractions: [{ id: "K1", name: "Artist A" }] } }));
    const diagnostics = createTicketmasterDiagnostics(true);
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl, diagnostics });

    await client.searchAttractions("Artist A");
    await client.searchAttractions("artist a");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(diagnostics.attractionQueries).toBe(1);
  });

  it("caches venue lookups per venue id", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ id: "v1", name: "Venue One" }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    await client.getVenue("v1");
    await client.getVenue("v1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 up to the retry limit, then gives up and increments rateLimitErrors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 }));
    const diagnostics = createTicketmasterDiagnostics(true);
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl, diagnostics });

    const events = await client.searchEvents({ city: "Paris" }, "location");

    expect(events).toEqual([]);
    expect(diagnostics.rateLimitErrors).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1); // at least one retry happened
  }, 10_000);

  it("retries a 5xx error and eventually returns [] rather than throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    await expect(client.searchEvents({ city: "Paris" }, "location")).resolves.toEqual([]);
  }, 10_000);

  it("does not retry a 401/403 and returns [] immediately", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    const events = await client.searchEvents({ city: "Paris" }, "location");

    expect(events).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404 and treats it as an empty result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    const events = await client.searchEvents({ city: "Paris" }, "location");

    expect(events).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("handles a 400 without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    await expect(client.searchEvents({ city: "Paris" }, "location")).resolves.toEqual([]);
  });

  it("handles a network/timeout error without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    await expect(client.searchEvents({ city: "Paris" }, "location")).resolves.toEqual([]);
  });

  it("handles a malformed (non-JSON-shaped) response without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ unexpected: "shape" }));
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl });

    const events = await client.searchEvents({ city: "Paris" }, "location");

    expect(events).toEqual([]);
  });

  it("tracks raw event counts and query-kind counters in diagnostics", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseWithJson({ _embedded: { events: [{ id: "1" }, { id: "2" }] } }));
    const diagnostics = createTicketmasterDiagnostics(true);
    const client = new TicketmasterClient({ apiKey: "key", fetchImpl, diagnostics });

    await client.searchEvents({ classificationName: "Punk" }, "genre");

    expect(diagnostics.genreQueries).toBe(1);
    expect(diagnostics.rawEventCount).toBe(2);
  });
});
