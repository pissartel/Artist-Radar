import { describe, expect, it } from "vitest";
import { buildWebSearchBookingSourceProvider } from "../src/booking/providers/WebSearchBookingSourceProvider.js";
import type { WebSearchProvider } from "../src/providers/web/WebSearchProvider.js";
import type { WebExtractProvider, WebExtractResult } from "../src/providers/web/WebExtractProvider.js";
import type { BookingSearchInput } from "../src/booking/types.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 10
};

const AGENDA_URL = "https://quai-m.fr/agenda";

const AGENDA_HTML = `<!DOCTYPE html>
<html>
<head><title>Agenda | Quai M</title></head>
<body>
<header><img class="logo" src="/logo.png" alt="Quai M"></header>
<main>
  <h1>Agenda</h1>
  <a href="https://quai-m.fr/event/band-a">Band A</a>
  <a href="https://quai-m.fr/event/band-b">Band B</a>
  <div class="event-card"><time datetime="2026-09-12">12 septembre 2026</time></div>
  <div class="event-card"><time datetime="2026-10-03">3 octobre 2026</time></div>
  <div class="event-card"><time datetime="2026-11-20">20 novembre 2026</time></div>
</main>
<footer><address>94 Boulevard du Maréchal Leclerc, 85000 La Roche-sur-Yon</address></footer>
</body>
</html>`;

function eventHtml(name: string, date: string): string {
  return `<!DOCTYPE html><html><head><title>${name} at Quai M</title></head><body>
<script type="application/ld+json">${JSON.stringify({
    "@type": "MusicEvent",
    name: `${name} live`,
    startDate: date,
    performer: [{ name }]
  })}</script>
</body></html>`;
}

function buildSearchProvider(url: string): WebSearchProvider {
  return {
    providerName: "test-search",
    async search() {
      return [{ title: "Quai M", url, snippet: null, sourceProvider: "test-search", confidence: 0.8, links: [] }];
    }
  };
}

describe("WebSearchBookingSourceProvider — venue identity extraction (quai-m.fr/agenda regression)", () => {
  it("emits a venue opportunity named after the real venue, never the generic page title, with no leaked date", async () => {
    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        if (url !== AGENDA_URL) return null;
        return { url, title: "Agenda", text: null, markdown: null, html: AGENDA_HTML, links: [], sourceProvider: "test-extract", statusCode: 200 };
      }
    };

    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider(AGENDA_URL),
      webExtractProvider: extractProvider,
      maxExtractPages: 1
    });

    const result = await provider.search({ input, maxResults: 10 });
    const venueTarget = result.targets.find((t) => t.sourceUrl === AGENDA_URL && t.venueName === "Quai M");

    expect(venueTarget).toBeDefined();
    expect(venueTarget!.name).toBe("Quai M");
    expect(venueTarget!.category).toBe("venue");
    expect(venueTarget!.eventDate).toBeNull();
    expect(venueTarget!.address).toBe("94 Boulevard du Maréchal Leclerc, 85000 La Roche-sur-Yon");
    expect(venueTarget!.imageSource).toBe("header_logo");
  });

  it("also emits one opportunity per individual event-detail link found on the listing page (Output B)", async () => {
    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        if (url === AGENDA_URL) {
          return {
            url,
            title: "Agenda",
            text: null,
            markdown: null,
            html: AGENDA_HTML,
            links: ["https://quai-m.fr/event/band-a", "https://quai-m.fr/event/band-b"],
            sourceProvider: "test-extract",
            statusCode: 200
          };
        }
        if (url === "https://quai-m.fr/event/band-a") {
          return { url, title: "Band A", text: null, markdown: null, html: eventHtml("Band A", "2026-09-12"), links: [], sourceProvider: "test-extract", statusCode: 200 };
        }
        if (url === "https://quai-m.fr/event/band-b") {
          return { url, title: "Band B", text: null, markdown: null, html: eventHtml("Band B", "2026-10-03"), links: [], sourceProvider: "test-extract", statusCode: 200 };
        }
        return null;
      }
    };

    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider(AGENDA_URL),
      webExtractProvider: extractProvider,
      maxExtractPages: 1
    });

    const result = await provider.search({ input, maxResults: 10 });
    const eventTargets = result.targets.filter((t) => t.category === "event" && t.venueName === "Quai M");

    expect(eventTargets).toHaveLength(2);
    expect(eventTargets.map((t) => t.eventDate).sort()).toEqual(["2026-09-12", "2026-10-03"]);
    expect(eventTargets.every((t) => t.sourceUrl !== AGENDA_URL)).toBe(true);
  });

  it("does not emit an event opportunity for a detail link that yields no resolvable date", async () => {
    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        if (url === AGENDA_URL) {
          return {
            url,
            title: "Agenda",
            text: null,
            markdown: null,
            html: AGENDA_HTML,
            links: ["https://quai-m.fr/event/band-a"],
            sourceProvider: "test-extract",
            statusCode: 200
          };
        }
        if (url === "https://quai-m.fr/event/band-a") {
          return { url, title: "About Band A", text: null, markdown: null, html: `<html><head><title>About</title></head><body>No date here.</body></html>`, links: [], sourceProvider: "test-extract", statusCode: 200 };
        }
        return null;
      }
    };

    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider(AGENDA_URL),
      webExtractProvider: extractProvider,
      maxExtractPages: 1
    });

    const result = await provider.search({ input, maxResults: 10 });
    expect(result.targets.some((t) => t.sourceUrl === "https://quai-m.fr/event/band-a")).toBe(false);
  });

  it("respects maxEventDetailPages", async () => {
    const allLinks = Array.from({ length: 10 }, (_, i) => `https://quai-m.fr/event/band-${i}`);
    const extractedDetailUrls: string[] = [];
    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        if (url === AGENDA_URL) {
          return { url, title: "Agenda", text: null, markdown: null, html: AGENDA_HTML, links: allLinks, sourceProvider: "test-extract", statusCode: 200 };
        }
        extractedDetailUrls.push(url);
        return { url, title: "Band", text: null, markdown: null, html: eventHtml("Band", "2026-09-12"), links: [], sourceProvider: "test-extract", statusCode: 200 };
      }
    };

    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider(AGENDA_URL),
      webExtractProvider: extractProvider,
      maxExtractPages: 1,
      maxEventDetailPages: 3
    });

    await provider.search({ input, maxResults: 10 });
    expect(extractedDetailUrls).toHaveLength(3);
  });

  it("falls back to the prior blob-based behavior when the extract provider returns no HTML", async () => {
    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url): Promise<WebExtractResult> {
        return {
          url,
          title: "Pop Punk Venue",
          text: "Official venue page with pop punk concerts. 2026-07-01",
          markdown: "Official venue page with pop punk concerts. 2026-07-01",
          sourceProvider: "test-extract",
          statusCode: 200
        };
      }
    };

    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider("https://example.test/pop-punk-venue"),
      webExtractProvider: extractProvider,
      maxExtractPages: 1
    });

    const result = await provider.search({ input, maxResults: 10 });
    expect(result.targets.some((t) => t.sourceUrl === "https://example.test/pop-punk-venue" && t.name === "Pop Punk Venue")).toBe(true);
  });

  // Issue #201 follow-up regression: a Concerts50-style genre/city directory
  // page must never itself become a venue, single-event, or support-slot
  // opportunity — kept only as source evidence for its own individual
  // event-detail links (Output B), which must still work normally.
  it("never emits a listing/aggregator page itself as a venue or event opportunity, but still extracts its individual event-detail links", async () => {
    const LISTING_URL = "https://concerts50.com/france/paris/g/punk";
    const LISTING_HTML = `<!DOCTYPE html><html><head>
  <title>Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events, Gigs & Tickets</title>
</head><body>
<header><img class="logo" src="/logo.png" alt="Concerts50"></header>
<main>
  <div class="event-card"><a href="https://concerts50.com/event/band-a">Band A</a><time datetime="2026-09-12">12 Sep 2026</time></div>
  <div class="event-card"><a href="https://concerts50.com/event/band-b">Band B</a><time datetime="2026-10-03">3 Oct 2026</time></div>
  <div class="event-card"><a href="https://concerts50.com/event/band-c">Band C</a><time datetime="2026-11-20">20 Nov 2026</time></div>
</main>
</body></html>`;

    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        if (url === LISTING_URL) {
          return {
            url,
            title: "Emo / Hardcore / Punk Concerts in Paris 2026-2027 | Music Events, Gigs & Tickets",
            text: null,
            markdown: null,
            html: LISTING_HTML,
            links: ["https://concerts50.com/event/band-a"],
            sourceProvider: "test-extract",
            statusCode: 200
          };
        }
        if (url === "https://concerts50.com/event/band-a") {
          return { url, title: "Band A", text: null, markdown: null, html: eventHtml("Band A", "2026-09-12"), links: [], sourceProvider: "test-extract", statusCode: 200 };
        }
        return null;
      }
    };

    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider(LISTING_URL),
      webExtractProvider: extractProvider,
      maxExtractPages: 1
    });

    const result = await provider.search({ input, maxResults: 10 });

    // The listing page's *scraped page content* (sourceType "official_site",
    // built from extractVenuePageData's resolved identity) must never become
    // a venue opportunity — this is the web-extract-derived path this fix
    // covers. (A generic, unclassified "search_result"-tier raw source for
    // the same URL may still exist from the raw search-result step upstream
    // of any extraction — that generic search_result -> "venue" default
    // fallback is a separate, pre-existing classifyCategory() behavior
    // applying to every unclassified booking source across the whole
    // pipeline, not something this fix changes.)
    const scrapedPageTargets = result.targets.filter((t) => t.sourceUrl === LISTING_URL && t.sourceType === "official_site");
    expect(scrapedPageTargets).toHaveLength(0);

    // Its own individual event-detail link is still extracted normally.
    const eventTarget = result.targets.find((t) => t.sourceUrl === "https://concerts50.com/event/band-a");
    expect(eventTarget).toBeDefined();
    expect(eventTarget!.category).toBe("event");
    expect(eventTarget!.eventDate).toBe("2026-09-12");
  });

  it("rejects report/review pages as future concert opportunities", async () => {
    const reportUrl = "https://www.rockurlife.net/reports/all-time-low-salle-pleyel-26-01-26";
    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: {
        providerName: "test-search",
        async search() {
          return [{
            title: "ALL TIME LOW @ Salle Pleyel (26/01/26) - Reports - RockUrLife",
            url: reportUrl,
            snippet: "Live report and photos from the concert.",
            sourceProvider: "test-search",
            confidence: 0.8,
            links: []
          }];
        }
      },
      maxQueries: 1
    });

    const result = await provider.search({ input, maxResults: 10 });

    expect(result.targets.some((target) => target.category === "event")).toBe(false);
    expect(result.targets.some((target) => target.sourceUrl === reportUrl)).toBe(false);
  });

  it("keeps extracted event city null when neither event nor venue page reports a location", async () => {
    const listingUrl = "https://example.test/agenda";
    const detailUrl = "https://example.test/event/band-a";
    const extractProvider: WebExtractProvider = {
      providerName: "test-extract",
      async extract(url) {
        if (url === listingUrl) {
          return {
            url,
            title: "Agenda",
            text: null,
            markdown: null,
            html: `<!doctype html><html><head><title>Agenda</title></head><body><a href="${detailUrl}">Band A</a></body></html>`,
            links: [detailUrl],
            sourceProvider: "test-extract",
            statusCode: 200
          };
        }
        if (url === detailUrl) {
          return { url, title: "Band A", text: null, markdown: null, html: eventHtml("Band A", "2026-11-12"), links: [], sourceProvider: "test-extract", statusCode: 200 };
        }
        return null;
      }
    };
    const provider = buildWebSearchBookingSourceProvider({
      webSearchProvider: buildSearchProvider(listingUrl),
      webExtractProvider: extractProvider,
      maxExtractPages: 1
    });

    const result = await provider.search({ input, maxResults: 10 });

    expect(result.targets.find((target) => target.sourceUrl === detailUrl)?.city).toBeNull();
  });
});
