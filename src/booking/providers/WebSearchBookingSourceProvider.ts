import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import { extractEventDate } from "../dateParsing.js";
import {
  extractEventPageData,
  extractVenuePageData,
  isSocialOrTicketingUrl,
  selectEventDetailLinks
} from "../eventPageExtraction.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import type { RawBookingSource } from "../types.js";
import { debugLog } from "../../utils/logger.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

const DEFAULT_MAX_EVENT_DETAIL_PAGES = 8;
const DEFAULT_EVENT_DETAIL_CONCURRENCY = 2;

export interface WebSearchBookingSourceProviderOptions {
  webSearchProvider: WebSearchProvider;
  webExtractProvider?: WebExtractProvider | null;
  maxQueries?: number;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
  /** Output B: max individual event-detail pages scraped per listing page found. */
  maxEventDetailPages?: number;
  /** Output B: bounded concurrency for event-detail-page scraping. */
  eventDetailConcurrency?: number;
}

export function buildWebSearchBookingSourceProvider(
  options: WebSearchBookingSourceProviderOptions
): BookingSourceProvider {
  return {
    providerName: `web_search_booking:${options.webSearchProvider.providerName}`,
    async search({ input, maxResults }) {
      const queries = buildBookingSearchQueries(input.genre, input.city, input.target ?? null)
        .slice(0, options.maxQueries ?? 4);
      const rawSources: RawBookingSource[] = [];
      const extractUrls = new Set<string>();

      for (const query of queries) {
        const results = await options.webSearchProvider.search(query, {
          limit: Math.min(options.maxResultsPerQuery ?? 5, maxResults ?? input.limit)
        });
        for (const result of results) {
          rawSources.push(webResultToRawSource(result, input.city));
          if (result.url && !isSocialOrTicketingUrl(result.url)) {
            extractUrls.add(result.url);
          }
        }
      }

      if (options.webExtractProvider) {
        const webExtractProvider = options.webExtractProvider;
        for (const url of [...extractUrls].slice(0, options.maxExtractPages ?? 2)) {
          const extracted = await webExtractProvider.extract(url);
          if (!extracted) continue;

          if (!extracted.html) {
            // Defensive fallback for a non-Firecrawl extract provider (no
            // raw HTML available): keep the prior blob-wide behavior rather
            // than losing the result entirely.
            rawSources.push(fallbackRawSource(url, extracted, input.city));
            continue;
          }

          const venueData = extractVenuePageData(extracted.html, url);
          debugLog("booking", `[web-extract] venue identity for ${url}`, {
            venueName: venueData.venueName,
            nameSource: venueData.nameSource,
            rejectedNames: venueData.rejectedNames,
            isCollectionPage: venueData.isCollectionPage,
            collectionPageReason: venueData.collectionPageReason,
            pageType: venueData.pageType,
            isSingleEvent: venueData.isSingleEvent,
            isVenue: venueData.isVenue,
            pageTypeReason: venueData.pageTypeReason
          });

          // A third-party listing/directory/aggregator page (issue #201
          // follow-up: concerts50.com-style genre pages) must never become a
          // venue, single-event, or support-slot opportunity itself — it is
          // kept only as source evidence for its own individual event-detail
          // links below (Output B), which is unaffected by this check.
          const isRejectedListingPage = venueData.pageType === "event_listing" || venueData.pageType === "search_results" || venueData.pageType === "article";
          if (isRejectedListingPage) {
            debugLog("booking", `[web-extract] rejected listing/non-opportunity page: ${url}`, {
              pageType: venueData.pageType,
              reason: venueData.pageTypeReason
            });
          }

          if (venueData.venueName && !isRejectedListingPage) {
            rawSources.push({
              name: venueData.venueName,
              url,
              sourceUrl: url,
              sourceType: "official_site",
              category: venueData.isVenue ? "venue" : undefined,
              city: venueData.city ?? input.city,
              country: venueData.country ?? undefined,
              address: venueData.address ?? undefined,
              venueName: venueData.venueName,
              imageUrl: venueData.imageUrl ?? undefined,
              imageSource: venueData.imageSource ?? undefined,
              text: [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" "),
              links: [],
              confidence: Math.max(
                venueData.confidence,
                extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.5 : 0.3
              ),
              // Never resolved for a detected collection/listing page —
              // this is the core fix for a date leaked from an unrelated
              // event card onto the venue itself.
              eventDate: venueData.eventDate
            });
          }

          // Output B: a listing page's own links may point to individual
          // event-detail pages. Scrape a bounded number of them and emit
          // one opportunity per successfully-dated event, alongside (not
          // instead of) the venue-level opportunity above.
          if (venueData.isCollectionPage && extracted.links && extracted.links.length > 0) {
            const detailLinks = selectEventDetailLinks(
              extracted.links,
              url,
              options.maxEventDetailPages ?? DEFAULT_MAX_EVENT_DETAIL_PAGES
            );
            debugLog(
              "booking",
              `[web-extract] ${detailLinks.length} candidate event-detail link(s) selected from ${extracted.links.length} total links on ${url}`
            );

            const eventSources = await mapWithConcurrency(
              detailLinks,
              options.eventDetailConcurrency ?? DEFAULT_EVENT_DETAIL_CONCURRENCY,
              (detailUrl) => extractEventOpportunity(webExtractProvider, detailUrl, venueData, input.city)
            );
            const acceptedEvents = eventSources.filter((source): source is RawBookingSource => Boolean(source));
            debugLog(
              "booking",
              `[web-extract] ${acceptedEvents.length}/${detailLinks.length} event-detail page(s) on ${url} yielded a dated event`
            );
            rawSources.push(...acceptedEvents);
          }
        }
      }

      return {
        targets: rawSources.flatMap((source) => {
          const normalized = normalizeBookingSource(source);
          return normalized ? [normalized] : [];
        }),
        sourceProvider: `web_search_booking:${options.webSearchProvider.providerName}`,
        searchedQueries: queries,
        warnings: rawSources.length === 0 ? [`${options.webSearchProvider.providerName} returned no booking source results.`] : [],
        metadata: {
          searchProvider: options.webSearchProvider.providerName,
          extractProvider: options.webExtractProvider?.providerName ?? null,
          rawSourceCount: rawSources.length
        }
      };
    }
  };
}

async function extractEventOpportunity(
  webExtractProvider: WebExtractProvider,
  detailUrl: string,
  venue: ReturnType<typeof extractVenuePageData>,
  fallbackCity: string
): Promise<RawBookingSource | null> {
  const detailExtracted = await webExtractProvider.extract(detailUrl);
  if (!detailExtracted?.html) return null;

  const eventData = extractEventPageData(detailExtracted.html, detailUrl);
  // Issue #201 follow-up diagnostics: title source (never the raw SEO title
  // when a structured one could be built) and image source, so an enabled
  // vs. disabled Chartmetric run can be compared for extraction quality too.
  debugLog("booking", `[web-extract] event title/image resolution for ${detailUrl}`, {
    title: eventData.title,
    sourceTitle: eventData.sourceTitle,
    titleSource: eventData.fieldSources.title,
    usedStructuredTitle: eventData.title !== eventData.sourceTitle,
    imageSource: eventData.posterImageUrl ? "posterImageUrl" : "none"
  });
  // Never emit an event opportunity without a real, resolved date — an
  // event-detail page that doesn't yield one isn't usable as a dated
  // concert opportunity (it may still be a false-positive link, e.g. a
  // "past editions" or "about" page).
  if (!eventData.eventDate) return null;

  return {
    name: eventData.title ?? venue.venueName ?? detailUrl,
    url: detailUrl,
    sourceUrl: detailUrl,
    sourceType: "event_page",
    category: "event",
    city: eventData.city ?? venue.city ?? fallbackCity,
    country: venue.country ?? undefined,
    // The parent listing page's resolved venue identity is used as a
    // fallback — individual event pages on small venue sites often don't
    // repeat the venue's own branding.
    venueName: eventData.venueName ?? venue.venueName ?? undefined,
    imageUrl: eventData.posterImageUrl ?? undefined,
    lineup: eventData.lineup,
    eventDate: eventData.eventDate,
    text: eventData.description ?? undefined,
    links: [],
    confidence: eventData.confidence
  };
}

function fallbackRawSource(
  url: string,
  extracted: { title: string | null; text: string | null; markdown: string | null; statusCode: number | null },
  fallbackCity: string
): RawBookingSource {
  const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ");
  return {
    name: extracted.title ?? url,
    url,
    sourceUrl: url,
    sourceType: "official_site",
    city: fallbackCity,
    text,
    links: [],
    confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.78 : 0.5,
    eventDate: extractEventDate(text)
  };
}

function buildBookingSearchQueries(genre: string, city: string, target: string | null): string[] {
  const location = target ?? city;
  const year = new Date().getFullYear();
  return [
    `${genre} concert venue ${location} programmation`,
    `${genre} café-concert ${location}`,
    `${genre} concerts ${location} ${year}`,
    `${genre} première partie ${location}`,
    `${genre} support TBA ${location}`,
    `${genre} association concerts ${location}`,
    `${genre} festival appel à candidature`
  ];
}

function webResultToRawSource(result: WebSearchResult, fallbackCity: string): RawBookingSource {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  return {
    name: result.title ?? result.url ?? "Untitled booking source",
    url: result.url ?? null,
    sourceUrl: result.url ?? null,
    sourceType: "search_result",
    city: fallbackCity,
    text,
    snippet: result.snippet,
    links: result.links ?? [],
    confidence: result.confidence,
    eventDate: extractEventDate(text)
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
