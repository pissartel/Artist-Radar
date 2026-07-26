import { randomUUID } from "node:crypto";
import { extractPublicContactSignals, pickBestContact } from "../booking/contactExtraction.js";
import { matchBookingGenres } from "../booking/genreMatching.js";
import { buildDefaultWebExtractProvider, getEnabledBookingSearchProviders, type WebProviderEnv } from "../providers/web/providers.js";
import type { WebExtractProvider } from "../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../providers/web/WebSearchProvider.js";
import type { GenericOpportunity } from "../schemas.js";
import { mergeAndDeduplicateLabelCandidates } from "./labelCandidateMerge.js";
import {
  buildGenreLabelQueries,
  buildGeographicLabelQueries,
  buildLabelDirectoryQueries,
  buildSimilarArtistLabelQueries
} from "./labelDiscoveryQueries.js";
import {
  classifyLabelEvidence,
  extractLabelActivityStatus,
  extractLabelDemoPolicy,
  extractLabelDistributor,
  extractLabelRosterAudienceLevel,
  findMentionedSimilarArtists,
  isInternationallyOpen
} from "./labelSignalExtraction.js";
import { enrichLabelCandidatesFromOfficialSources, type OfficialSourceEnrichmentEnv } from "./officialSourceEnrichment.js";
import {
  discoverLabelCandidatesFromMusicBrainz,
  isMusicBrainzLabelDiscoveryEnabled,
  type MusicBrainzLabelProviderEnv
} from "./providers/MusicBrainzLabelProvider.js";
import { enrichLabelCandidatesWithDiscogs, isDiscogsLabelEnrichmentEnabled, type DiscogsLabelProviderEnv } from "./providers/DiscogsLabelProvider.js";
import { scoreLabelCompatibility } from "./scoreLabelCompatibility.js";
import type { LabelDiscoveryStrategy, LabelGeographicRelevance, LabelSearchInput, RawLabelCandidate } from "./types.js";
import { warnLog } from "../utils/logger.js";

type StructuredCandidateResult = { candidates: RawLabelCandidate[]; warnings: string[] };

export interface DiscoverLabelOpportunitiesOptions {
  webSearchProvider: WebSearchProvider | null;
  webExtractProvider?: WebExtractProvider | null;
  maxQueriesPerStrategy?: number;
  maxSimilarArtists?: number;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
  now?: Date;
  // Issue #195: structured discovery/enrichment steps, additive on top of
  // the PR #181 web-search flow above. Each is opt-in (undefined = skipped)
  // so direct callers/tests that don't pass them keep the exact PR #181
  // behaviour; buildDefaultLabelDiscoveryOptions() below is the one place
  // that wires the real providers from environment configuration for
  // production use.
  discoverMusicBrainzCandidates?: (input: LabelSearchInput) => Promise<StructuredCandidateResult>;
  enrichWithDiscogs?: (candidates: RawLabelCandidate[]) => Promise<StructuredCandidateResult>;
  enrichFromOfficialSources?: (candidates: RawLabelCandidate[]) => Promise<StructuredCandidateResult>;
}

type LabelDiscoveryEnv = WebProviderEnv & MusicBrainzLabelProviderEnv & DiscogsLabelProviderEnv & OfficialSourceEnrichmentEnv;

export interface LabelDiscoveryResult {
  opportunities: GenericOpportunity[];
  searchedQueries: string[];
  warnings: string[];
  metadata: {
    rawCandidateCount: number;
    droppedForMissingEvidence: number;
    droppedForInactivity: number;
    keptOpportunities: number;
    strategyCandidateCounts: Record<LabelDiscoveryStrategy, number>;
  };
}

export async function discoverLabelOpportunities(
  input: LabelSearchInput,
  options: DiscoverLabelOpportunitiesOptions
): Promise<LabelDiscoveryResult> {
  const country = input.artistProfile?.country ?? input.target ?? "";
  const maxQueriesPerStrategy = options.maxQueriesPerStrategy ?? 6;
  const similarArtists = (input.similarArtists ?? []).slice(0, options.maxSimilarArtists ?? 4);

  let rawCandidates: RawLabelCandidate[] = [];
  const searchedQueries: string[] = [];
  const strategyCandidateCounts = emptyStrategyCounts();
  const providerWarnings: string[] = [];
  let droppedForMissingEvidence = 0;

  // PR #181's web-search discovery (Tavily/Exa + Jina/Firecrawl extraction).
  // Kept intact as the fallback described in issue #195: it always runs
  // when a web search provider is configured, independently of whether the
  // structured providers below are available.
  if (options.webSearchProvider) {
    const webSearchProvider = options.webSearchProvider;
    const queriesByStrategy: Array<{ strategy: LabelDiscoveryStrategy; queries: string[] }> = [
      { strategy: "genre_specialization", queries: buildGenreLabelQueries(input.genre, country).slice(0, maxQueriesPerStrategy) },
      {
        strategy: "similar_artist_release",
        queries: similarArtists.flatMap((artist) => buildSimilarArtistLabelQueries(artist.name)).slice(0, maxQueriesPerStrategy)
      },
      { strategy: "geographic", queries: buildGeographicLabelQueries(input.genre, input.city, country).slice(0, maxQueriesPerStrategy) },
      { strategy: "directory", queries: buildLabelDirectoryQueries(input.genre, country).slice(0, maxQueriesPerStrategy) }
    ];

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
          providerWarnings.push(`${webSearchProvider.providerName} label search failed for query "${query}": ${message}.`);
          continue;
        }
        for (const result of results) {
          const candidate = webResultToLabelCandidate(result, strategy);
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
          providerWarnings.push(`${options.webExtractProvider.providerName} label extraction failed for ${url}: ${message}.`);
          continue;
        }
        if (!extracted) {
          continue;
        }
        const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ");
        if (!classifyLabelEvidence(text)) {
          continue;
        }
        const existing = rawCandidates.find((candidate) => candidate.url === url);
        rawCandidates.push({
          name: extracted.title ?? existing?.name ?? url,
          url,
          sourceName: "label_discovery_extract",
          strategy: existing?.strategy ?? "genre_specialization",
          text,
          links: [],
          confidence: extracted.statusCode && extracted.statusCode >= 200 && extracted.statusCode < 300 ? 0.75 : 0.55
        });
      }
    }
  } else {
    providerWarnings.push("No web search provider is enabled; the PR #181 web-search label discovery was skipped.");
  }

  // Structured discovery/enrichment (issue #195). Each step is additive and
  // independently fault-isolated: a failure here can never break the
  // web-search results already collected above, and "no candidates yet"
  // (e.g. no similar artists) is a no-op rather than a warning.
  if (options.discoverMusicBrainzCandidates) {
    try {
      const musicBrainzResult = await options.discoverMusicBrainzCandidates(input);
      rawCandidates.push(...musicBrainzResult.candidates);
      providerWarnings.push(...musicBrainzResult.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      providerWarnings.push(`MusicBrainz label discovery failed: ${message}.`);
    }
  }

  if (options.enrichWithDiscogs) {
    try {
      const discogsResult = await options.enrichWithDiscogs(rawCandidates);
      rawCandidates = discogsResult.candidates;
      providerWarnings.push(...discogsResult.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      providerWarnings.push(`Discogs enrichment failed: ${message}.`);
    }
  }

  if (options.enrichFromOfficialSources) {
    try {
      const officialResult = await options.enrichFromOfficialSources(rawCandidates);
      rawCandidates = officialResult.candidates;
      providerWarnings.push(...officialResult.warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      providerWarnings.push(`Official-source enrichment failed: ${message}.`);
    }
  }

  const deduped = mergeAndDeduplicateLabelCandidates(rawCandidates);
  const now = options.now ?? new Date();
  let droppedForInactivity = 0;
  const opportunities: GenericOpportunity[] = [];

  for (const candidate of deduped) {
    const activity = extractLabelActivityStatus(candidate.text, now);
    if (activity.isActive === false) {
      droppedForInactivity += 1;
      continue;
    }
    opportunities.push(buildLabelOpportunity(input, candidate, activity));
  }

  opportunities.sort((left, right) => (right.compatibilityScore ?? 0) - (left.compatibilityScore ?? 0));
  const limited = opportunities.slice(0, input.limit);

  logLabelDiscoverySummary(strategyCandidateCounts, droppedForMissingEvidence, droppedForInactivity, limited.length);

  const warnings = [...providerWarnings];
  if (limited.length === 0) {
    warnings.push("Label discovery returned no verifiable label candidates.");
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

function webResultToLabelCandidate(result: WebSearchResult, strategy: LabelDiscoveryStrategy): RawLabelCandidate | null {
  const text = [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
  if (!classifyLabelEvidence(text)) {
    return null;
  }
  return {
    name: result.title ?? result.url ?? "Label discovery result",
    url: result.url,
    sourceName: "label_discovery",
    strategy,
    text,
    links: result.links ?? [],
    confidence: Math.max(0.4, result.confidence * 0.75)
  };
}

function buildLabelOpportunity(
  input: LabelSearchInput,
  candidate: RawLabelCandidate,
  activity: { isActive: boolean | null; evidence: string | null }
): GenericOpportunity {
  const similarArtists = input.similarArtists ?? [];
  const matchedSimilarArtists = findMentionedSimilarArtists(candidate.text, similarArtists);
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], candidate.text);
  const demoPolicy = extractLabelDemoPolicy(candidate.text, candidate.links);
  const distributor = extractLabelDistributor(candidate.text);
  const audienceLevel = extractLabelRosterAudienceLevel(candidate.text, matchedSimilarArtists);
  const geographicScope = classifyGeographicScope(candidate.text, input);
  const contacts = extractPublicContactSignals(candidate.text, candidate.links);
  const bestEmail = contacts.find((contact) => contact.type === "email") ?? null;
  const bestContactForm = pickBestContact(contacts.filter((contact) => contact.type === "contact_form"));
  const matchedReleaseTitles = [
    ...new Set(
      (candidate.evidence ?? [])
        .filter((entry) => matchedSimilarArtists.some((artist) => artist.name === entry.similarArtistName))
        .map((entry) => entry.releaseTitle)
        .filter((title): title is string => Boolean(title))
    )
  ].slice(0, 3);

  const compatibility = scoreLabelCompatibility(input, {
    genres: genreMatch.matchedGenres,
    text: candidate.text,
    matchedSimilarArtists,
    audienceLevel,
    geographicScope,
    acceptsDemos: demoPolicy.acceptsDemos,
    isActive: activity.isActive,
    distributor,
    matchedReleaseTitles
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
    opportunityType: "label",
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
    status: demoPolicy.acceptsDemos === true ? "open" : demoPolicy.acceptsDemos === false ? "closed" : "unknown",
    applicationUrl: demoPolicy.demoSubmissionUrl,
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
    label: {
      signedArtists: matchedSimilarArtists.map((artist) => artist.name),
      labelGenres: genreMatch.matchedGenres,
      territory,
      acceptsDemos: demoPolicy.acceptsDemos,
      demoSubmissionUrl: demoPolicy.demoSubmissionUrl,
      distributor,
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

function classifyGeographicScope(text: string, input: LabelSearchInput): LabelGeographicRelevance {
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

function mapGeographicScope(scope: LabelGeographicRelevance): "local" | "national" | "international" | "online" | "unknown" {
  if (scope === "remote_compatible") return "online";
  return scope;
}

function emptyStrategyCounts(): Record<LabelDiscoveryStrategy, number> {
  return {
    similar_artist_release: 0,
    genre_specialization: 0,
    audience_comparable: 0,
    geographic: 0,
    directory: 0,
    distributor_or_scene: 0
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function toAbsoluteUrlOrNull(value: string | null): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function logLabelDiscoverySummary(
  strategyCounts: Record<LabelDiscoveryStrategy, number>,
  droppedForMissingEvidence: number,
  droppedForInactivity: number,
  keptCount: number
): void {
  warnLog("labels", [
    "Label discovery summary:",
    `- Similar-artist-release candidates: ${strategyCounts.similar_artist_release}`,
    `- Genre-specialization candidates: ${strategyCounts.genre_specialization}`,
    `- Geographic candidates: ${strategyCounts.geographic}`,
    `- Directory candidates: ${strategyCounts.directory}`,
    `- Dropped for missing label evidence: ${droppedForMissingEvidence}`,
    `- Dropped for confirmed inactivity: ${droppedForInactivity}`,
    `- Kept label opportunities: ${keptCount}`
  ].join("\n"));
}

// Issue #195: this is the one place that wires the structured providers
// (MusicBrainz enabled by default, Discogs/Bandcamp opt-in via credentials
// and flags) into the additive discovery flow used by discoverLabelOpportunities()
// above. Direct callers of discoverLabelOpportunities (including every
// existing PR #181 test) that build their own options object never get
// these unless they ask for them.
export function buildDefaultLabelDiscoveryOptions(env: LabelDiscoveryEnv = process.env): DiscoverLabelOpportunitiesOptions {
  const webSearchProviders = getEnabledBookingSearchProviders(env);
  const webExtractProvider = buildDefaultWebExtractProvider(env);

  return {
    webSearchProvider: webSearchProviders[0] ?? null,
    webExtractProvider,
    maxQueriesPerStrategy: 6,
    maxSimilarArtists: 4,
    maxResultsPerQuery: 4,
    maxExtractPages: 6,
    discoverMusicBrainzCandidates: isMusicBrainzLabelDiscoveryEnabled(env)
      ? (input) => discoverLabelCandidatesFromMusicBrainz(input, { env })
      : undefined,
    enrichWithDiscogs: isDiscogsLabelEnrichmentEnabled(env)
      ? (candidates) => enrichLabelCandidatesWithDiscogs(candidates, { env })
      : undefined,
    enrichFromOfficialSources: webExtractProvider
      ? (candidates) => enrichLabelCandidatesFromOfficialSources(candidates, { env, webExtractProvider })
      : undefined
  };
}
