import { createHash } from "node:crypto";
import { matchBookingGenres } from "../booking/genreMatching.js";
import { getEnabledBookingSearchProviders, type WebProviderEnv } from "../providers/web/providers.js";
import type { WebSearchProvider, WebSearchResult } from "../providers/web/WebSearchProvider.js";
import { GenericOpportunitySchema, type ArtistTier, type GenericOpportunity } from "../schemas.js";
import {
  buildGenrePlaylistQueries,
  buildRegionalPlaylistQueries,
  buildSimilarArtistPlaylistQueries,
  buildSubmissionPlatformQueries
} from "./playlistDiscoveryQueries.js";
import type { PlaylistDiscoveryStrategy, PlaylistSearchInput } from "./types.js";

export interface DiscoverPlaylistOpportunitiesOptions {
  webSearchProvider: WebSearchProvider | null;
  maxQueriesPerStrategy?: number;
  maxSimilarArtists?: number;
  maxResultsPerQuery?: number;
  now?: Date;
}

export interface PlaylistDiscoveryResult {
  opportunities: GenericOpportunity[];
  searchedQueries: string[];
  warnings: string[];
  metadata: { rawCandidateCount: number; rejectedCount: number; keptOpportunities: number };
}

interface Candidate { result: WebSearchResult; strategy: PlaylistDiscoveryStrategy; text: string }

export async function discoverPlaylistOpportunities(
  input: PlaylistSearchInput,
  options: DiscoverPlaylistOpportunitiesOptions
): Promise<PlaylistDiscoveryResult> {
  if (!options.webSearchProvider) {
    return emptyResult("No web search provider is enabled; playlist discovery was skipped.");
  }
  const similarArtists = (input.similarArtists ?? []).slice(0, options.maxSimilarArtists ?? 4);
  const location = input.artistProfile?.country ?? input.target ?? input.city;
  const maxQueries = options.maxQueriesPerStrategy ?? 4;
  const queryGroups: Array<{ strategy: PlaylistDiscoveryStrategy; queries: string[] }> = [
    { strategy: "similar_artist", queries: similarArtists.flatMap((artist) => buildSimilarArtistPlaylistQueries(artist.name)) },
    { strategy: "genre", queries: buildGenrePlaylistQueries(input.genre) },
    { strategy: "regional", queries: buildRegionalPlaylistQueries(input.genre, location) },
    { strategy: "submission_platform", queries: buildSubmissionPlatformQueries(input.genre) }
  ];
  const searchedQueries: string[] = [];
  const candidates: Candidate[] = [];
  const warnings: string[] = [];

  for (const group of queryGroups) {
    for (const query of group.queries.slice(0, maxQueries)) {
      searchedQueries.push(query);
      try {
        const results = await options.webSearchProvider.search(query, {
          limit: Math.min(options.maxResultsPerQuery ?? 4, input.limit)
        });
        for (const result of results) {
          candidates.push({ result, strategy: group.strategy, text: resultText(result) });
        }
      } catch (error) {
        warnings.push(`${options.webSearchProvider.providerName} playlist search failed for query "${query}": ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }

  const byUrl = new Map<string, Candidate>();
  let rejectedCount = 0;
  for (const candidate of candidates) {
    if (!isVerifiablePlaylistCandidate(candidate)) {
      rejectedCount += 1;
      continue;
    }
    const key = candidate.result.url?.toLowerCase() ?? candidate.result.title?.toLowerCase();
    if (key && !byUrl.has(key)) byUrl.set(key, candidate);
  }

  const opportunities = [...byUrl.values()]
    .map((candidate) => buildOpportunity(input, candidate, options.now ?? new Date()))
    .sort((left, right) => (right.compatibilityScore ?? 0) - (left.compatibilityScore ?? 0))
    .slice(0, input.limit);

  if (opportunities.length === 0) warnings.push("Playlist discovery returned no verifiable playlist candidates.");
  return {
    opportunities,
    searchedQueries,
    warnings,
    metadata: { rawCandidateCount: candidates.length, rejectedCount, keptOpportunities: opportunities.length }
  };
}

function buildOpportunity(input: PlaylistSearchInput, candidate: Candidate, now: Date): GenericOpportunity {
  const { result, text } = candidate;
  const url = result.url!;
  const platform = detectPlaylistPlatform(url, text);
  const submission = detectSubmission(text, url, result.links ?? []);
  const similarArtists = (input.similarArtists ?? []).filter((artist) => includesName(text, artist.name));
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], [], text);
  const followerCount = extractFollowerCount(text);
  const activity = detectActivity(text, now);
  const growthSignal = detectGrowthSignal(text);
  const audienceLevel = audienceLevelFor(followerCount);
  const score = scoreCompatibility({
    genreFit: genreMatch.score / 100,
    similarArtistCount: similarArtists.length,
    activity,
    growthSignal,
    submissionMethod: submission.method,
    playlistAudience: audienceLevel,
    artistAudience: input.artistProfile?.estimatedLevel ?? "unknown"
  });
  const explanation = buildExplanation(input.genre, genreMatch.matchedGenres, similarArtists.map((artist) => artist.name), activity, audienceLevel, submission.method, growthSignal);

  return GenericOpportunitySchema.parse({
    id: createHash("sha256").update(url).digest("hex").slice(0, 16),
    name: result.title ?? "Verified playlist opportunity",
    opportunityType: isPlaylistUrl(url) ? "playlist" : "playlist_curator",
    shortDescription: result.snippet?.slice(0, 280) ?? null,
    city: null,
    country: detectCountry(text, input),
    geographicScope: candidate.strategy === "regional" ? "regional" : "online",
    websiteUrl: url,
    sourceUrl: url,
    contactPageUrl: submission.method === "public_contact_only" ? submission.url : null,
    publicEmail: null,
    socialLinks: {},
    associatedArtists: similarArtists.map((artist) => artist.name),
    associatedGenres: genreMatch.matchedGenres,
    audienceLevel,
    status: activity === "inactive" ? "closed" : submission.method === "none_found" ? "unknown" : "open",
    applicationUrl: submission.url,
    sources: [{ name: result.sourceProvider, url, confidence: clamp(result.confidence) }],
    lastVerifiedAt: now.toISOString(),
    confidenceScore: clamp(result.confidence * (growthSignal === "suspicious" ? 0.55 : 0.9)),
    compatibilityScore: score,
    compatibilityExplanation: explanation,
    dataCompleteness: null,
    playlist: {
      platform,
      playlistUrl: isPlaylistUrl(url) ? url : null,
      curatorName: extractCuratorName(text),
      followerCount,
      audienceEstimate: followerCount,
      updateFrequency: extractUpdateFrequency(text),
      lastUpdatedAt: extractDate(text),
      similarArtistsFeatured: similarArtists.map((artist) => artist.name),
      submissionMethod: submission.method,
      submissionPlatform: submission.platform,
      submissionUrl: submission.url,
      submissionType: detectSubmissionType(text),
      submissionPrice: extractPrice(text),
      estimatedGenreFit: genreMatch.score / 100,
      curatorActivity: activity,
      growthSignal,
      expectedReach: followerCount === null ? null : `Up to ${followerCount.toLocaleString("en-US")} playlist followers; streams are not guaranteed.`
    }
  });
}

function isVerifiablePlaylistCandidate(candidate: Candidate): boolean {
  const url = candidate.result.url;
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const text = candidate.text.toLowerCase();
  if (/^https?:\/\/(?:www\.)?(?:submithub\.com|groover\.co)\/?(?:[?#].*)?$/i.test(url)) return false;
  if (candidate.strategy === "submission_platform") {
    return isSpecificSubmissionUrl(url) && /playlist|curator/.test(text);
  }
  return isPlaylistUrl(url) || (/playlist/.test(text) && /curator|spotify|apple music|deezer|youtube music/.test(text));
}

function detectSubmission(text: string, primaryUrl: string, links: string[]): { method: "direct_submission" | "submithub" | "groover" | "official_platform" | "public_contact_only" | "none_found"; platform: "SubmitHub" | "Groover" | "official_platform" | "direct" | "none"; url: string | null } {
  const urls = [primaryUrl, ...links].filter(isSpecificSubmissionUrl);
  const submithub = urls.find((url) => /submithub\.com\/(?!$)/i.test(url));
  if (submithub) return { method: "submithub", platform: "SubmitHub", url: submithub };
  const groover = urls.find((url) => /groover\.co\/(?!$)/i.test(url));
  if (groover) return { method: "groover", platform: "Groover", url: groover };
  const official = urls.find((url) => /artists\.spotify\.com|spotify for artists|official.*submit/i.test(`${url} ${text}`));
  if (official) return { method: "official_platform", platform: "official_platform", url: official };
  const direct = urls.find((url) => /submit|submission|pitch|send.*music/i.test(url));
  if (direct) return { method: "direct_submission", platform: "direct", url: direct };
  const contact = urls.find((url) => /contact|instagram\.com|facebook\.com/i.test(url));
  if (contact) return { method: "public_contact_only", platform: "none", url: contact };
  return { method: "none_found", platform: "none", url: null };
}

function isSpecificSubmissionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.pathname !== "/" && url.pathname !== "";
  } catch { return false; }
}

function isPlaylistUrl(url: string): boolean { return /open\.spotify\.com\/playlist|music\.apple\.com\/.+\/playlist|deezer\.com\/.+\/playlist|youtube\.com\/playlist/i.test(url); }
function detectPlaylistPlatform(url: string, text: string): string | null {
  const value = `${url} ${text}`.toLowerCase();
  if (value.includes("spotify")) return "Spotify";
  if (value.includes("apple music")) return "Apple Music";
  if (value.includes("deezer")) return "Deezer";
  if (value.includes("youtube")) return "YouTube Music";
  return null;
}
function includesName(text: string, name: string): boolean { return text.toLowerCase().includes(name.toLowerCase()); }
function extractFollowerCount(text: string): number | null {
  const match = text.match(/([\d,.]+)\s*([km])?\s*(?:followers|saves|listeners)/i);
  if (!match) return null;
  const base = Number(match[1]!.replace(/,/g, ""));
  const multiplier = match[2]?.toLowerCase() === "k" ? 1_000 : match[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
  return Number.isFinite(base) ? Math.round(base * multiplier) : null;
}
function audienceLevelFor(followers: number | null): ArtistTier { return followers === null ? "unknown" : followers < 10_000 ? "small" : followers < 100_000 ? "medium" : "large"; }
function detectActivity(text: string, now: Date): "active" | "inactive" | "unknown" {
  if (/abandoned|inactive|no longer updated|discontinued|last updated (?:in )?(?:20(?:0\d|1\d|2[0-3]))/i.test(text)) return "inactive";
  if (/updated (?:daily|weekly|monthly|regularly)|active curator|recently updated/i.test(text)) return "active";
  const date = extractDate(text);
  if (!date) return "unknown";
  const ageDays = (now.getTime() - new Date(date).getTime()) / 86_400_000;
  return ageDays <= 120 ? "active" : ageDays > 365 ? "inactive" : "unknown";
}
function detectGrowthSignal(text: string): "organic" | "suspicious" | "unknown" {
  if (/guaranteed (?:streams|placement|followers)|bot(?:ted|s)?|fake followers|pay for placement/i.test(text)) return "suspicious";
  if (/organic (?:growth|listeners|audience)|editorial selection|no guaranteed placement/i.test(text)) return "organic";
  return "unknown";
}
function extractUpdateFrequency(text: string): string | null { return text.match(/updated (daily|weekly|monthly|regularly)/i)?.[1]?.toLowerCase() ?? null; }
function extractDate(text: string): string | null { return text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0] ?? null; }
function extractPrice(text: string): string | null { return text.match(/(?:€|\$|£)\s?\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s?(?:EUR|USD|GBP)/i)?.[0] ?? null; }
function detectSubmissionType(text: string): "free" | "paid" | "unknown" { return /\bfree (?:submission|pitch)/i.test(text) ? "free" : /\bpaid|credits?|€|\$|£|\b(?:EUR|USD|GBP)\b/i.test(text) ? "paid" : "unknown"; }
function extractCuratorName(text: string): string | null { return text.match(/curated by\s+([^|,.;]{2,80})/i)?.[1]?.trim() ?? null; }
function detectCountry(text: string, input: PlaylistSearchInput): string | null {
  const country = input.artistProfile?.country ?? input.target;
  return country && text.toLowerCase().includes(country.toLowerCase()) ? country : null;
}
function scoreCompatibility(input: { genreFit: number; similarArtistCount: number; activity: string; growthSignal: string; submissionMethod: string; playlistAudience: ArtistTier; artistAudience: string }): number {
  let score = 20 + input.genreFit * 35 + Math.min(input.similarArtistCount, 2) * 12;
  score += input.activity === "active" ? 15 : input.activity === "inactive" ? -30 : 0;
  score += input.submissionMethod === "none_found" ? 0 : 8;
  if (input.playlistAudience !== "unknown" && input.artistAudience !== "unknown") {
    const artistTier = input.artistAudience === "emerging" ? "small" : input.artistAudience === "developing" ? "medium" : "large";
    score += artistTier === input.playlistAudience ? 10 : input.playlistAudience === "large" && artistTier === "small" ? -12 : 2;
  }
  if (input.growthSignal === "suspicious") score -= 30;
  return Math.round(Math.max(0, Math.min(100, score)));
}
function buildExplanation(genre: string, matchedGenres: string[], artists: string[], activity: string, audience: string, submission: string, growth: string): string {
  const parts = [matchedGenres.length ? `Genre evidence matches ${genre}.` : `Genre fit for ${genre} is not fully verified.`];
  parts.push(artists.length ? `Similar artists featured: ${artists.join(", ")}.` : "No similar-artist appearance was verified in the source.");
  parts.push(`Curator activity: ${activity}; audience level: ${audience}; submission route: ${submission}.`);
  if (growth === "suspicious") parts.push("Suspicious growth or guaranteed-placement language was detected, so this result was downgraded.");
  parts.push("Submission does not guarantee placement.");
  return parts.join(" ");
}
function resultText(result: WebSearchResult): string { return [result.title, result.snippet, result.markdown, result.url, ...(result.links ?? [])].filter(Boolean).join(" "); }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function emptyResult(warning: string): PlaylistDiscoveryResult { return { opportunities: [], searchedQueries: [], warnings: [warning], metadata: { rawCandidateCount: 0, rejectedCount: 0, keptOpportunities: 0 } }; }

export function buildDefaultPlaylistDiscoveryOptions(env: WebProviderEnv = process.env): DiscoverPlaylistOpportunitiesOptions {
  return { webSearchProvider: getEnabledBookingSearchProviders(env)[0] ?? null };
}
