import { describe, expect, it, vi } from "vitest";
import {
  buildConcerts50BookingSourceProvider,
  buildConcerts50ListingUrl,
  resolveConcerts50GenreSlug
} from "../src/booking/providers/Concerts50BookingSourceProvider.js";
import type { BookingSearchInput } from "../src/booking/types.js";

function baseInput(overrides: Partial<BookingSearchInput> = {}): BookingSearchInput {
  return {
    artist: "Tuesday Fall",
    city: "Paris",
    genre: "pop punk",
    target: null,
    links: [],
    limit: 10,
    similarArtists: [],
    ...overrides
  };
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

function eventDetailHtml(options: {
  name: string;
  startDate?: string;
  performers?: string[];
  venueName?: string;
  city?: string;
  price?: string;
  currency?: string;
  eventStatus?: string;
}): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: options.name,
    description: `${options.name} description`,
    startDate: options.startDate,
    location: options.venueName
      ? {
          "@type": "Place",
          name: options.venueName,
          url: "https://laflechedor.example/venue",
          address: { "@type": "PostalAddress", addressLocality: options.city ?? "Paris" }
        }
      : undefined,
    performer: options.performers?.map((name) => ({ "@type": "MusicGroup", name })),
    offers: options.price
      ? { "@type": "Offer", price: options.price, priceCurrency: options.currency ?? "EUR", url: "https://tickets.example/1" }
      : undefined
  };
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${options.name}</title>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>${options.eventStatus ?? ""}</body>
</html>`;
}

function listingHtml(links: string[]): string {
  const anchors = links.map((url, index) => `<a href="${url}">Event ${index}</a>`).join("\n");
  return `
<!DOCTYPE html>
<html>
<head><title>Punk Concerts in Paris | Music Events, Gigs & Tickets</title></head>
<body>
${anchors}
<a href="https://instagram.com/concerts50">Instagram</a>
</body>
</html>`;
}

describe("resolveConcerts50GenreSlug", () => {
  it("maps known punk/hardcore/metal/rock variants to Concerts50's own genre categories", () => {
    expect(resolveConcerts50GenreSlug("punk")).toBe("punk");
    expect(resolveConcerts50GenreSlug("Pop Punk")).toBe("punk");
    expect(resolveConcerts50GenreSlug("metalcore")).toBe("metal");
    expect(resolveConcerts50GenreSlug("indie rock")).toBe("rock");
    expect(resolveConcerts50GenreSlug("hardcore punk")).toBe("hardcore");
  });

  it("returns null (never a guessed slug) for a genre with no known-compatible Concerts50 category", () => {
    expect(resolveConcerts50GenreSlug("jazz")).toBeNull();
    expect(resolveConcerts50GenreSlug("techno")).toBeNull();
  });
});

describe("buildConcerts50ListingUrl", () => {
  it("builds the documented URL shape from country/city/genre", () => {
    expect(buildConcerts50ListingUrl("https://concerts50.com", "France", "Paris", "punk")).toBe(
      "https://concerts50.com/france/paris/g/punk"
    );
  });

  it("slugifies accents and spaces in city/country names", () => {
    expect(buildConcerts50ListingUrl("https://concerts50.com", "France", "Saint-Étienne", "metal")).toBe(
      "https://concerts50.com/france/saint-etienne/g/metal"
    );
  });
});

describe("buildConcerts50BookingSourceProvider", () => {
  it("is disabled by default and never calls fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildConcerts50BookingSourceProvider({ env: {}, fetchImpl });

    const result = await provider.search({ input: baseInput() });

    expect(result.targets).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toMatch(/disabled/i);
  });

  it("skips without fetching when no city is available", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildConcerts50BookingSourceProvider({ env: { ENABLE_CONCERTS50: "true" }, fetchImpl });

    const result = await provider.search({ input: baseInput({ city: "" }) });

    expect(result.targets).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips without fetching when the genre has no compatible Concerts50 category", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = buildConcerts50BookingSourceProvider({ env: { ENABLE_CONCERTS50: "true" }, fetchImpl });

    const result = await provider.search({ input: baseInput({ genre: "jazz", city: "Lyon" }) });

    expect(result.targets).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.warnings.join(" ")).toMatch(/no compatible Concerts50 category/i);
  });

  it("never creates an event/venue from the listing page itself, and extracts individual dated events from it", async () => {
    const listingUrl = "https://concerts50.com/france/bordeaux-city1/g/punk";
    const eventUrl = "https://concerts50.com/france/bordeaux-city1/e/band-a-band-b";
    const html = listingHtml([eventUrl]);
    const eventHtml = eventDetailHtml({
      name: "Band A + Band B at La Flèche d'Or",
      startDate: "2026-09-12T20:30:00+02:00",
      performers: ["Band A", "Band B"],
      venueName: "La Flèche d'Or",
      price: "12",
      currency: "EUR"
    });

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === listingUrl) return htmlResponse(html);
      if (url === eventUrl) return htmlResponse(eventHtml);
      return htmlResponse("not found", 404);
    });

    const provider = buildConcerts50BookingSourceProvider({ env: { ENABLE_CONCERTS50: "true" }, fetchImpl });
    const result = await provider.search({ input: baseInput({ city: "Bordeaux-City1" }) });

    expect(result.targets).toHaveLength(1);
    const target = result.targets[0];
    expect(target.category).toBe("event");
    expect(target.sourceType).toBe("specialized_scene_agenda");
    expect(target.sourceProvider).toBe("concerts50");
    expect(target.sourceUrl).toBe(eventUrl);
    expect(target.eventDate).toBe("2026-09-12");
    expect(target.venueName).toBe("La Flèche d'Or");
    expect(target.lineup).toEqual(["Band A", "Band B"]);
    // Never derived from the category page's own SEO title.
    expect(target.name).not.toMatch(/Punk Concerts in Paris/i);
    // Provenance: the listing URL and price are preserved as evidence.
    expect(target.evidence.join(" ")).toContain(listingUrl);
    expect(target.evidence.join(" ")).toMatch(/Headliner: Band A/);
    expect(target.evidence.join(" ")).toMatch(/Price: 12 EUR/);
  });

  it("rejects an individual event page without a resolvable event date", async () => {
    const listingUrl = "https://concerts50.com/france/rennes-city2/g/punk";
    const eventUrl = "https://concerts50.com/france/rennes-city2/e/mystery-show";
    const html = listingHtml([eventUrl]);
    const eventHtml = eventDetailHtml({ name: "Mystery show", performers: ["Band A"] });

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === listingUrl) return htmlResponse(html);
      if (url === eventUrl) return htmlResponse(eventHtml);
      return htmlResponse("not found", 404);
    });

    const provider = buildConcerts50BookingSourceProvider({ env: { ENABLE_CONCERTS50: "true" }, fetchImpl });
    const result = await provider.search({ input: baseInput({ city: "Rennes-City2" }) });

    expect(result.targets).toEqual([]);
    expect(result.metadata.rejectedNoDate).toBe(1);
  });

  it("reduces confidence and preserves evidence for a cancelled event rather than dropping it", async () => {
    const listingUrl = "https://concerts50.com/france/lille-city3/g/punk";
    const eventUrl = "https://concerts50.com/france/lille-city3/e/cancelled-show";
    const html = listingHtml([eventUrl]);
    const eventHtml = eventDetailHtml({
      name: "Cancelled Show",
      startDate: "2026-10-01",
      performers: ["Band C"],
      eventStatus: "This show has been cancelled."
    });

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === listingUrl) return htmlResponse(html);
      if (url === eventUrl) return htmlResponse(eventHtml);
      return htmlResponse("not found", 404);
    });

    const provider = buildConcerts50BookingSourceProvider({ env: { ENABLE_CONCERTS50: "true" }, fetchImpl });
    const result = await provider.search({ input: baseInput({ city: "Lille-City3" }) });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].evidence.join(" ")).toMatch(/marks this event as cancelled/i);
    expect(result.targets[0].confidence).toBeLessThan(0.6);
  });

  it("respects CONCERTS50_MAX_PAGES_PER_SEARCH and never fetches more detail pages than the cap", async () => {
    const listingUrl = "https://concerts50.com/france/nantes-city4/g/punk";
    const eventUrls = Array.from({ length: 5 }, (_, index) => `https://concerts50.com/france/nantes-city4/e/event-${index}`);
    const html = listingHtml(eventUrls);

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === listingUrl) return htmlResponse(html);
      if (eventUrls.includes(url)) {
        return htmlResponse(eventDetailHtml({ name: `Event at ${url}`, startDate: "2026-11-01", performers: ["Band D"] }));
      }
      return htmlResponse("not found", 404);
    });

    const provider = buildConcerts50BookingSourceProvider({
      env: { ENABLE_CONCERTS50: "true", CONCERTS50_MAX_PAGES_PER_SEARCH: "2" },
      fetchImpl
    });
    const result = await provider.search({ input: baseInput({ city: "Nantes-City4" }) });

    expect(result.targets).toHaveLength(2);
    // 1 listing fetch + 2 detail-page fetches, never a fetch per event beyond the cap.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("caches the listing and detail pages so a repeated search does not refetch them", async () => {
    const listingUrl = "https://concerts50.com/france/toulouse-city5/g/punk";
    const eventUrl = "https://concerts50.com/france/toulouse-city5/e/band-e";
    const html = listingHtml([eventUrl]);
    const eventHtml = eventDetailHtml({ name: "Band E", startDate: "2026-12-05", performers: ["Band E"] });

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === listingUrl) return htmlResponse(html);
      if (url === eventUrl) return htmlResponse(eventHtml);
      return htmlResponse("not found", 404);
    });

    const provider = buildConcerts50BookingSourceProvider({ env: { ENABLE_CONCERTS50: "true" }, fetchImpl });
    const input = baseInput({ city: "Toulouse-City5" });

    const first = await provider.search({ input });
    expect(first.targets).toHaveLength(1);
    const callsAfterFirstSearch = fetchImpl.mock.calls.length;
    expect(callsAfterFirstSearch).toBe(2);

    const second = await provider.search({ input });
    expect(second.targets).toHaveLength(1);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirstSearch);
  });
});
