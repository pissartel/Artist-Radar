import { randomUUID } from "node:crypto";
import { extractPublicContactSignals, pickBestContact } from "../booking/contactExtraction.js";
import { matchBookingGenres } from "../booking/genreMatching.js";
import { buildDefaultWebExtractProvider, getEnabledBookingSearchProviders, type WebProviderEnv } from "../providers/web/providers.js";
import type { WebExtractProvider } from "../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../providers/web/WebSearchProvider.js";
import type { GenericOpportunity } from "../schemas.js";
import {
  buildGenreBookerQueries,
  buildGeographicBookerQueries,
  buildBookerDirectoryQueries,
  buildSimilarArtistBookerQueries
} from "./bookerDiscoveryQueries.js";
import {
  classifyBookerEntityType,
  extractBookerActivityStatus,
  extractBookerAudienceLevel,
  extractBookerRoster,
  extractBookerSubmissionPolicy,
  findMentionedSimilarArtists,
  hasVenueNetworkEvidence,
  isInternationallyOpen,
  worksWithEmergingActs
} from "./bookerSignalExtraction.js";
import { scoreBookerCompatibility } from "./scoreBookerCompatibility.js";
import type { BookerDiscoveryStrategy, BookerGeographicRelevance, BookerSearchInput, RawBookerCandidate } from "./types.js";
import { warnLog } from "../utils/logger.js";

export interface DiscoverBookerOpportunitiesOptions {
  webSearchProvider: WebSearchProvider | null;
  webExtractProvider?: WebExtractProvider | null;
  maxQueriesPerStrategy?: number;
  maxSimilarArtists?: number;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
  now?: Date;
}

export interface BookerDiscoveryResult {
  opportunities: GenericOpportunity[];
  searchedQueries: string[];
  warnings: string[];
  metadata: {
    rawCandidateCount: number;
    droppedForMissingEvidence: number;
    droppedForInactivity: number;
    keptOpportunities: number;
    strategyCandidateCounts: Record<BookerDiscoveryStrategy, number>;
  };
}

export async function discoverBookerOpportunities(
  input: BookerSearchInput,
  options: DiscoverBookerOpportunitiesOptions
): Promise<BookerDiscoveryResult> {
  const emptyResult: BookerDiscoveryResult = {
    opportunities: [],
    searchedQueries: [],
    warnings: [],
    metadata: {
      rawCandidateCount: 0,
      droppedForMissingEvidence: 0,
      droppedForInactivity: 0,
      keptOpportunities: 0,
      strategyCandidateCounts: emptyStrategyCounts()
    }
  };

  if (!options.webSearchProvider) {
    return { ...emptyResult, warnings: ["No web search provider is enabled; booker discovery was skipped."] };
  }

  const webSearchProvider = options.webSearchProvider;
  const country = input.artistProfile?.country ?? input.target ?? "";
  const maxQueriesPerStrategy = options.maxQueriesPerStrategy ?? 6;
  const similarArtists = (input.similarArtists ?? []).slice(0, options.maxSimilarArtists ?? 4);

  const queriesByStrategy: Array<{ strategy: BookerDiscoveryStrategy; queries: string[] }> = [
    { strategy: "genre_specialization", queries: buildGenreBookerQueries(input.genre, country).slice(0, maxQueriesPerStrategy) },
    {
      strategy: "similar_artist_representation",
      queries: similarArtists.flatMap((artist) => buildSimilarArtistBookerQueries(artist.name)).slice(0, maxQueriesPerStrategy)
    },
    { strategy: "geographic", queries: buildGeographicBookerQueries(input.genre, input.city, country).slice(0, maxQueriesPerStrategy) },
    { strategy: "directory", queries: buildBookerDirectoryQueries(input.genre, country).slice(0, maxQueriesPerStrategy) }
  ];

  const rawCandidates: RawBookerCandidate[] = [];
  const searchedQueries: string[] = [];
  const strategyCandidateCounts = emptyStrategyCounts();
  const providerWarnings: string[] = [];
  let droppedForMissingEvidence = 0;

  for (const { strategy, queries } of queriesByStrategy) {
    for (const query of queries) {
      searchedQueries.push(query);
      let results: WebSearchResult[];
      try {
        results = await webSearchProvider.search(query, {
          limit: Math.min(options.maxResultsPerQuery ?? 4, input.limit)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        providerWarnings.push(`${webSearchProvider.providerName} booker search failed for query "${query}": ${message}.`);
        continue;
      }
      for (const result of results) {
        const candidate = webResultToBookerCandidate(result, strategy);
        if (!candidate) {
          droppedForMissingEvidence += 1;
          continue;
        }
        rawCandidates.push(candidate);
        strategyCandidateCounts[strategy] += 1;
      }
    }
  }

  if (options.webExtractProvider) {
    const extractUrls = [...new Set(rawCandidates.map((candidate) => candidate.url).filter((url): url is string => Boolean(url)))]
      .slice(0, options.maxExtractPages ?? 6);
    for (const url of extractUrls) {
      let extracted;
      try {
        extracted = await options.webExtractProvider.extract(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        providerWarnings.push(`${options.webExtractProvider.providerName} booker extraction failed for ${url}: ${message}.`);
        continue;
      }
      if (!extracted) {
        continue;
      }
      const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ");
      const entityType = classifyBookerEntityType(text);
      if (!entityType) {
        continue;
      }
      const existing = rawCandidates.find((candidate) => candidate.url === url);
      rawCandidates.push({
        name: extracted.title ?? existing?.name ?? url,
        url,
        sourceName: "booker_discovery_extract",
        strategy: existing?.strategy ?? "genre_specialization",
        entityType,
        text,
        links: [],
        confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.75 : 0.55
      });
    }
  }

  const deduped = dedupeCandidates(rawCandidates);
  const now = options.now ?? new Date();
  let droppedForInactivity = 0;
  const opportunities: GenericOpportunity[] = [];

  for (const candidate of deduped) {
    const activity = extractBookerActivityStatus(candidate.text, now);
    if (activity.isActive === false) {
      droppedForInactivity += 1;
      continue;
    }
    opportunities.push(buildBookerOpportunity(input, candidate, activity));
  }

  opportunities.sort((left, right) => (right.compatibilityScore ?? 0) - (left.compatibilityScore ?? 0));
  const limited = opportunities.slice(0, input.limit);

  logBookerDiscoverySummary(strategyCandidateCounts, droppedForMissingEvidence, droppedForInactivity, limited.length);

  const warnings = [...providerWarnings];
  if (limited.length === 0) {
    warnings.push(`${webSearchProvider.providerName} booker discovery returned no verifiable booker/agency/promoter candidates.`);
  }

  return {
    opportunities: limited,
    searchedQueries,
    warnings,
    metadata: {
      rawCandidateCount: rawCandidates.length,
      droppedForMissingEvidence,
      droppedForInactivity,
      keptOpportunities: limited.length,
      strategyCandidateCounts
    }
  };
}

function webResultToBookerCandidate(result: WebSearchResult, strategy: BookerDiscoveryStrategy): RawBookerCandidate | null {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  const entityType = classifyBookerEntityType(text);
  if (!entityType) {
    return null;
  }
  return {
    name: result.title ?? result.url ?? "Booker discovery result",
    url: result.url,
    sourceName: "booker_discovery",
    strategy,
    entityType,
    text,
    links: result.links ?? [],
    confidence: Math.max(0.4, result.confidence * 0.75)
  };
}

function buildBookerOpportunity(
  input: BookerSearchInput,
  candidate: RawBookerCandidate,
  activity: { isActive: boolean | null; evidence: string | null }
): GenericOpportunity {
  const similarArtists = input.similarArtists ?? [];
  const matchedSimilarArtists = findMentionedSimilarArtists(candidate.text, similarArtists);
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], candidate.text);
  const roster = extractBookerRoster(candidate.text);
  const submissionPolicy = extractBookerSubmissionPolicy(candidate.text, candidate.links);
  const audienceLevel = extractBookerAudienceLevel(candidate.text, matchedSimilarArtists);
  const geographicScope = classifyGeographicScope(candidate.text, input);
  const venueNetwork = hasVenueNetworkEvidence(candidate.text);
  const emergingActsSignal = worksWithEmergingActs(candidate.text);
  const contacts = extractPublicContactSignals(candidate.text, candidate.links);
  const bestEmail = contacts.find((contact) => contact.type === "email") ?? null;
  const bestContactForm = pickBestContact(contacts.filter((contact) => contact.type === "contact_form"));

  const compatibility = scoreBookerCompatibility(input, {
    genres: genreMatch.matchedGenres,
    text: candidate.text,
    matchedSimilarArtists,
    audienceLevel,
    geographicScope,
    acceptsSubmissions: submissionPolicy.acceptsSubmissions,
    isActive: activity.isActive,
    hasVenueNetwork: venueNetwork,
    worksWithEmergingActs: emergingActsSignal
  });

  const isLocal = geographicScope === "local" || geographicScope === "national";
  const city = isLocal ? input.city : null;
  const country = isLocal
    ? (input.artistProfile?.country ?? input.target ?? null)
    : geographicScope === "international"
      ? findMentionedKnownCountry(candidate.text)
      : null;
  const territory =
    isLocal ? country
    : geographicScope === "remote_compatible" ? "international (remote-compatible)"
    : geographicScope === "international" ? country
    : null;

  return {
    id: randomUUID(),
    name: candidate.name,
    opportunityType: candidate.entityType,
    shortDescription: candidate.text.slice(0, 280),
    city,
    country,
    geographicScope: mapGeographicScope(geographicScope),
    websiteUrl: candidate.url,
    sourceUrl: candidate.url,
    contactPageUrl: toAbsoluteUrlOrNull(bestContactForm?.value ?? null),
    publicEmail: bestEmail?.value ?? null,
    socialLinks: {},
    associatedArtists: matchedSimilarArtists.map((artist) => artist.name),
    associatedGenres: genreMatch.matchedGenres,
    audienceLevel,
    status: submissionPolicy.acceptsSubmissions === true ? "open" : submissionPolicy.acceptsSubmissions === false ? "closed" : "unknown",
    applicationUrl: submissionPolicy.submissionUrl,
    sources: [{
      name: candidate.sourceName,
      url: candidate.url,
      confidence: clampConfidence(candidate.confidence)
    }],
    lastVerifiedAt: null,
    confidenceScore: clampConfidence(candidate.confidence),
    compatibilityScore: compatibility.score,
    compatibilityExplanation: compatibility.explanation,
    dataCompleteness: null,
    booker: {
      representedSimilarArtists: matchedSimilarArtists.map((artist) => artist.name),
      roster,
      bookerGenres: genreMatch.matchedGenres,
      territory,
      acceptsSubmissions: submissionPolicy.acceptsSubmissions,
      submissionUrl: submissionPolicy.submissionUrl,
      isActive: activity.isActive
    }
  };
}

// Only common country names are checked here; anything not on the list is
// left as "unknown" rather than guessed, per AGENTS.md.
const KNOWN_COUNTRIES = [
  "france", "germany", "united kingdom", "uk", "united states", "usa",
  "belgium", "spain", "italy", "netherlands", "canada", "australia",
  "switzerland", "portugal", "sweden", "norway", "denmark", "ireland",
  "austria", "poland", "japan", "brazil"
];

function classifyGeographicScope(text: string, input: BookerSearchInput): BookerGeographicRelevance {
  const lower = text.toLowerCase();
  const city = input.city.trim().toLowerCase();
  const country = (input.artistProfile?.country ?? input.target ?? "").trim().toLowerCase();

  if (city && lower.includes(city)) {
    return "local";
  }
  if (isInternationallyOpen(text)) {
    return "remote_compatible";
  }
  if (country && lower.includes(country)) {
    return "national";
  }
  if (mentionsDifferentKnownCountry(lower, country)) {
    return "international";
  }
  return "unknown";
}

function mentionsDifferentKnownCountry(lowerText: string, artistCountry: string): boolean {
  return KNOWN_COUNTRIES.some((candidateCountry) => candidateCountry !== artistCountry && lowerText.includes(candidateCountry));
}

// Capitalizes the matched country name for display (the constant list is
// lowercase for case-insensitive matching against the source text).
function findMentionedKnownCountry(text: string): string | null {
  const lower = text.toLowerCase();
  const match = KNOWN_COUNTRIES.find((candidateCountry) => lower.includes(candidateCountry));
  if (!match) {
    return null;
  }
  return match.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function mapGeographicScope(scope: BookerGeographicRelevance): "local" | "national" | "international" | "online" | "unknown" {
  if (scope === "remote_compatible") return "online";
  return scope;
}

function dedupeCandidates(candidates: RawBookerCandidate[]): RawBookerCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.url ?? ""}:${candidate.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function emptyStrategyCounts(): Record<BookerDiscoveryStrategy, number> {
  return {
    similar_artist_representation: 0,
    genre_specialization: 0,
    geographic: 0,
    directory: 0
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function toAbsoluteUrlOrNull(value: string | null): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function logBookerDiscoverySummary(
  strategyCounts: Record<BookerDiscoveryStrategy, number>,
  droppedForMissingEvidence: number,
  droppedForInactivity: number,
  keptCount: number
): void {
  warnLog("bookers", [
    "Booker discovery summary:",
    `- Similar-artist-representation candidates: ${strategyCounts.similar_artist_representation}`,
    `- Genre-specialization candidates: ${strategyCounts.genre_specialization}`,
    `- Geographic candidates: ${strategyCounts.geographic}`,
    `- Directory candidates: ${strategyCounts.directory}`,
    `- Dropped for missing representation/booking evidence: ${droppedForMissingEvidence}`,
    `- Dropped for confirmed inactivity: ${droppedForInactivity}`,
    `- Kept booker/agency/promoter opportunities: ${keptCount}`
  ].join("\n"));
}

export function buildDefaultBookerDiscoveryOptions(env: WebProviderEnv = process.env): DiscoverBookerOpportunitiesOptions {
  const webSearchProviders = getEnabledBookingSearchProviders(env);
  return {
    webSearchProvider: webSearchProviders[0] ?? null,
    webExtractProvider: buildDefaultWebExtractProvider(env),
    maxQueriesPerStrategy: 6,
    maxSimilarArtists: 4,
    maxResultsPerQuery: 4,
    maxExtractPages: 6
  };
}
