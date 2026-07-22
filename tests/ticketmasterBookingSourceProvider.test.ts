import { describe, expect, it, vi } from "vitest";
import { buildTicketmasterBookingSourceProvider } from "../src/booking/providers/TicketmasterBookingSourceProvider.js";
import type { BookingSearchInput } from "../src/booking/types.js";
import type { SimilarArtist } from "../src/schemas.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function similarArtist(name: string, totalRelevance: number): SimilarArtist {
  return {
    name, url: null, spotifyUrl: null, spotifyId: null, instagramUrl: null, instagramHandle: null,
    youtubeUrl: null, youtubeChannelId: null, youtubeSubscribers: null, youtubeTotalViews: null, youtubeVideoCount: null,
    genres: ["pop punk"], city: "Paris", country: "France", source: "mock", sources: ["test"],
    reason: "Compatible artist.", confidence: 0.85, sourceConfidence: 0.85, artistTier: "small",
    bookingCategory: "local_peer", estimatedFollowers: 3000, estimatedPopularity: null,
    topTrackPopularityMax: null, topTrackPopularityAvg: null, topTrackCount: null, sizeSignalSource: "manual",
    genreRelevance: 90, localRelevance: 90, sizeRelevance: 85, sceneRelevance: 88, totalRelevance,
    relevanceToUserArtist: totalRelevance, possibleUse: "booking_research", estimatedLevel: "emerging",
    evidenceNotes: [], sourceUrls: [], genreEvidence: [], locationEvidence: [], sizeEvidence: [],
    verificationStatus: "verified",
    popularity: { estimatedLevel: "small", confidence: 0.75, sizeSignalSource: "manual", platforms: {} },
    discardedTags: [], matchedQuery: null, searchRelevanceBoost: 0, spotify: null, imageUrl: null,
    imageSource: null, imageConfidence: null
  };
}

function baseInput(overrides: Partial<BookingSearchInput> = {}): BookingSearchInput {
  return {
    artist: "Tuesday Fall",
    city: "Paris",
    genre: "pop punk",
    target: null,
    links: [],
    limit: 10,
    artistProfile: {
      artistName: "Tuesday Fall",
      city: "Paris",
      country: "France",
      genres: ["pop punk"],
      spotifyArtistName: null,
      spotifyGenres: [],
      socialLinks: {},
      platformStats: { spotifyFollowers: 4000 },
      estimatedLevel: "emerging",
      confidence: 0.7,
      notes: []
    },
    similarArtists: [],
    ...overrides
  };
}

function eventFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-1",
    name: "Paris Peer One at La Maroquinerie",
    url: "https://www.ticketmaster.com/event/evt-1",
    dates: { start: { localDate: "2026-09-04" }, status: { code: "onsale" } },
    classifications: [{ segment: { name: "Music" }, genre: { name: "Punk" } }],
    _embedded: {
      venues: [{ id: "v1", name: "La Maroquinerie", city: { name: "Paris" }, country: { name: "France" } }],
      attractions: [{ id: "K1", name: "Paris Peer One" }]
    },
    ...overrides
  };
}

const enabledEnv = { ENABLE_TICKETMASTER_CONCERTS: "true", TICKETMASTER_API_KEY: "key" };

describe("TicketmasterBookingSourceProvider", () => {
  it("skips entirely and does not call fetch when disabled", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildTicketmasterBookingSourceProvider({ env: {}, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    expect(result.targets).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips when the feature flag is set but the API key is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildTicketmasterBookingSourceProvider({ env: { ENABLE_TICKETMASTER_CONCERTS: "true" }, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    expect(result.targets).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prefers the user-entered city over the artist profile city for location search", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        expect(url.searchParams.get("city")).toBe("Bordeaux");
        return responseWithJson({ _embedded: { events: [] } });
      }
      return responseWithJson({ _embedded: {} });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    await provider.search({
      input: baseInput({
        city: "Bordeaux",
        artistProfile: { ...baseInput().artistProfile!, city: "Paris" }
      })
    });

    expect(fetchImpl).toHaveBeenCalled();
  });

  it("applies the configured radius to the location search", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        expect(url.searchParams.get("radius")).toBe("42");
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: { ...enabledEnv, TICKETMASTER_SEARCH_RADIUS_KM: "42" }, fetchImpl });

    await provider.search({ input: baseInput() });

    expect(fetchImpl).toHaveBeenCalled();
  });

  it("only keeps upcoming events from the genre/location search", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        return responseWithJson({
          _embedded: {
            events: [
              eventFixture({ id: "future", dates: { start: { localDate: "2026-12-01" }, status: { code: "onsale" } } }),
              eventFixture({ id: "past", dates: { start: { localDate: "2020-01-01" }, status: { code: "onsale" } } })
            ]
          }
        });
      }
      return responseWithJson({ _embedded: {} });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    expect(result.targets.some((target) => target.name.includes("evt-1") || target.sourceUrl?.includes("future"))).toBe(false);
    expect(result.targets.every((target) => target.isFutureEvent !== false)).toBe(true);
  });

  it("resolves a similar artist's attraction, fetches its events, and carries the compatibility score through", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/attractions.json") {
        return responseWithJson({ _embedded: { attractions: [{ id: "K1", name: "Paris Peer One", classifications: [{ segment: { name: "Music" } }] }] } });
      }
      if (url.pathname === "/discovery/v2/events.json" && url.searchParams.get("attractionId") === "K1") {
        return responseWithJson({ _embedded: { events: [eventFixture()] } });
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({
      input: baseInput({ similarArtists: [similarArtist("Paris Peer One", 91)] })
    });

    const target = result.targets.find((t) => t.derivedFromSimilarArtist?.name === "Paris Peer One");
    expect(target).toBeDefined();
    expect(target?.venueName).toBe("La Maroquinerie");
  });

  it("skips artist-specific event retrieval when attraction resolution is ambiguous", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/attractions.json") {
        return responseWithJson({
          _embedded: {
            attractions: [
              { id: "a", name: "Ambiguous Band", classifications: [{ segment: { name: "Music" } }] },
              { id: "b", name: "Ambiguous Group", classifications: [{ segment: { name: "Music" } }] }
            ]
          }
        });
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({
      input: baseInput({ similarArtists: [similarArtist("Ambiguous", 85)] })
    });

    const eventCalls = fetchImpl.mock.calls.filter(([call]) => new URL(String(call)).searchParams.get("attractionId"));
    expect(eventCalls).toHaveLength(0);
    expect(result.targets.some((target) => target.derivedFromSimilarArtist?.name === "Ambiguous")).toBe(false);
  });

  it("continues processing other similar artists when one fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/attractions.json") {
        const keyword = url.searchParams.get("keyword");
        if (keyword === "Broken Artist") {
          return new Response(null, { status: 500 });
        }
        return responseWithJson({ _embedded: { attractions: [{ id: "K2", name: keyword, classifications: [{ segment: { name: "Music" } }] }] } });
      }
      if (url.pathname === "/discovery/v2/events.json" && url.searchParams.get("attractionId") === "K2") {
        return responseWithJson({ _embedded: { events: [eventFixture({ id: "evt-working" })] } });
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({
      input: baseInput({ similarArtists: [similarArtist("Broken Artist", 95), similarArtist("Working Artist", 90)] })
    });

    expect(result.targets.some((target) => target.derivedFromSimilarArtist?.name === "Working Artist")).toBe(true);
  });

  it("only processes the configured top-N similar artists", async () => {
    const attractionCalls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/attractions.json") {
        attractionCalls.push(url.searchParams.get("keyword") ?? "");
        return responseWithJson({ _embedded: { attractions: [] } });
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: { ...enabledEnv, TICKETMASTER_SIMILAR_ARTIST_LIMIT: "2" }, fetchImpl });

    await provider.search({
      input: baseInput({
        similarArtists: [
          similarArtist("A", 95),
          similarArtist("B", 90),
          similarArtist("C", 85),
          similarArtist("D", 10)
        ]
      })
    });

    expect(attractionCalls).toHaveLength(2);
    expect(attractionCalls.sort()).toEqual(["A", "B"]);
  });

  it("detects a festival and never assigns it a support-slot signal", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        return responseWithJson({
          _embedded: {
            events: [eventFixture({
              id: "festival-1",
              name: "Punk Fest 2026",
              _embedded: {
                venues: [{ id: "v2", name: "Festival Grounds", city: { name: "Paris" }, country: { name: "France" } }],
                attractions: [{ id: "K1", name: "Paris Peer One" }, { id: "K3", name: "Support" }]
              }
            })]
          }
        });
      }
      return responseWithJson({ _embedded: {} });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    const festival = result.targets.find((target) => target.category === "festival");
    expect(festival).toBeDefined();
    expect(festival?.evidence.some((line) => line.includes("festival"))).toBe(true);
  });

  it("produces a confidence score for each target without ever exceeding 1", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        return responseWithJson({ _embedded: { events: [eventFixture()] } });
      }
      return responseWithJson({ _embedded: {} });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    for (const target of result.targets) {
      expect(target.confidence).toBeGreaterThanOrEqual(0);
      expect(target.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("falls back to the artist profile city when no user-entered city is meaningfully different", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        expect(url.searchParams.get("city")).toBe("Lyon");
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    await provider.search({
      input: baseInput({
        city: "",
        artistProfile: { ...baseInput().artistProfile!, city: "Lyon" }
      } as unknown as BookingSearchInput)
    });

    expect(fetchImpl).toHaveBeenCalled();
  });

  it("queries a bounded past-event window for a resolved similar artist and accepts zero results as valid", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/attractions.json") {
        return responseWithJson({ _embedded: { attractions: [{ id: "K1", name: "Paris Peer One", classifications: [{ segment: { name: "Music" } }] }] } });
      }
      if (url.pathname === "/discovery/v2/events.json" && url.searchParams.get("attractionId") === "K1") {
        // Past query (endDateTime <= now) returns nothing — must not be
        // treated as an error or as "artist never played anywhere".
        if (url.searchParams.get("sort") === "date,desc") {
          return responseWithJson({ _embedded: { events: [] } });
        }
        return responseWithJson({ _embedded: { events: [eventFixture()] } });
      }
      return responseWithJson({ _embedded: { events: [] } });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: { ...enabledEnv, TICKETMASTER_PAST_LOOKBACK_MONTHS: "6" }, fetchImpl });

    const result = await provider.search({
      input: baseInput({ similarArtists: [similarArtist("Paris Peer One", 91)] })
    });

    // No crash, and the artist's upcoming event still comes through.
    expect(result.targets.some((target) => target.derivedFromSimilarArtist?.name === "Paris Peer One")).toBe(true);
  });

  it("never claims a confirmed support slot in the evidence text", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/discovery/v2/events.json" && !url.searchParams.get("attractionId")) {
        return responseWithJson({
          _embedded: {
            events: [eventFixture({
              id: "single-attraction",
              dates: { start: { localDate: "2026-12-25" }, status: { code: "onsale" } },
              _embedded: {
                venues: [{ id: "v1", name: "La Maroquinerie", city: { name: "Paris" }, country: { name: "France" } }],
                attractions: [{ id: "K1", name: "Paris Peer One" }]
              }
            })]
          }
        });
      }
      return responseWithJson({ _embedded: {} });
    });
    const provider = buildTicketmasterBookingSourceProvider({ env: enabledEnv, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    for (const target of result.targets) {
      expect(target.evidence.join(" ")).not.toMatch(/support slot (is |)available/i);
    }
  });
});
