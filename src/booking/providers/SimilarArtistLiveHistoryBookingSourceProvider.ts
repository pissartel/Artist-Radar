import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
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

export function buildSimilarArtistLiveHistoryBookingSourceProvider(
  options: SimilarArtistLiveHistoryProviderOptions
): BookingSourceProvider {
  return {
    providerName: `similar_artist_live_history:${options.webSearchProvider.providerName}`,
    async search({ input, maxResults }) {
      const similarArtists = selectSimilarArtistsForBooking(input, options.maxSimilarArtists ?? 6);
      const rawSources: RawBookingSource[] = [];
      const searchedQueries: string[] = [];
      const extractQueue: Array<{ url: string; artist: SimilarArtist }> = [];

      for (const artist of similarArtists) {
        const queries = buildSimilarArtistLiveQueries(input, artist).slice(0, 2);
        for (const query of queries) {
          searchedQueries.push(query);
          const results = await options.webSearchProvider.search(query, {
            limit: Math.min(options.maxResultsPerArtist ?? 3, maxResults ?? input.limit)
          });
          for (const result of results) {
            rawSources.push(webResultToSimilarArtistSource(input, artist, result));
            if (result.url && !isLowValueUrl(result.url)) {
              extractQueue.push({ url: result.url, artist });
            }
          }
        }
      }

      if (options.webExtractProvider) {
        for (const item of dedupeExtractQueue(extractQueue).slice(0, options.maxExtractPages ?? 6)) {
          const extracted = await options.webExtractProvider.extract(item.url);
          if (extracted) {
            rawSources.push(extractedPageToSimilarArtistSource(input, item.artist, item.url, {
              title: extracted.title,
              text: [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" "),
              confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.86 : 0.6
            }));
          }
        }
      }

      const targets = rawSources.flatMap((source) => {
        const normalized = normalizeBookingSource(source);
        return normalized ? [normalized] : [];
      });

      return {
        targets,
        sourceProvider: `similar_artist_live_history:${options.webSearchProvider.providerName}`,
        searchedQueries,
        warnings: similarArtists.length === 0
          ? ["No genre/popularity-compatible similar artists were available for booking live-history search."]
          : [],
        metadata: {
          similarArtistsConsidered: input.similarArtists?.length ?? 0,
          similarArtistsKept: similarArtists.length,
          rawSourceCount: rawSources.length,
          searchProvider: options.webSearchProvider.providerName,
          extractProvider: options.webExtractProvider?.providerName ?? null
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

function buildSimilarArtistLiveQueries(input: BookingSearchInput, artist: SimilarArtist): string[] {
  const location = input.target ?? input.city;
  return [
    `"${artist.name}" concert venue festival "${location}"`,
    `"${artist.name}" live "${input.genre}" "${location}"`,
    `"${artist.name}" programmation concert`
  ];
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

function dedupeExtractQueue(queue: Array<{ url: string; artist: SimilarArtist }>): Array<{ url: string; artist: SimilarArtist }> {
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
