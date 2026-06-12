import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import type { RawBookingSource } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

export interface WebSearchBookingSourceProviderOptions {
  webSearchProvider: WebSearchProvider;
  webExtractProvider?: WebExtractProvider | null;
  maxQueries?: number;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
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
        for (const url of [...extractUrls].slice(0, options.maxExtractPages ?? 2)) {
          const extracted = await options.webExtractProvider.extract(url);
          if (extracted) {
            rawSources.push({
              name: extracted.title ?? url,
              url,
              sourceUrl: url,
              sourceType: "official_site",
              city: input.city,
              text: [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" "),
              links: [],
              confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.78 : 0.5,
              eventDate: extractEventDate([extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" "))
            });
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

function extractEventDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const european = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (european) {
    return `${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}`;
  }
  return null;
}

function isSocialOrTicketingUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return [
      "instagram.com",
      "facebook.com",
      "youtube.com",
      "youtu.be",
      "ticketmaster.com",
      "dice.fm",
      "shotgun.live",
      "eventbrite.com"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}
