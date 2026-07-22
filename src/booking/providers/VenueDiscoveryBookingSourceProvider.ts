import { extractPublicContactSignals } from "../contactExtraction.js";
import { matchBookingGenres } from "../genreMatching.js";
import { normalizeBookingSource } from "../normalizeBookingTarget.js";
import type { BookingSearchInput, BookingTarget, BookingTargetCategory, RawBookingSource } from "../types.js";
import type { WebExtractProvider } from "../../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../../providers/web/WebSearchProvider.js";
import type { SimilarArtist } from "../../schemas.js";
import { getSupportSlotRelatedGenres } from "./SimilarArtistLiveHistoryBookingSourceProvider.js";
import type { BookingSourceProvider } from "./BookingSourceProvider.js";

// Venue/organization discovery is intentionally decoupled from event discovery
// (issue #168): it searches for recurring live-music places and organizations
// (venues, bars, SMACs, associations, collectives, promoters, cultural
// centers), not individual announced shows, so it must not require an
// eventDate to produce results (see relevance.ts isEvergreenOrganizationCategory).

export interface VenueDiscoveryProviderOptions {
  webSearchProvider: WebSearchProvider;
  webExtractProvider?: WebExtractProvider | null;
  maxOrganizationQueries?: number;
  maxSimilarArtistVenueQueries?: number;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
}

// Required for every candidate: without at least one of these signals a
// name that merely sounds musical ("Rock Café") must not be classified as a
// venue (acceptance criterion: no venue from name/keyword alone).
const LIVE_MUSIC_EVIDENCE_PATTERN =
  /\b(concert|concerts|live music|musique live|programmation|scène|scene|booking|salle de concert|salle de musiques actuelles|smac|gig|gigs|show|shows|line-?up|café-concert|cafe-concert|showcase)\b/i;

const CAPACITY_PATTERN = /(\d{2,5})\s*[- ]?\s*(places?|pers(?:onnes)?|capacity|capacit[ée]|seats|jauge)/i;
const EMERGING_BOOKING_SIGNAL_PATTERN =
  /\b(jeunes? talents?|jeunes? artistes?|d[ée]couvertes?|emerging artists?|nouveaux? talents?|premi[eè]re partie|first-time bands?|unsigned)\b/i;
const SMAC_PATTERN = /\b(smac|salle de musiques actuelles)\b/i;

export function buildVenueDiscoveryQueries(genre: string, city: string, country: string): string[] {
  const relatedGenres = getSupportSlotRelatedGenres(genre);
  const primary = relatedGenres[0] ?? genre;
  const secondary = relatedGenres[1] ?? genre;
  const queries = [
    `${primary} venues ${city}`,
    `${primary} concert venue ${city}`,
    `${secondary} association ${city}`,
    `live music bar ${city} ${primary}`,
    `${primary} club programmation ${city}`,
    `SMAC ${city} ${primary}`,
    `salle de musiques actuelles ${city} ${primary} programmation`,
    `centre culturel ${city} concerts ${primary}`,
    `collectif concerts ${primary} ${city}`,
    `promoteur concerts ${primary} ${city}`,
    `small venues ${city} programming ${primary} ${secondary}`,
    `SMAC ${country} ${primary} programmation`,
    `association ${primary} ${country} concerts`,
    `${primary} venues ${country}`
  ];
  return [...new Set(queries)];
}

export function buildSimilarArtistVenueQueries(artistName: string, location: string): string[] {
  return [
    `"${artistName}" venue ${location}`,
    `"${artistName}" salle ${location}`,
    `venues where "${artistName}" played`
  ];
}

// Returns null (instead of defaulting to "venue") when there is no genuine
// evidence of live-music activity, so unrelated results are dropped rather
// than misclassified.
export function classifyVenueDiscoveryCategory(text: string): BookingTargetCategory | null {
  const normalized = text.toLowerCase();
  if (!LIVE_MUSIC_EVIDENCE_PATTERN.test(normalized)) {
    return null;
  }
  if (/\b(festival|fest|open air)\b/.test(normalized)) return "festival";
  if (/\b(collectif|collective)\b/.test(normalized)) return "collective";
  if (/\b(association|assos?)\b/.test(normalized)) return "association";
  if (/\b(promoteur|tourneur|programmateur|booking agency|agence de booking)\b/.test(normalized)) return "promoter";
  if (/\b(bar|caf[ée]-concert|pub)\b/.test(normalized)) return "bar";
  if (/\b(smac|salle de musiques actuelles|club|salle de concert|concert hall|centre culturel|cultural cent(?:er|re)|centre socioculturel|venue|salle)\b/.test(normalized)) {
    return "venue";
  }
  return null;
}

function venueSourceTypeForCategory(category: BookingTargetCategory): RawBookingSource["sourceType"] {
  if (category === "promoter") return "promoter_official_page";
  if (category === "festival") return "festival_official_page";
  return "venue_official_programming_page";
}

export function buildVenueDiscoveryBookingSourceProvider(
  options: VenueDiscoveryProviderOptions
): BookingSourceProvider {
  return {
    providerName: `venue_discovery:${options.webSearchProvider.providerName}`,
    async search({ input, maxResults }) {
      const city = input.city;
      const country = input.artistProfile?.country ?? "France";
      const organizationQueries = buildVenueDiscoveryQueries(input.genre, city, country)
        .slice(0, options.maxOrganizationQueries ?? 10);
      const similarArtists = (input.similarArtists ?? []).slice(0, 4);
      const similarArtistQueries = similarArtists
        .flatMap((artist) => buildSimilarArtistVenueQueries(artist.name, city))
        .slice(0, options.maxSimilarArtistVenueQueries ?? 6);
      const queries = [...organizationQueries, ...similarArtistQueries];

      const rawSources: RawBookingSource[] = [];
      const extractUrls = new Set<string>();
      let droppedForMissingEvidence = 0;

      for (const query of queries) {
        const results = await options.webSearchProvider.search(query, {
          limit: Math.min(options.maxResultsPerQuery ?? 4, maxResults ?? input.limit)
        });
        for (const result of results) {
          const built = webResultToVenueSource(input, result, city, country);
          if (!built) {
            droppedForMissingEvidence += 1;
            continue;
          }
          rawSources.push(built);
          if (result.url) {
            extractUrls.add(result.url);
          }
        }
      }

      if (options.webExtractProvider) {
        for (const url of [...extractUrls].slice(0, options.maxExtractPages ?? 6)) {
          const extracted = await options.webExtractProvider.extract(url);
          if (!extracted) {
            continue;
          }
          const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ");
          const built = textToVenueSource(input, {
            title: extracted.title,
            url,
            text,
            confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.72 : 0.5
          }, city, country, []);
          if (built) {
            rawSources.push(built);
          } else {
            droppedForMissingEvidence += 1;
          }
        }
      }

      const targets = rawSources.flatMap((source) => {
        const normalized = normalizeBookingSource(source);
        return normalized ? [attachVenueEvidence(normalized, input.similarArtists ?? [])] : [];
      });

      return {
        targets,
        sourceProvider: `venue_discovery:${options.webSearchProvider.providerName}`,
        searchedQueries: queries,
        warnings: targets.length === 0
          ? [`${options.webSearchProvider.providerName} venue discovery returned no verifiable venue/organization candidates.`]
          : [],
        metadata: {
          searchProvider: options.webSearchProvider.providerName,
          extractProvider: options.webExtractProvider?.providerName ?? null,
          organizationQueryCount: organizationQueries.length,
          similarArtistQueryCount: similarArtistQueries.length,
          rawCandidateCount: rawSources.length,
          droppedForMissingEvidence,
          keptTargets: targets.length
        }
      };
    }
  };
}

function webResultToVenueSource(
  input: BookingSearchInput,
  result: WebSearchResult,
  fallbackCity: string,
  fallbackCountry: string
): RawBookingSource | null {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  return textToVenueSource(input, {
    title: result.title,
    url: result.url,
    text,
    confidence: Math.max(0.4, result.confidence * 0.75)
  }, fallbackCity, fallbackCountry, result.links ?? []);
}

function textToVenueSource(
  input: BookingSearchInput,
  page: { title: string | null; url: string | null; text: string; confidence: number },
  fallbackCity: string,
  fallbackCountry: string,
  links: string[]
): RawBookingSource | null {
  const category = classifyVenueDiscoveryCategory(page.text);
  if (!category) {
    return null;
  }

  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], page.text);
  const capacityMatch = page.text.match(CAPACITY_PATTERN);
  const estimatedCapacity = capacityMatch ? Number.parseInt(capacityMatch[1], 10) : null;
  const contacts = extractPublicContactSignals(page.text, links);
  const subtypeNote = SMAC_PATTERN.test(page.text) ? "Venue subtype detected: SMAC (salle de musiques actuelles)." : null;
  const emergingNote = EMERGING_BOOKING_SIGNAL_PATTERN.test(page.text)
    ? "Evidence that emerging/unsigned artists are regularly booked."
    : null;

  return {
    name: page.title ?? page.url ?? "Venue discovery result",
    category,
    url: page.url,
    sourceUrl: page.url,
    sourceType: venueSourceTypeForCategory(category),
    sourceProvider: "venue_discovery",
    city: fallbackCity,
    country: fallbackCountry,
    text: [page.text, subtypeNote, emergingNote].filter(Boolean).join(" "),
    snippet: page.text.slice(0, 280),
    links,
    genres: genreMatch.matchedGenres,
    estimatedCapacity: Number.isFinite(estimatedCapacity) && (estimatedCapacity ?? 0) > 0 ? estimatedCapacity : null,
    contacts,
    confidence: page.confidence,
    // Deliberately no eventDate: this candidate represents a recurring
    // venue/organization, not a specific show.
    eventDate: null
  };
}

function attachVenueEvidence(target: BookingTarget, similarArtists: SimilarArtist[]): BookingTarget {
  const mentioned = findMentionedSimilarArtists(target.description ?? "", similarArtists);
  return {
    ...target,
    sourceProvider: target.sourceProvider ?? "venue_discovery",
    pastProgramming: uniqueStrings([
      ...(target.pastProgramming ?? []),
      ...mentioned.map((artist) => artist.name)
    ]),
    derivedFromSimilarArtist: mentioned[0]
      ? {
          name: mentioned[0].name,
          popularityComparison: "unknown",
          matchedGenres: target.genres,
          sourceUrl: target.sourceUrl
        }
      : target.derivedFromSimilarArtist ?? null,
    evidence: uniqueStrings([
      ...target.evidence,
      "Discovered via venue/organization-focused search, independent of any announced event.",
      mentioned.length > 0 ? `Similar artist history match: ${mentioned.map((artist) => artist.name).join(", ")}.` : ""
    ])
  };
}

function findMentionedSimilarArtists(text: string, similarArtists: SimilarArtist[]): SimilarArtist[] {
  const lower = text.toLowerCase();
  return similarArtists.filter((artist) => artist.name.trim().length > 2 && lower.includes(artist.name.trim().toLowerCase()));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
