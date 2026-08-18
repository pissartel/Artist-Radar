import { createHash } from "node:crypto";
import { matchBookingGenres } from "../booking/genreMatching.js";
import { getEnabledBookingSearchProviders, type WebProviderEnv } from "../providers/web/providers.js";
import type { WebSearchProvider, WebSearchResult } from "../providers/web/WebSearchProvider.js";
import { GenericOpportunitySchema, type GenericOpportunity } from "../schemas.js";
import {
  buildEventOrganizerQueries,
  buildGenreCollectiveQueries,
  buildLocalResourceQueries,
  buildSimilarArtistOrganizationQueries,
  buildSupportProgramQueries
} from "./communityDiscoveryQueries.js";
import type { CommunityDiscoveryStrategy, CommunitySearchInput } from "./types.js";

export interface DiscoverCommunityOpportunitiesOptions {
  webSearchProvider: WebSearchProvider | null;
  maxQueriesPerStrategy?: number;
  maxSimilarArtists?: number;
  maxResultsPerQuery?: number;
  now?: Date;
}

export interface CommunityDiscoveryResult {
  opportunities: GenericOpportunity[];
  searchedQueries: string[];
  warnings: string[];
  metadata: { rawCandidateCount: number; rejectedCount: number; keptOpportunities: number };
}

interface Candidate { result: WebSearchResult; strategy: CommunityDiscoveryStrategy; text: string }

export async function discoverCommunityOpportunities(
  input: CommunitySearchInput,
  options: DiscoverCommunityOpportunitiesOptions
): Promise<CommunityDiscoveryResult> {
  if (!options.webSearchProvider) return emptyResult("No web search provider is enabled; community discovery was skipped.");
  const location = input.artistProfile?.country ?? input.target ?? input.city;
  const similarArtists = (input.similarArtists ?? []).slice(0, options.maxSimilarArtists ?? 4);
  const groups: Array<{ strategy: CommunityDiscoveryStrategy; queries: string[] }> = [
    { strategy: "similar_artist", queries: similarArtists.flatMap((artist) => buildSimilarArtistOrganizationQueries(artist.name)) },
    { strategy: "event_organizer", queries: buildEventOrganizerQueries(input.genre, location) },
    { strategy: "local_resource", queries: buildLocalResourceQueries(input.genre, location) },
    { strategy: "support_program", queries: buildSupportProgramQueries(location) },
    { strategy: "genre_collective", queries: buildGenreCollectiveQueries(input.genre, location) }
  ];
  const searchedQueries: string[] = [];
  const warnings: string[] = [];
  const candidates: Candidate[] = [];
  for (const group of groups) {
    for (const query of group.queries.slice(0, options.maxQueriesPerStrategy ?? 3)) {
      searchedQueries.push(query);
      try {
        const results = await options.webSearchProvider.search(query, { limit: Math.min(options.maxResultsPerQuery ?? 4, input.limit) });
        candidates.push(...results.map((result) => ({ result, strategy: group.strategy, text: resultText(result) })));
      } catch (error) {
        warnings.push(`${options.webSearchProvider.providerName} community search failed for query "${query}": ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }

  const unique = new Map<string, Candidate>();
  let rejectedCount = 0;
  for (const candidate of candidates) {
    if (!isVerifiableOrganization(candidate)) { rejectedCount += 1; continue; }
    const key = candidate.result.url!.toLowerCase().replace(/\/$/, "");
    if (!unique.has(key)) unique.set(key, candidate);
  }
  const opportunities = [...unique.values()]
    .map((candidate) => buildOpportunity(input, candidate, options.now ?? new Date()))
    .sort((a, b) => (b.compatibilityScore ?? 0) - (a.compatibilityScore ?? 0))
    .slice(0, input.limit);
  if (!opportunities.length) warnings.push("Community discovery returned no currently active, verifiable organizations.");
  return { opportunities, searchedQueries, warnings, metadata: { rawCandidateCount: candidates.length, rejectedCount, keptOpportunities: opportunities.length } };
}

function buildOpportunity(input: CommunitySearchInput, candidate: Candidate, now: Date): GenericOpportunity {
  const { result, text } = candidate;
  const url = result.url!;
  const organizationType = detectOrganizationType(text);
  const similarArtists = (input.similarArtists ?? []).filter((artist) => includesName(text, artist.name)).map((artist) => artist.name);
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], text);
  const services = extractSignals(text, ["concerts", "residencies", "showcases", "rehearsal spaces", "networking", "artist development", "grants", "cultural projects"]);
  const programs = extractNamedPrograms(text);
  const applicationUrl = findLink(result, /apply|application|membership|join|residen|grant|submit/i);
  const contactPageUrl = findLink(result, /contact/i);
  const supportedArtistLevel = detectSupportedArtistLevel(text);
  const artistLevel = input.artistProfile?.estimatedLevel ?? "unknown";
  const artistLevelMatch = supportedArtistLevel !== "unknown" && supportedArtistLevel === artistLevel;
  const local = includesLocation(text, input.city) || includesLocation(text, input.target);
  const geographicScope = local ? "local" : candidate.strategy === "local_resource" ? "regional" : "unknown";
  const score = Math.round(Math.max(0, Math.min(100,
    25 + genreMatch.score * 0.3 + Math.min(similarArtists.length, 2) * 14 + (local ? 15 : 0) + (applicationUrl ? 8 : 0) + Math.min(services.length, 3) * 3 + (artistLevelMatch ? 8 : 0)
  )));
  const concrete = services.length ? services.join(", ") : "artist support or community programming";
  return GenericOpportunitySchema.parse({
    id: createHash("sha256").update(url).digest("hex").slice(0, 16),
    name: result.title ?? "Verified artist-support organization",
    opportunityType: organizationType,
    shortDescription: result.snippet?.slice(0, 280) ?? null,
    city: local ? input.city : null,
    country: detectCountry(text, input),
    geographicScope,
    websiteUrl: url,
    sourceUrl: url,
    contactPageUrl,
    publicEmail: extractPublicEmail(text),
    socialLinks: {},
    associatedArtists: similarArtists,
    associatedGenres: genreMatch.matchedGenres,
    status: applicationUrl ? "open" : "unknown",
    applicationUrl,
    sources: [{ name: result.sourceProvider, url, confidence: clamp(result.confidence) }],
    lastVerifiedAt: now.toISOString(),
    confidenceScore: clamp(result.confidence * 0.9),
    compatibilityScore: score,
    compatibilityExplanation: `${genreMatch.matchedGenres.length ? `Genre evidence matches ${input.genre}` : `Genre fit for ${input.genre} is not fully verified`}. ${local ? `The organization is locally relevant to ${input.city}.` : "Local relevance is not confirmed."} ${similarArtists.length ? `Similar artists involved: ${similarArtists.join(", ")}.` : "No similar-artist involvement was verified."} Supported artist level: ${supportedArtistLevel}${artistLevelMatch ? " (matches the artist)" : ""}. Concrete opportunity: ${concrete}.`,
    communityOrganization: {
      organizationType,
      mission: result.snippet?.slice(0, 280) ?? null,
      services,
      programs,
      similarArtistsInvolved: similarArtists,
      supportedArtistLevel,
      isCurrentlyActive: true,
      activityEvidence: extractActivityEvidence(text),
      applicationOrMembershipUrl: applicationUrl,
      publicContact: extractPublicEmail(text) ?? contactPageUrl,
      geographicReach: geographicScope,
      concreteOpportunity: concrete
    }
  });
}

function isVerifiableOrganization(candidate: Candidate): boolean {
  if (!candidate.result.url || !/^https?:\/\//i.test(candidate.result.url)) return false;
  const text = candidate.text.toLowerCase();
  const organization = /association|collective|nonprofit|non-profit|artist support|cultural organization|music network|community organization/.test(text);
  const activity = /\b202[5-9]\b|upcoming|currently open|applications? open|annual|this year|latest (?:events?|programs?)|active since/.test(text);
  const venueOnly = /\bvenue\b|concert hall|live music club/.test(text) && !organization;
  return organization && activity && !venueOnly;
}

function detectOrganizationType(text: string): "association" | "collective" {
  return /collective/i.test(text) ? "collective" : "association";
}
function detectSupportedArtistLevel(text: string): "emerging" | "developing" | "established" | "unknown" {
  if (/emerging|early[- ]career|new artists?|new talent/i.test(text)) return "emerging";
  if (/developing|mid[- ]career/i.test(text)) return "developing";
  if (/established|professional artists?/i.test(text)) return "established";
  return "unknown";
}
function extractActivityEvidence(text: string): string { return text.match(/(?:upcoming|currently open|applications? open|annual|this year|latest|active since)[^|.;]{0,120}/i)?.[0]?.trim() ?? "Recent dated source evidence"; }
function extractSignals(text: string, signals: string[]): string[] { return signals.filter((signal) => text.toLowerCase().includes(signal.replace(/s$/, ""))); }
function extractNamedPrograms(text: string): string[] { return [...text.matchAll(/(?:program|programme|residency|showcase|grant):?\s+([^|.;]{2,80})/gi)].map((match) => match[1]!.trim()).slice(0, 5); }
function findLink(result: WebSearchResult, pattern: RegExp): string | null { return [result.url, ...(result.links ?? [])].find((url) => url && /^https?:\/\//i.test(url) && pattern.test(url)) ?? null; }
function extractPublicEmail(text: string): string | null { return text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? null; }
function includesName(text: string, name: string): boolean { return text.toLowerCase().includes(name.toLowerCase()); }
function includesLocation(text: string, location: string | null | undefined): boolean { return Boolean(location && text.toLowerCase().includes(location.toLowerCase())); }
function detectCountry(text: string, input: CommunitySearchInput): string | null { const country = input.artistProfile?.country ?? input.target; return includesLocation(text, country) ? country ?? null : null; }
function resultText(result: WebSearchResult): string { return [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" "); }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function emptyResult(warning: string): CommunityDiscoveryResult { return { opportunities: [], searchedQueries: [], warnings: [warning], metadata: { rawCandidateCount: 0, rejectedCount: 0, keptOpportunities: 0 } }; }

export function buildDefaultCommunityDiscoveryOptions(env: WebProviderEnv = process.env): DiscoverCommunityOpportunitiesOptions {
  return { webSearchProvider: getEnabledBookingSearchProviders(env)[0] ?? null };
}
