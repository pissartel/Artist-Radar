import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import { warnLog } from "../../utils/logger.js";
import {
  buildVenueTargetsFromArtistEventHistory,
  dedupeHistoricalArtistEvents,
  fetchHistoricalEventsForSimilarArtists,
  getHistoricalEventLookbackMonths,
  getMaxHistoricalEventsPerArtist,
  getMaxSimilarArtistsForVenueDiscovery,
  selectSimilarArtistsForLiveHistory,
  type ArtistEventHistoryProvider
} from "../artistEventHistory.js";
import { extractEventDate } from "../dateParsing.js";
import { extractEventPageData, sanitizeRawTitle } from "../eventPageExtraction.js";
import { matchBookingGenres } from "../genreMatching.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import { compareArtistPopularity } from "../relevance.js";
import {
  selectEligibleSimilarArtistsForBookingVenueDiscovery
} from "../similarArtistEligibility.js";
import type { BookingSearchInput, BookingTarget, RawBookingSource } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";
import type { SimilarArtist } from "../../schemas.js";

export interface SimilarArtistLiveHistoryProviderOptions {
  /**
   * Optional so this provider can run purely on structured
   * eventHistoryProviders (issue #182, e.g. OpenAgenda/MusicBrainz) without
   * requiring a paid web search API key. When omitted, the free-text
   * city/country/support-slot search below is skipped entirely.
   */
  webSearchProvider?: WebSearchProvider | null;
  webExtractProvider?: WebExtractProvider | null;
  maxSimilarArtists?: number;
  maxResultsPerArtist?: number;
  maxExtractPages?: number;
  /**
   * Structured concert-history providers (issue #182), e.g. OpenAgenda or
   * MusicBrainz adapters. Optional and additive: when omitted, this
   * provider behaves exactly as before (free-text web search only).
   */
  eventHistoryProviders?: ArtistEventHistoryProvider[];
  maxHistoricalEventsPerArtist?: number;
  historicalEventLookbackMonths?: number;
}

const SUPPORT_SIGNAL_PATTERN = /\b(première partie|premiere partie|1ère partie|1ere partie|support tba|support à venir|support a venir|\+\s*guests?|line-?up (bientôt|soon)|lineup (bientôt|soon)|invités? à venir|invites? a venir)\b/i;

export function buildSimilarArtistLiveHistoryBookingSourceProvider(
  options: SimilarArtistLiveHistoryProviderOptions
): BookingSourceProvider {
  return {
    providerName: `similar_artist_live_history:${options.webSearchProvider?.providerName ?? "structured_only"}`,
    async search({ input, maxResults }) {
      const webSearchProvider = options.webSearchProvider ?? null;
      const similarArtistSelection = selectEligibleSimilarArtistsForBookingVenueDiscovery(input.similarArtists ?? [], options.maxSimilarArtists ?? 6);
      const similarArtists = webSearchProvider ? similarArtistSelection.artists : [];
      const rawSources: RawBookingSource[] = [];
      const searchedQueries: string[] = [];
      const extractQueue: Array<{ url: string; artist: SimilarArtist | null }> = [];

      const city = input.city;
      const country = input.artistProfile?.country ?? "France";
      let cityQueriesGenerated = 0;
      let countryQueriesGenerated = 0;
      let rawSimilarArtistResultCount = 0;
      let countryFallbackUsed = false;
      const resolvedLocations = new Set<string>([city, country]);

      if (webSearchProvider) {
        for (const artist of similarArtists) {
          const cityQueries = buildSimilarArtistCityQueries(artist, city).slice(0, 2);
          cityQueriesGenerated += cityQueries.length;
          let artistCityResultCount = 0;

          for (const query of cityQueries) {
            searchedQueries.push(query);
            const results = await webSearchProvider.search(query, {
              limit: Math.min(options.maxResultsPerArtist ?? 3, maxResults ?? input.limit)
            });
            artistCityResultCount += results.length;
            rawSimilarArtistResultCount += results.length;
            for (const result of results) {
              rawSources.push(webResultToSimilarArtistSource(input, artist, result));
              if (result.url && !isLowValueUrl(result.url)) {
                extractQueue.push({ url: result.url, artist });
              }
            }
          }

          if (artistCityResultCount === 0) {
            countryFallbackUsed = true;
            warnLog("booking", `Similar artist live-history: Firecrawl returned 0 results for city-level search. Running France-level fallback for "${artist.name}".`);
            const countryQueries = buildSimilarArtistCountryQueries(artist, country).slice(0, 3);
            countryQueriesGenerated += countryQueries.length;
            for (const query of countryQueries) {
              searchedQueries.push(query);
              const results = await webSearchProvider.search(query, {
                limit: Math.min(options.maxResultsPerArtist ?? 3, maxResults ?? input.limit)
              });
              rawSimilarArtistResultCount += results.length;
              for (const result of results) {
                rawSources.push(webResultToSimilarArtistSource(input, artist, result));
                if (result.url && !isLowValueUrl(result.url)) {
                  extractQueue.push({ url: result.url, artist });
                }
              }
            }
          }
        }
      }

      const supportSlotQueryList = webSearchProvider ? buildSupportSlotDiscoveryQueries(input.genre, city, country).slice(0, 8) : [];
      let rawSupportSlotResultCount = 0;
      if (webSearchProvider) {
        for (const query of supportSlotQueryList) {
          searchedQueries.push(query);
          const results = await webSearchProvider.search(query, {
            limit: Math.min(options.maxResultsPerArtist ?? 3, maxResults ?? input.limit)
          });
          rawSupportSlotResultCount += results.length;
          for (const result of results) {
            rawSources.push(webResultToSupportSlotSource(input, result));
            if (result.url && !isLowValueUrl(result.url)) {
              extractQueue.push({ url: result.url, artist: null });
            }
          }
        }
      }

      const extractItems = dedupeExtractQueue(extractQueue).slice(0, options.maxExtractPages ?? 6);
      if (options.webExtractProvider) {
        for (const item of extractItems) {
          const extracted = await options.webExtractProvider.extract(item.url);
          if (extracted) {
            const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ");
            const confidence = extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.86 : 0.6;
            if (item.artist) {
              rawSources.push(extractedPageToSimilarArtistSource(input, item.artist, item.url, {
                title: extracted.title,
                text,
                confidence,
                html: extracted.html ?? null
              }));
            } else {
              rawSources.push(extractedPageToSupportSlotSource(input, item.url, {
                title: extracted.title,
                text,
                confidence,
                html: extracted.html ?? null
              }));
            }
          }
        }
      }

      const supportSignalCount = rawSources.filter((source) => hasSupportSignal(source.text ?? "")).length;

      const freeTextTargets = rawSources.flatMap((source) => {
        const normalized = normalizeBookingSource(source);
        return normalized ? [normalized] : [];
      });

      const eventHistoryProviders = options.eventHistoryProviders ?? [];
      const historyResult = eventHistoryProviders.length > 0
        ? await runStructuredEventHistorySearch(input, eventHistoryProviders, {
            maxSimilarArtists: options.maxSimilarArtists,
            maxHistoricalEventsPerArtist: options.maxHistoricalEventsPerArtist,
            historicalEventLookbackMonths: options.historicalEventLookbackMonths,
            countries: [country]
          })
        : null;

      const targets = [...freeTextTargets, ...(historyResult?.targets ?? [])];

      const locationMode: "city" | "country" | "city_and_country" =
        countryFallbackUsed && cityQueriesGenerated > 0 ? "city_and_country" :
        countryFallbackUsed ? "country" : "city";

      logSimilarArtistLiveHistorySummary({
        cityQueriesGenerated,
        countryQueriesGenerated,
        supportSlotQueriesGenerated: supportSlotQueryList.length,
        rawSimilarArtistResults: rawSimilarArtistResultCount,
        rawSupportSlotResults: rawSupportSlotResultCount,
        extractedCandidates: extractItems.length,
        supportSignalCount,
        keptTargets: freeTextTargets.length
      });

      if (countryFallbackUsed) {
        warnLog("booking", "Running specialized scene agenda fallback (if ENABLE_SCENE_AGENDAS=true, scene agenda providers will provide additional results).");
      }

      if (historyResult) {
        logStructuredEventHistorySummary(historyResult);
      }

      return {
        targets,
        sourceProvider: `similar_artist_live_history:${webSearchProvider?.providerName ?? "structured_only"}`,
        searchedQueries,
        warnings: [
          ...(webSearchProvider && similarArtists.length === 0 ? ["No genre/popularity-compatible similar artists were available for booking live-history search."] : []),
          ...(countryFallbackUsed ? ["City-level search returned zero results for some artists; country-level fallback was used."] : []),
          ...(historyResult?.warnings ?? [])
        ],
        metadata: {
          similarArtistsConsidered: input.similarArtists?.length ?? 0,
          similarArtistsKept: historyResult ? historyResult.similarArtistsKept : similarArtists.length,
          similarArtistsKeptForFreeTextSearch: similarArtists.length,
          similarArtistEligibilityDiagnostics: similarArtistSelection.diagnostics,
          rawSourceCount: rawSources.length,
          searchProvider: webSearchProvider?.providerName ?? null,
          extractProvider: options.webExtractProvider?.providerName ?? null,
          extractProviderDiagnostics: (options.webExtractProvider as { diagnostics?: unknown } | null | undefined)?.diagnostics ?? null,
          generatedQueryCount: cityQueriesGenerated + countryQueriesGenerated + supportSlotQueryList.length,
          rawSearchResultCount: rawSimilarArtistResultCount + rawSupportSlotResultCount,
          extractedCandidateCount: extractItems.length,
          supportSignalCount,
          locationMode,
          resolvedLocations: [...resolvedLocations],
          countryFallbackUsed,
          historicalVenueTargets: historyResult?.targets.length ?? 0,
          eventHistoryProviderCount: eventHistoryProviders.length,
          eventHistoryProviderDiagnostics: historyResult?.providerDiagnostics ?? []
        }
      };
    }
  };
}

interface StructuredEventHistorySearchOptions {
  maxSimilarArtists?: number;
  maxHistoricalEventsPerArtist?: number;
  historicalEventLookbackMonths?: number;
  countries?: string[];
}

interface StructuredEventHistorySearchResult {
  targets: BookingTarget[];
  warnings: string[];
  similarArtistsKept: number;
  providerDiagnostics: Array<{ providerName: string; artistName: string; status: "ok" | "failed"; eventCount: number; message?: string }>;
}

// Structured, provider-neutral concert-history path (issue #182): selects a
// mix of small/medium/local/close-audience similar artists (rather than the
// stricter free-text selection above), fans out to every configured
// ArtistEventHistoryProvider with bounded artist concurrency, and turns the
// resulting historical events into venue candidates carrying per-artist
// evidence. A failing provider or artist is isolated and reported as a
// warning; it never aborts the rest of the search.
async function runStructuredEventHistorySearch(
  input: BookingSearchInput,
  eventHistoryProviders: ArtistEventHistoryProvider[],
  options: StructuredEventHistorySearchOptions
): Promise<StructuredEventHistorySearchResult> {
  const maxSimilarArtists = options.maxSimilarArtists ?? getMaxSimilarArtistsForVenueDiscovery();
  const lookbackMonths = options.historicalEventLookbackMonths ?? getHistoricalEventLookbackMonths();
  const maxHistoricalEventsPerArtist = options.maxHistoricalEventsPerArtist ?? getMaxHistoricalEventsPerArtist();
  const similarArtists = selectSimilarArtistsForLiveHistory(input, maxSimilarArtists);

  if (similarArtists.length === 0) {
    return {
      targets: [],
      warnings: ["No genre/popularity-compatible similar artists were available for concert-history venue discovery."],
      similarArtistsKept: 0,
      providerDiagnostics: []
    };
  }

  const now = new Date();
  const dateFrom = new Date(now);
  dateFrom.setMonth(dateFrom.getMonth() - lookbackMonths);

  const fetchResult = await fetchHistoricalEventsForSimilarArtists(similarArtists, eventHistoryProviders, {
    maxHistoricalEventsPerArtist,
    countries: options.countries?.length ? options.countries : undefined,
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10)
  });

  const dedupedEvents = dedupeHistoricalArtistEvents(fetchResult.events);
  const targets = buildVenueTargetsFromArtistEventHistory(input, similarArtists, dedupedEvents, {
    now,
    lookbackMonths
  });

  return {
    targets,
    warnings: fetchResult.warnings,
    similarArtistsKept: similarArtists.length,
    providerDiagnostics: fetchResult.providerDiagnostics
  };
}

function logStructuredEventHistorySummary(result: StructuredEventHistorySearchResult): void {
  warnLog("booking", [
    "Similar artist concert-history venue discovery:",
    `- similar artists selected: ${result.similarArtistsKept}`,
    `- venue candidates found: ${result.targets.length}`,
    `- provider failures: ${result.providerDiagnostics.filter((diagnostic) => diagnostic.status === "failed").length}`,
    `- warnings: ${result.warnings.length}`
  ].join("\n"));
}

function selectSimilarArtistsForBooking(input: BookingSearchInput, limit: number): SimilarArtist[] {
  return selectEligibleSimilarArtistsForBookingVenueDiscovery(input.similarArtists ?? [], limit).artists
    .sort((left, right) => {
      const leftPopularity = compareArtistPopularity(input, left).score;
      const rightPopularity = compareArtistPopularity(input, right).score;
      return (right.genreRelevance + rightPopularity) - (left.genreRelevance + leftPopularity);
    });
}

function buildSimilarArtistCityQueries(artist: SimilarArtist, city: string): string[] {
  return [
    `"${artist.name}" concert ${city}`,
    `"${artist.name}" live ${city}`,
    `"${artist.name}" Bandsintown ${city}`,
    `"${artist.name}" Songkick ${city}`
  ];
}

function buildSimilarArtistCountryQueries(artist: SimilarArtist, country: string): string[] {
  return [
    `"${artist.name}" tour ${country}`,
    `"${artist.name}" concert ${country}`,
    `"${artist.name}" venue ${country}`,
    `"${artist.name}" festival ${country}`,
    `"${artist.name}" Bandsintown ${country}`,
    `"${artist.name}" Songkick ${country}`
  ];
}

export function getSupportSlotRelatedGenres(genre: string): string[] {
  const normalized = genre.toLowerCase();
  if (normalized.includes("pop punk")) {
    return ["pop punk", "punk rock", "punk", "emo", "emo pop", "easycore", "skate punk", "melodic punk", "hardcore punk"];
  }
  if (normalized.includes("emo")) {
    return ["emo", "emo pop", "pop punk", "punk rock", "punk"];
  }
  if (normalized.includes("hardcore")) {
    return ["hardcore punk", "hardcore", "punk", "metalcore", "emo"];
  }
  if (normalized.includes("metal")) {
    return ["metal", "metalcore", "hardcore", "heavy metal", "sludge"];
  }
  if (normalized.includes("indie") || normalized.includes("alternative")) {
    return ["indie rock", "alternative rock", "post-punk", "indie pop", "shoegaze"];
  }
  return [genre, "rock", "indie"];
}

export function buildSupportSlotDiscoveryQueries(genre: string, city: string, country: string): string[] {
  const relatedGenres = getSupportSlotRelatedGenres(genre);
  const year = new Date().getFullYear();
  const queries: string[] = [];

  for (const g of relatedGenres.slice(0, 4)) {
    queries.push(`${g} concert ${city} première partie`);
    queries.push(`${g} concert ${city} support`);
  }
  queries.push(`${relatedGenres[0]} concerts ${city} ${year}`);
  if (relatedGenres.length > 1) {
    queries.push(`${relatedGenres[1]} concerts ${city} ${year}`);
  }
  for (const g of relatedGenres.slice(0, 3)) {
    queries.push(`${g} concert ${country} première partie`);
    queries.push(`${g} festival ${country} lineup`);
  }
  return [...new Set(queries)];
}

function hasSupportSignal(text: string): boolean {
  return SUPPORT_SIGNAL_PATTERN.test(text);
}

// Falls back to an honest, non-misleading label instead of accepting a raw
// search-result title outright (issue #201 follow-up) — no HTML is
// available at this stage to build a real structured "Artist at Venue"
// title, so the safest non-generic option is used rather than a page's own
// SEO/listing title.
function resolveWebResultTitle(rawTitle: string | null, fallback: string): string {
  return sanitizeRawTitle(rawTitle) ?? fallback;
}

function webResultToSimilarArtistSource(input: BookingSearchInput, artist: SimilarArtist, result: WebSearchResult): RawBookingSource {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  return buildRawSimilarArtistSource(input, artist, {
    title: resolveWebResultTitle(result.title, `${artist.name} live history`),
    url: result.url ?? null,
    text,
    confidence: Math.max(0.45, result.confidence * 0.85)
  });
}

function webResultToSupportSlotSource(input: BookingSearchInput, result: WebSearchResult): RawBookingSource {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  const eventDate = extractEventDate(text);
  return {
    name: resolveWebResultTitle(result.title, "Support slot discovery result"),
    url: result.url ?? null,
    sourceUrl: result.url ?? null,
    sourceType: "similar_artist_live_history",
    sourceProvider: "similar_artist_live_history",
    city: input.city,
    country: input.artistProfile?.country ?? null,
    text,
    links: result.url ? [result.url] : [],
    genres: [],
    confidence: Math.max(0.4, result.confidence * 0.8),
    eventDate
  };
}

// When the full page HTML is available (post web-extract), routes through
// the same structured extraction used for single-event pages (issue #201
// follow-up): a real, specific title survives untouched; a generic/SEO
// listing title is rejected in favor of a built "Artist at Venue" title (or
// the honest fallback below); and a real poster/OG image is preserved
// instead of always being null.
function extractedPageToSimilarArtistSource(
  input: BookingSearchInput,
  artist: SimilarArtist,
  url: string,
  page: { title: string | null; text: string; confidence: number; html?: string | null }
): RawBookingSource {
  if (page.html) {
    const eventData = extractEventPageData(page.html, url);
    return buildRawSimilarArtistSource(input, artist, {
      title: eventData.title ?? url,
      url,
      text: page.text,
      confidence: page.confidence,
      imageUrl: eventData.posterImageUrl
    });
  }
  return buildRawSimilarArtistSource(input, artist, {
    title: resolveWebResultTitle(page.title, `${artist.name} live history`),
    url,
    text: page.text,
    confidence: page.confidence
  });
}

function extractedPageToSupportSlotSource(
  input: BookingSearchInput,
  url: string,
  page: { title: string | null; text: string; confidence: number; html?: string | null }
): RawBookingSource {
  if (page.html) {
    const eventData = extractEventPageData(page.html, url);
    return {
      name: eventData.title ?? url,
      url,
      sourceUrl: url,
      sourceType: "similar_artist_live_history",
      sourceProvider: "similar_artist_live_history",
      city: input.city,
      country: input.artistProfile?.country ?? null,
      text: page.text,
      links: [url],
      genres: [],
      confidence: page.confidence,
      imageUrl: eventData.posterImageUrl,
      eventDate: eventData.eventDate ?? extractEventDate(page.text)
    };
  }
  const eventDate = extractEventDate(page.text);
  return {
    name: resolveWebResultTitle(page.title, "Support slot discovery result"),
    url,
    sourceUrl: url,
    sourceType: "similar_artist_live_history",
    sourceProvider: "similar_artist_live_history",
    city: input.city,
    country: input.artistProfile?.country ?? null,
    text: page.text,
    links: [url],
    genres: [],
    confidence: page.confidence,
    eventDate
  };
}

function buildRawSimilarArtistSource(
  input: BookingSearchInput,
  artist: SimilarArtist,
  source: { title: string; url: string | null; text: string; confidence: number; imageUrl?: string | null }
): RawBookingSource {
  const popularity = compareArtistPopularity(input, artist);
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], artist.genres, source.text);
  const eventDate = extractEventDate(source.text);
  const sourceType = classifySimilarArtistSourceType(source.url, source.text);
  const supportText = popularity.supportSlotOnly
    ? "Good support-slot target because the similar artist is bigger."
    : "Useful booking target because the similar artist has comparable popularity.";

  return {
    name: source.title,
    url: source.url,
    sourceUrl: source.url,
    sourceType,
    sourceProvider: "similar_artist_live_history",
    city: input.city,
    country: input.artistProfile?.country ?? null,
    text: [
      source.text,
      `Similar artist ${artist.name} played or was referenced by this source.`,
      popularity.reason,
      supportText,
      eventDate ? `Recent event date: ${eventDate}` : null
    ].filter(Boolean).join(" "),
    links: source.url ? [source.url] : [],
    genres: [...artist.genres, ...genreMatch.matchedGenres],
    confidence: Math.min(0.95, source.confidence + (popularity.score >= 70 ? 0.08 : 0)),
    eventDate,
    imageUrl: source.imageUrl ?? null,
    derivedFromSimilarArtist: {
      name: artist.name,
      popularityComparison: popularity.comparison,
      matchedGenres: genreMatch.matchedGenres,
      sourceUrl: source.url
    }
  };
}

function classifySimilarArtistSourceType(url: string | null, text: string): RawBookingSource["sourceType"] {
  const value = `${url ?? ""} ${text}`.toLowerCase();
  if (/\bfestival|fest\b/.test(value)) return "festival_official_page";
  if (/\bpromoter|organisateur|tourneur|production\b/.test(value)) return "promoter_official_page";
  if (/\bvenue|salle|club|café-concert|cafe-concert|programmation\b/.test(value)) return "venue_official_programming_page";
  return "similar_artist_live_history";
}

function dedupeExtractQueue(queue: Array<{ url: string; artist: SimilarArtist | null }>): Array<{ url: string; artist: SimilarArtist | null }> {
  const seen = new Set<string>();
  return queue.filter((item) => {
    if (seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

function isLowValueUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    return [
      "instagram.com",
      "facebook.com",
      "youtube.com",
      "youtu.be",
      "spotify.com",
      "ticketmaster.com",
      "dice.fm",
      "shotgun.live",
      "eventbrite.com"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

function logSimilarArtistLiveHistorySummary(summary: {
  cityQueriesGenerated: number;
  countryQueriesGenerated: number;
  supportSlotQueriesGenerated: number;
  rawSimilarArtistResults: number;
  rawSupportSlotResults: number;
  extractedCandidates: number;
  supportSignalCount: number;
  keptTargets: number;
}): void {
  warnLog("booking", [
    "Similar artist live-history search:",
    `- city queries generated: ${summary.cityQueriesGenerated}`,
    `- country queries generated: ${summary.countryQueriesGenerated}`,
    `- raw results found: ${summary.rawSimilarArtistResults}`,
    `- extracted candidates: ${summary.extractedCandidates}`,
    `- kept candidates: ${summary.keptTargets}`,
    "",
    "Support-slot discovery:",
    `- genre/location queries generated: ${summary.supportSlotQueriesGenerated}`,
    `- raw results found: ${summary.rawSupportSlotResults}`,
    `- support signals found: ${summary.supportSignalCount}`
  ].join("\n"));
}
