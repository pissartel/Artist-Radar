import { randomUUID } from "node:crypto";
import { extractPublicContactSignals, pickBestContact } from "../booking/contactExtraction.js";
import { matchBookingGenres } from "../booking/genreMatching.js";
import { buildDefaultWebExtractProvider, FallbackSearchProvider, getEnabledBookingSearchProviders, type WebProviderEnv } from "../providers/web/providers.js";
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
  classifyPotentialBookerEntityType,
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
import type { BookerDiscoveryMode, BookerDiscoveryStrategy, BookerGeographicRelevance, BookerSearchInput, RawBookerCandidate } from "./types.js";
import { debugLog, warnLog } from "../utils/logger.js";
import { OpenAIBookerSearchProvider } from "./OpenAIBookerSearchProvider.js";

export interface DiscoverBookerOpportunitiesOptions {
  webSearchProvider: WebSearchProvider | null;
  webExtractProvider?: WebExtractProvider | null;
  maxQueriesPerStrategy?: number;
  maxSimilarArtists?: number;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
  maxTotalQueries?: number;
  curatedSearchProvider?: WebSearchProvider | null;
  now?: Date;
}

export interface BookerDiscoveryResult {
  opportunities: GenericOpportunity[];
  searchedQueries: string[];
  warnings: string[];
  metadata: {
    mode: BookerDiscoveryMode;
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
  const mode = input.mode ?? "lightweight";
  const emptyResult: BookerDiscoveryResult = {
    opportunities: [],
    searchedQueries: [],
    warnings: [],
    metadata: {
      mode,
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
  const maxQueriesPerStrategy = options.maxQueriesPerStrategy ?? (mode === "lightweight" ? 2 : 6);
  const similarArtists = selectBookerSeedArtists(input, options.maxSimilarArtists ?? (mode === "lightweight" ? 6 : 20));

  const queriesByStrategy: Array<{ strategy: BookerDiscoveryStrategy; queries: string[] }> = [
    {
      strategy: "similar_artist_representation",
      queries: similarArtists.flatMap((artist) => buildSimilarArtistBookerQueries(artist.name)).slice(0, maxQueriesPerStrategy)
    },
    { strategy: "genre_specialization", queries: buildGenreBookerQueries(input.genre, country).slice(0, maxQueriesPerStrategy) },
    { strategy: "geographic", queries: buildGeographicBookerQueries(input.genre, input.city, country).slice(0, maxQueriesPerStrategy) },
    { strategy: "directory", queries: buildBookerDirectoryQueries(input.genre, country).slice(0, maxQueriesPerStrategy) }
  ];
  const queryBudget = options.maxTotalQueries
    ?? (options.maxQueriesPerStrategy !== undefined ? Number.MAX_SAFE_INTEGER : mode === "lightweight" ? 4 : 18);
  const queries = queriesByStrategy
    .flatMap(({ strategy, queries }) => queries.map((query) => ({ strategy, query })))
    .slice(0, queryBudget);

  const rawCandidates: RawBookerCandidate[] = [];
  const extractionSeeds: RawBookerCandidate[] = [];
  const searchedQueries: string[] = [];
  const strategyCandidateCounts = emptyStrategyCounts();
  const providerWarnings: string[] = [];
  let droppedForMissingEvidence = 0;

  if (options.curatedSearchProvider) {
    try {
      const curatedResults = await options.curatedSearchProvider.search(buildCuratedBookerBrief(input, similarArtists), {
        limit: mode === "lightweight" ? 4 : Math.min(input.limit, 15)
      });
      for (const result of curatedResults) {
        const candidate = webResultToBookerCandidate(result, "genre_specialization");
        if (candidate) {
          rawCandidates.push(candidate);
          strategyCandidateCounts.genre_specialization += 1;
        }
      }
    } catch (error) {
      providerWarnings.push(`OpenAI curated booker search failed: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }

  const supplementalQueries = rawCandidates.length >= (mode === "lightweight" ? 1 : 6) ? [] : queries;
  for (const { strategy, query } of supplementalQueries) {
      searchedQueries.push(query);
      let results: WebSearchResult[];
      try {
        results = await webSearchProvider.search(query, {
          limit: Math.min(options.maxResultsPerQuery ?? (mode === "lightweight" ? 3 : 8), input.limit)
        });
        debugLog("bookers", "booker search query completed", {
          provider: webSearchProvider.providerName,
          strategy,
          query,
          rawResultCount: results.length
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
          const extractionSeed = webResultToExtractionSeed(result, strategy);
          if (extractionSeed) {
            extractionSeeds.push(extractionSeed);
            debugLog("bookers", "booker candidate queued for extraction", {
              strategy,
              query,
              title: result.title ?? null,
              url: result.url ?? null,
              inferredEntityType: extractionSeed.entityType
            });
          }
          debugLog("bookers", "booker candidate dropped for missing representation evidence", {
            strategy,
            query,
            title: result.title ?? null,
            url: result.url ?? null,
            snippet: result.snippet?.slice(0, 240) ?? null
          });
          continue;
        }
        rawCandidates.push(candidate);
        strategyCandidateCounts[strategy] += 1;
      }
  }

  if (options.webExtractProvider) {
    const extractionCandidatesByUrl = new Map<string, { candidate: RawBookerCandidate; isSeed: boolean }>();
    for (const candidate of rawCandidates) {
      if (candidate.url) {
        extractionCandidatesByUrl.set(candidate.url, { candidate, isSeed: false });
      }
    }
    for (const candidate of extractionSeeds) {
      if (candidate.url && !extractionCandidatesByUrl.has(candidate.url)) {
        extractionCandidatesByUrl.set(candidate.url, { candidate, isSeed: true });
      }
    }

    const extractUrls = [...extractionCandidatesByUrl.keys()]
      .slice(0, options.maxExtractPages ?? (mode === "lightweight" ? 6 : 20));
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
        debugLog("bookers", "booker extracted page rejected for missing representation evidence", {
          url,
          title: extracted.title ?? null
        });
        continue;
      }
      const existingEntry = extractionCandidatesByUrl.get(url);
      const existing = existingEntry?.candidate;
      rawCandidates.push({
        name: extracted.title ?? existing?.name ?? url,
        url,
        sourceName: "booker_discovery_extract",
        strategy: existing?.strategy ?? "genre_specialization",
        entityType,
        text,
        links: extracted.links ?? existing?.links ?? [],
        confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.75 : 0.55
      });
      if (existingEntry?.isSeed && existing) {
        strategyCandidateCounts[existing.strategy] += 1;
      }
      debugLog("bookers", "booker extracted page accepted", {
        url,
        title: extracted.title ?? null,
        entityType,
        strategy: existing?.strategy ?? "genre_specialization"
      });
    }
  }

  const deduped = dedupeCandidates(rawCandidates);
  const now = options.now ?? new Date();
  let droppedForInactivity = 0;
  const opportunities: GenericOpportunity[] = [];

  for (const candidate of deduped) {
    if (!isProfessionalCandidatePage(candidate)) continue;
    const activity = extractBookerActivityStatus(candidate.text, now);
    if (activity.isActive === false) {
      droppedForInactivity += 1;
      continue;
    }
    const opportunity = buildBookerOpportunity(input, candidate, activity);
    if (!isCompatibleWithArtistScaleAndMarket(input, opportunity)) continue;
    if ((opportunity.compatibilityScore ?? 0) < 55) continue;
    opportunities.push(opportunity);
  }

  opportunities.sort((left, right) => (right.compatibilityScore ?? 0) - (left.compatibilityScore ?? 0));
  const limited = opportunities.slice(0, mode === "lightweight" ? Math.min(input.limit, 4) : input.limit);

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
      mode,
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

function webResultToExtractionSeed(result: WebSearchResult, strategy: BookerDiscoveryStrategy): RawBookerCandidate | null {
  if (!result.url) {
    return null;
  }
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  const entityType = classifyPotentialBookerEntityType(text);
  if (!entityType) {
    return null;
  }
  return {
    name: result.title ?? result.url,
    url: result.url,
    sourceName: "booker_discovery_search_seed",
    strategy,
    entityType,
    text,
    links: result.links ?? [],
    confidence: Math.max(0.25, result.confidence * 0.45)
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

  const isDomestic = geographicScope === "local" || geographicScope === "national";
  const city = geographicScope === "local" ? input.city : null;
  const country = isDomestic
    ? (input.artistProfile?.country ?? input.target ?? null)
    : geographicScope === "international"
      ? findMentionedKnownCountry(candidate.text)
      : null;
  const territory =
    isDomestic ? country
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

function isCompatibleWithArtistScaleAndMarket(input: BookerSearchInput, opportunity: GenericOpportunity): boolean {
  const artistLevel = input.artistProfile?.estimatedLevel ?? "unknown";
  if (artistLevel === "emerging" && opportunity.audienceLevel === "large") return false;
  if (opportunity.geographicScope === "international") return false;
  if (
    artistLevel === "emerging"
    && opportunity.geographicScope === "unknown"
    && opportunity.sources.some((source) => source.name === "openai_booker_web_search")
  ) return false;
  if (
    input.mode === "deep"
    && artistLevel === "emerging"
    && opportunity.geographicScope === "unknown"
    && (opportunity.booker?.representedSimilarArtists.length ?? 0) === 0
  ) return false;
  return true;
}

function isProfessionalCandidatePage(candidate: RawBookerCandidate): boolean {
  if (candidate.strategy === "directory") return false;
  const title = candidate.name.toLowerCase();
  return !/(annuaire|directory|guide|how to|state of play|état des lieux|liste des|list of)/i.test(title);
}

function buildCuratedBookerBrief(input: BookerSearchInput, similarArtists: ReturnType<typeof selectBookerSeedArtists>): string {
  return [
    `Artist: ${input.artist}`,
    `Artist level: ${input.artistProfile?.estimatedLevel ?? "unknown"}`,
    `Target country: ${input.artistProfile?.country ?? input.target ?? "unknown"}`,
    `City: ${input.city}`,
    `Genres: ${[input.genre, ...(input.artistProfile?.genres ?? [])].join(", ")}`,
    `Comparable artists: ${similarArtists.map((artist) => `${artist.name} (${artist.artistTier})`).join(", ") || "none"}`
  ].join("\n");
}

function selectBookerSeedArtists(input: BookerSearchInput, limit: number) {
  const artistLevel = input.artistProfile?.estimatedLevel ?? "unknown";
  return (input.similarArtists ?? [])
    .filter((artist) => artist.bookingCategory !== "reference")
    .filter((artist) => artistLevel !== "emerging" || artist.artistTier !== "large")
    .slice(0, limit);
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
  if (mentionsDifferentKnownCountry(lower, country)) {
    return "international";
  }
  if (country && lower.includes(country)) {
    return "national";
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

export function buildDefaultBookerDiscoveryOptions(
  env: WebProviderEnv = process.env,
  curatedModel?: string
): DiscoverBookerOpportunitiesOptions {
  const webSearchProviders = getEnabledBookingSearchProviders(env);
  return {
    webSearchProvider: webSearchProviders.length > 0 ? new FallbackSearchProvider(webSearchProviders) : null,
    webExtractProvider: buildDefaultWebExtractProvider(env),
    curatedSearchProvider: env.OPENAI_API_KEY && env.ENABLE_OPENAI_BOOKER_DISCOVERY !== "false"
      ? new OpenAIBookerSearchProvider(env.OPENAI_API_KEY, curatedModel)
      : null,
    maxQueriesPerStrategy: undefined,
    maxSimilarArtists: undefined,
    maxResultsPerQuery: undefined,
    maxExtractPages: undefined,
    maxTotalQueries: undefined
  };
}
