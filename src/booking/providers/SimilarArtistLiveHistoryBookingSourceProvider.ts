import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import { warnLog } from "../../utils/logger.js";
import { extractEventDate } from "../dateParsing.js";
import { matchBookingGenres } from "../genreMatching.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import { compareArtistPopularity, isStrongSimilarArtistForBooking } from "../relevance.js";
import type { BookingSearchInput, RawBookingSource } from "../types.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";
import type { SimilarArtist } from "../../schemas.js";

export interface SimilarArtistLiveHistoryProviderOptions {
  webSearchProvider: WebSearchProvider;
  webExtractProvider?: WebExtractProvider | null;
  maxSimilarArtists?: number;
  maxResultsPerArtist?: number;
  maxExtractPages?: number;
}

const SUPPORT_SIGNAL_PATTERN = /\b(première partie|premiere partie|1ère partie|1ere partie|support tba|support à venir|support a venir|\+\s*guests?|line-?up (bientôt|soon)|lineup (bientôt|soon)|invités? à venir|invites? a venir)\b/i;

export function buildSimilarArtistLiveHistoryBookingSourceProvider(
  options: SimilarArtistLiveHistoryProviderOptions
): BookingSourceProvider {
  return {
    providerName: `similar_artist_live_history:${options.webSearchProvider.providerName}`,
    async search({ input, maxResults }) {
      const similarArtists = selectSimilarArtistsForBooking(input, options.maxSimilarArtists ?? 6);
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

      for (const artist of similarArtists) {
        const cityQueries = buildSimilarArtistCityQueries(artist, city).slice(0, 2);
        cityQueriesGenerated += cityQueries.length;
        let artistCityResultCount = 0;

        for (const query of cityQueries) {
          searchedQueries.push(query);
          const results = await options.webSearchProvider.search(query, {
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
            const results = await options.webSearchProvider.search(query, {
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

      const supportSlotQueryList = buildSupportSlotDiscoveryQueries(input.genre, city, country).slice(0, 8);
      let rawSupportSlotResultCount = 0;
      for (const query of supportSlotQueryList) {
        searchedQueries.push(query);
        const results = await options.webSearchProvider.search(query, {
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
                confidence
              }));
            } else {
              rawSources.push(extractedPageToSupportSlotSource(input, item.url, {
                title: extracted.title,
                text,
                confidence
              }));
            }
          }
        }
      }

      const supportSignalCount = rawSources.filter((source) => hasSupportSignal(source.text ?? "")).length;

      const targets = rawSources.flatMap((source) => {
        const normalized = normalizeBookingSource(source);
        return normalized ? [normalized] : [];
      });

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
        keptTargets: targets.length
      });

      if (countryFallbackUsed) {
        warnLog("booking", "Running specialized scene agenda fallback (if ENABLE_SCENE_AGENDAS=true, scene agenda providers will provide additional results).");
      }

      return {
        targets,
        sourceProvider: `similar_artist_live_history:${options.webSearchProvider.providerName}`,
        searchedQueries,
        warnings: [
          ...(similarArtists.length === 0 ? ["No genre/popularity-compatible similar artists were available for booking live-history search."] : []),
          ...(countryFallbackUsed ? ["City-level search returned zero results for some artists; country-level fallback was used."] : [])
        ],
        metadata: {
          similarArtistsConsidered: input.similarArtists?.length ?? 0,
          similarArtistsKept: similarArtists.length,
          rawSourceCount: rawSources.length,
          searchProvider: options.webSearchProvider.providerName,
          extractProvider: options.webExtractProvider?.providerName ?? null,
          generatedQueryCount: cityQueriesGenerated + countryQueriesGenerated + supportSlotQueryList.length,
          rawSearchResultCount: rawSimilarArtistResultCount + rawSupportSlotResultCount,
          extractedCandidateCount: extractItems.length,
          supportSignalCount,
          locationMode,
          resolvedLocations: [...resolvedLocations],
          countryFallbackUsed
        }
      };
    }
  };
}

function selectSimilarArtistsForBooking(input: BookingSearchInput, limit: number): SimilarArtist[] {
  return [...(input.similarArtists ?? [])]
    .filter((artist) => isStrongSimilarArtistForBooking(input, artist))
    .sort((left, right) => {
      const leftPopularity = compareArtistPopularity(input, left).score;
      const rightPopularity = compareArtistPopularity(input, right).score;
      return (right.genreRelevance + rightPopularity) - (left.genreRelevance + leftPopularity);
    })
    .slice(0, limit);
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

function webResultToSimilarArtistSource(input: BookingSearchInput, artist: SimilarArtist, result: WebSearchResult): RawBookingSource {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  return buildRawSimilarArtistSource(input, artist, {
    title: result.title ?? result.url ?? `${artist.name} live history`,
    url: result.url ?? null,
    text,
    confidence: Math.max(0.45, result.confidence * 0.85)
  });
}

function webResultToSupportSlotSource(input: BookingSearchInput, result: WebSearchResult): RawBookingSource {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  const eventDate = extractEventDate(text);
  return {
    name: result.title ?? result.url ?? "Support slot discovery result",
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

function extractedPageToSimilarArtistSource(
  input: BookingSearchInput,
  artist: SimilarArtist,
  url: string,
  page: { title: string | null; text: string; confidence: number }
): RawBookingSource {
  return buildRawSimilarArtistSource(input, artist, {
    title: page.title ?? url,
    url,
    text: page.text,
    confidence: page.confidence
  });
}

function extractedPageToSupportSlotSource(
  input: BookingSearchInput,
  url: string,
  page: { title: string | null; text: string; confidence: number }
): RawBookingSource {
  const eventDate = extractEventDate(page.text);
  return {
    name: page.title ?? url,
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
  source: { title: string; url: string | null; text: string; confidence: number }
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
