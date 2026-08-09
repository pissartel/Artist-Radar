import { createHash, randomUUID } from "node:crypto";
import { extractPublicContactSignals, pickBestContact } from "../booking/contactExtraction.js";
import { matchBookingGenres } from "../booking/genreMatching.js";
import { buildDefaultWebExtractProvider, FallbackSearchProvider, getEnabledBookingSearchProviders, type WebProviderEnv } from "../providers/web/providers.js";
import type { WebExtractProvider } from "../providers/web/WebExtractProvider.js";
import type { WebSearchProvider, WebSearchResult } from "../providers/web/WebSearchProvider.js";
import type { GenericOpportunity } from "../schemas.js";
import { TtlCache } from "../utils/ttlCache.js";
import { buildBatchedSimilarArtistManagerQueries, buildManagerDirectoryQueries, buildManagerRosterQueries } from "./managerDiscoveryQueries.js";
import {
  classifyManagerEntityType,
  classifyPotentialManagerEntityType,
  extractManagementRelationshipStatus,
  extractManagerActivity,
  extractManagerAudienceLevel,
  extractManagerRoster,
  extractManagerServices,
  extractManagerSubmissionPolicy,
  findManagedSimilarArtists,
  worksWithEmergingArtists
} from "./managerSignalExtraction.js";
import { scoreManagerCompatibility } from "./scoreManagerCompatibility.js";
import type { ManagerDiscoveryMode, ManagerDiscoveryStrategy, ManagerSearchInput, RawManagerCandidate } from "./types.js";

const RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const resultCache = new TtlCache<string, ManagerDiscoveryResult>(RESULT_CACHE_TTL_MS);

export interface DiscoverManagerOpportunitiesOptions {
  webSearchProvider: WebSearchProvider | null;
  webExtractProvider?: WebExtractProvider | null;
  maxResultsPerQuery?: number;
  maxExtractPages?: number;
  maxSimilarArtists?: number;
  cache?: TtlCache<string, ManagerDiscoveryResult>;
  now?: Date;
}

export interface ManagerDiscoveryResult {
  opportunities: GenericOpportunity[];
  searchedQueries: string[];
  warnings: string[];
  fromCache: boolean;
  metadata: {
    mode: ManagerDiscoveryMode;
    rawCandidateCount: number;
    droppedForMissingEvidence: number;
    droppedForInactivity: number;
    keptOpportunities: number;
    strategyCandidateCounts: Record<ManagerDiscoveryStrategy, number>;
  };
}

export async function discoverManagerOpportunities(
  input: ManagerSearchInput,
  options: DiscoverManagerOpportunitiesOptions
): Promise<ManagerDiscoveryResult> {
  const mode = input.mode ?? "lightweight";
  const cache = options.cache ?? resultCache;
  const cacheKey = buildCacheKey(input, mode);
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const discovered = await runDiscovery(input, mode, options);
  cache.set(cacheKey, discovered);
  return discovered;
}

async function runDiscovery(input: ManagerSearchInput, mode: ManagerDiscoveryMode, options: DiscoverManagerOpportunitiesOptions): Promise<ManagerDiscoveryResult> {
  const counts = emptyStrategyCounts();
  const empty = (warnings: string[]): ManagerDiscoveryResult => ({
    opportunities: [], searchedQueries: [], warnings, fromCache: false,
    metadata: { mode, rawCandidateCount: 0, droppedForMissingEvidence: 0, droppedForInactivity: 0, keptOpportunities: 0, strategyCandidateCounts: counts }
  });
  if (!options.webSearchProvider) return empty(["No web search provider is enabled; manager discovery was skipped."]);

  const similarLimit = options.maxSimilarArtists ?? (mode === "lightweight" ? 6 : 20);
  const similarArtists = (input.similarArtists ?? []).slice(0, similarLimit);
  const country = input.artistProfile?.country ?? input.target ?? "";
  const queryGroups: Array<{ strategy: ManagerDiscoveryStrategy; queries: string[] }> = [
    { strategy: "similar_artist_management", queries: buildBatchedSimilarArtistManagerQueries(similarArtists.map((artist) => artist.name)) },
    { strategy: "management_roster", queries: buildManagerRosterQueries(input.genre, country) },
    ...(mode === "deep" ? [
      { strategy: "genre_specialization" as const, queries: buildManagerRosterQueries(input.genre, country).map((query) => `${query} career development`) },
      { strategy: "professional_directory" as const, queries: buildManagerDirectoryQueries(input.genre, country) }
    ] : [])
  ];
  const queryBudget = mode === "lightweight" ? 3 : 10;
  const queries = queryGroups.flatMap(({ strategy, queries }) => queries.map((query) => ({ strategy, query }))).slice(0, queryBudget);
  const searchedQueries: string[] = [];
  const warnings: string[] = [];
  const candidates: RawManagerCandidate[] = [];
  const extractionSeeds: RawManagerCandidate[] = [];
  let droppedForMissingEvidence = 0;

  for (const { strategy, query } of queries) {
    searchedQueries.push(query);
    let results: WebSearchResult[];
    try {
      results = await options.webSearchProvider.search(query, { limit: options.maxResultsPerQuery ?? (mode === "lightweight" ? 3 : 8) });
    } catch (error) {
      warnings.push(`${options.webSearchProvider.providerName} manager search failed for query "${query}": ${error instanceof Error ? error.message : String(error)}.`);
      continue;
    }
    for (const result of results) {
      const candidate = toCandidate(result, strategy);
      if (candidate) {
        candidates.push(candidate);
        counts[strategy] += 1;
      } else {
        droppedForMissingEvidence += 1;
        const seed = toExtractionSeed(result, strategy);
        if (seed) extractionSeeds.push(seed);
      }
    }
  }

  if (options.webExtractProvider) {
    const byUrl = new Map<string, RawManagerCandidate>();
    for (const candidate of [...candidates, ...extractionSeeds]) if (candidate.url && !byUrl.has(candidate.url)) byUrl.set(candidate.url, candidate);
    const maxExtractPages = options.maxExtractPages ?? (mode === "lightweight" ? 4 : 20);
    for (const [url, seed] of [...byUrl].slice(0, maxExtractPages)) {
      try {
        const extracted = await options.webExtractProvider.extract(url);
        if (!extracted) continue;
        const text = [extracted.title, extracted.text, extracted.markdown].filter(Boolean).join(" ");
        const entityType = classifyManagerEntityType(text);
        if (!entityType) continue;
        candidates.push({ ...seed, name: extracted.title ?? seed.name, entityType, text, links: extracted.links ?? seed.links, sourceName: "manager_discovery_extract", confidence: .8 });
      } catch (error) {
        warnings.push(`${options.webExtractProvider.providerName} manager extraction failed for ${url}: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }

  const merged = mergeAndDeduplicate(candidates);
  let droppedForInactivity = 0;
  const opportunities: GenericOpportunity[] = [];
  for (const candidate of merged) {
    const isActive = extractManagerActivity(candidate.text, options.now);
    if (isActive === false) { droppedForInactivity += 1; continue; }
    const opportunity = buildOpportunity(input, candidate, isActive);
    const similarEvidence = opportunity.manager?.relevantArtists.length ?? 0;
    if (mode === "lightweight" && (similarEvidence === 0 || (opportunity.compatibilityScore ?? 0) < 55)) continue;
    opportunities.push(opportunity);
  }
  opportunities.sort((a, b) => (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0));
  const limit = mode === "lightweight" ? Math.min(input.limit, 3) : input.limit;
  const limited = opportunities.slice(0, limit);
  if (limited.length === 0) warnings.push("Manager discovery returned no verifiable, compatible management candidates.");
  return {
    opportunities: limited, searchedQueries, warnings, fromCache: false,
    metadata: { mode, rawCandidateCount: candidates.length, droppedForMissingEvidence, droppedForInactivity, keptOpportunities: limited.length, strategyCandidateCounts: counts }
  };
}

function toCandidate(result: WebSearchResult, strategy: ManagerDiscoveryStrategy): RawManagerCandidate | null {
  const text = resultText(result);
  const entityType = classifyManagerEntityType(text);
  if (!entityType) return null;
  return { name: result.title ?? result.url ?? "Manager", url: result.url, sourceName: "manager_discovery", strategy, entityType, text, links: result.links ?? [], confidence: Math.max(.4, result.confidence * .75) };
}

function toExtractionSeed(result: WebSearchResult, strategy: ManagerDiscoveryStrategy): RawManagerCandidate | null {
  if (!result.url) return null;
  const text = resultText(result);
  const entityType = classifyPotentialManagerEntityType(text);
  return entityType ? { name: result.title ?? result.url, url: result.url, sourceName: "manager_discovery_seed", strategy, entityType, text, links: result.links ?? [], confidence: Math.max(.25, result.confidence * .45) } : null;
}

function resultText(result: WebSearchResult): string {
  return [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" ");
}

function buildOpportunity(input: ManagerSearchInput, candidate: RawManagerCandidate, isActive: boolean | null): GenericOpportunity {
  const matched = findManagedSimilarArtists(candidate.text, input.similarArtists ?? []);
  const roster = extractManagerRoster(candidate.text);
  const audienceLevel = extractManagerAudienceLevel(candidate.text, matched);
  const relationshipStatus = extractManagementRelationshipStatus(candidate.text);
  const submission = extractManagerSubmissionPolicy(candidate.text, candidate.links);
  const genre = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], candidate.text);
  const services = extractManagerServices(candidate.text);
  const contacts = extractPublicContactSignals(candidate.text, candidate.links);
  const email = contacts.find((contact) => contact.type === "email")?.value ?? null;
  const contact = pickBestContact(contacts.filter((item) => item.type === "contact_form"));
  const emerging = worksWithEmergingArtists(candidate.text);
  const compatibility = scoreManagerCompatibility(input, { text: candidate.text, matchedSimilarArtists: matched, audienceLevel, rosterSize: roster.length, relationshipStatus, acceptsSubmissions: submission.acceptsSubmissions, isActive, worksWithEmergingArtists: emerging });
  return {
    id: randomUUID(), name: candidate.name, opportunityType: candidate.entityType,
    shortDescription: candidate.text.slice(0, 280), city: null, country: null, geographicScope: "unknown",
    websiteUrl: candidate.url, sourceUrl: candidate.url,
    contactPageUrl: absoluteUrl(submission.contactUrl ?? contact?.value ?? null), publicEmail: email, socialLinks: {},
    associatedArtists: matched.map((artist) => artist.name), associatedGenres: genre.matchedGenres, audienceLevel,
    status: submission.acceptsSubmissions === true ? "open" : submission.acceptsSubmissions === false ? "closed" : "unknown",
    applicationUrl: submission.contactUrl, sources: [{ name: candidate.sourceName, url: candidate.url, confidence: clamp(candidate.confidence) }],
    lastVerifiedAt: null, confidenceScore: clamp(candidate.confidence), compatibilityScore: compatibility.score,
    compatibilityExplanation: compatibility.explanation, dataCompleteness: null,
    manager: {
      roster, relevantArtists: matched.map((artist) => artist.name), managerGenres: genre.matchedGenres,
      typicalAudienceLevel: audienceLevel, services, acceptsSubmissions: submission.acceptsSubmissions,
      contactPolicy: submission.acceptsSubmissions === true ? "Public submissions accepted" : submission.acceptsSubmissions === false ? "Not accepting submissions" : null,
      relationshipStatus, isActive,
      evidence: [{ sourceUrl: candidate.url, similarArtistName: matched[0]?.name ?? null, relationshipStatus, confidence: clamp(candidate.confidence) }]
    }
  };
}

export function mergeAndDeduplicate(candidates: RawManagerCandidate[]): RawManagerCandidate[] {
  const merged = new Map<string, RawManagerCandidate>();
  for (const candidate of candidates) {
    const key = normalizedCandidateKey(candidate);
    const existing = merged.get(key);
    if (!existing) { merged.set(key, candidate); continue; }
    merged.set(key, { ...existing, text: `${existing.text} ${candidate.text}`, links: [...new Set([...existing.links, ...candidate.links])], confidence: Math.max(existing.confidence, candidate.confidence) });
  }
  return [...merged.values()];
}

function normalizedCandidateKey(candidate: RawManagerCandidate): string {
  const normalizedName = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  try {
    if (candidate.url) {
      const host = new URL(candidate.url).hostname.replace(/^www\./, "").toLowerCase();
      // A company normally has one canonical domain, while multiple named
      // managers may legitimately have profile pages on the same company site.
      return candidate.entityType === "management_company" ? `company:${host}` : `manager:${host}:${normalizedName}`;
    }
  } catch { /* fall through to evidence-gated normalized name */ }
  return `${candidate.entityType}:${normalizedName}`;
}

function buildCacheKey(input: ManagerSearchInput, mode: ManagerDiscoveryMode): string {
  return createHash("sha256").update(JSON.stringify({ mode, artist: input.artist.toLowerCase(), city: input.city.toLowerCase(), genre: input.genre.toLowerCase(), target: input.target ?? null, limit: input.limit, similarArtists: (input.similarArtists ?? []).map((artist) => artist.name.toLowerCase()) })).digest("hex");
}

function emptyStrategyCounts(): Record<ManagerDiscoveryStrategy, number> {
  return { similar_artist_management: 0, management_roster: 0, genre_specialization: 0, professional_directory: 0 };
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function absoluteUrl(value: string | null): string | null { return value && /^https?:\/\//i.test(value) ? value : null; }

export function clearManagerDiscoveryCacheForTests(): void { resultCache.clear(); }

export function buildDefaultManagerDiscoveryOptions(env: WebProviderEnv = process.env): DiscoverManagerOpportunitiesOptions {
  const providers = getEnabledBookingSearchProviders(env);
  return { webSearchProvider: providers.length ? new FallbackSearchProvider(providers) : null, webExtractProvider: buildDefaultWebExtractProvider(env) };
}
