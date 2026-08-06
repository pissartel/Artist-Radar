import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { z } from "zod";
import type { SimilarArtist } from "../../schemas.js";
import { normalizeKey } from "../../utils/venueNameNormalization.js";
import type { BookingSearchInput, BookingTarget, BookingTargetCategory, BookingSourceType, OpportunityKind, ProgrammingEvidence } from "../types.js";
import { isEligibleConcertLeadTime } from "../concertLeadTime.js";
import { selectEligibleSimilarArtistsForBookingVenueDiscovery } from "../similarArtistEligibility.js";
import { resolveTargetCountry } from "../targetCountry.js";
import type { BookingSourceProvider, BookingSourceProviderResult } from "./BookingSourceProvider.js";

export type OpenAiDiscoveryMode = "standard" | "expanded";
export type OpenAiDiscoveryMethod = "genre_search" | "similar_artist_history" | "similar_artist_upcoming" | "scene_search" | "programming_search";

export interface OpenAIOpportunityDiscoveryEnv {
  OPENAI_BOOKING_DISCOVERY_ENABLED?: string;
  OPENAI_BOOKING_DISCOVERY_MODE?: OpenAiDiscoveryMode | "auto";
  OPENAI_BOOKING_DISCOVERY_MODEL?: string;
  OPENAI_BOOKING_MAX_SEARCH_CALLS?: string;
  OPENAI_BOOKING_MAX_ARTISTS?: string;
  OPENAI_BOOKING_MAX_CANDIDATES_PER_TYPE?: string;
  OPENAI_API_KEY?: string;
}

export interface OpenAIOpportunityDiscoveryProviderOptions {
  env?: OpenAIOpportunityDiscoveryEnv;
  client?: OpenAIOpportunityDiscoveryClient;
  now?: Date;
  mode?: OpenAiDiscoveryMode;
}

export interface OpenAiDiscoveryCandidate {
  name: string;
  candidateType: "venue" | "festival" | "event" | "promoter" | "association";
  city: string | null;
  country: string | null;
  officialUrl: string | null;
  evidenceSources: Array<{
    url: string;
    sourceType: "official_site" | "official_event" | "ticketing" | "agenda" | "editorial" | "social";
    evidenceText: string;
  }>;
  compatibleArtists: Array<{
    name: string;
    eventName: string | null;
    eventDate: string | null;
    venueName: string | null;
  }>;
  genres: string[];
  discoveryMethod: OpenAiDiscoveryMethod;
  discoveryConfidence: number;
}

export interface OpenAIOpportunityDiscoveryDiagnostics {
  mode: OpenAiDiscoveryMode;
  searches: {
    festivalQueries: number;
    venueQueries: number;
    similarArtistQueries: number;
    upcomingEventQueries: number;
    organizationQueries: number;
  };
  candidates: {
    rawOpenAiCandidates: number;
    festivals: number;
    venues: number;
    events: number;
    promoters: number;
    associations: number;
    mergedWithOtherProviders: number;
    rejected: number;
    final: number;
  };
  rejectedCandidates: Array<{
    name: string;
    candidateType: string;
    discoveryMethod: string;
    rejectionReason: string;
  }>;
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  apiErrors: number;
  malformedResponses: number;
}

export interface OpenAIResponsesClient {
  responses: {
    create(params: ResponseCreateParamsNonStreaming): Promise<Response>;
  };
}

const EvidenceSourceSchema = z.object({
  url: z.string(),
  sourceType: z.enum(["official_site", "official_event", "ticketing", "agenda", "editorial", "social"]),
  evidenceText: z.string()
});

const CompatibleArtistSchema = z.object({
  name: z.string(),
  eventName: z.string().nullable(),
  eventDate: z.string().nullable(),
  venueName: z.string().nullable()
});

const DiscoveryCandidateSchema = z.object({
  name: z.string(),
  candidateType: z.enum(["venue", "festival", "event", "promoter", "association"]),
  city: z.string().nullable(),
  country: z.string().nullable(),
  officialUrl: z.string().nullable(),
  evidenceSources: z.array(EvidenceSourceSchema),
  compatibleArtists: z.array(CompatibleArtistSchema),
  genres: z.array(z.string()),
  discoveryMethod: z.enum(["genre_search", "similar_artist_history", "similar_artist_upcoming", "scene_search", "programming_search"]),
  discoveryConfidence: z.number()
});

const DiscoveryResultSchema = z.object({
  candidates: z.array(DiscoveryCandidateSchema)
});

const RESPONSE_JSON_SCHEMA = (() => {
  const schema = z.toJSONSchema(DiscoveryResultSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_MAX_SEARCH_CALLS_STANDARD = 5;
const DEFAULT_MAX_SEARCH_CALLS_EXPANDED = 10;
const DEFAULT_MAX_ARTISTS = 10;
const DEFAULT_MAX_CANDIDATES_PER_TYPE = 20;
const openAiDiscoveryCache = new Map<string, Promise<OpenAiDiscoveryCandidate[]>>();

export function clearOpenAIOpportunityDiscoveryCacheForTests(): void {
  openAiDiscoveryCache.clear();
}

export function getOpenAIOpportunityDiscoveryStatus(env: OpenAIOpportunityDiscoveryEnv): { enabled: boolean; reason: string } {
  if (env.OPENAI_BOOKING_DISCOVERY_ENABLED !== "true") {
    return { enabled: false, reason: "OPENAI_BOOKING_DISCOVERY_ENABLED is not true" };
  }
  if (!env.OPENAI_API_KEY) {
    return { enabled: false, reason: "OPENAI_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled (OPENAI_API_KEY present)" };
}

export class OpenAIOpportunityDiscoveryClient {
  private readonly client: OpenAIResponsesClient;
  private readonly model: string;
  readonly diagnostics = createDiagnostics("standard");

  constructor(options: { apiKey: string; model: string; client?: OpenAIResponsesClient; timeoutMs?: number }) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 45_000, maxRetries: 1 });
    this.model = options.model;
  }

  async discover(cacheKey: string, prompt: string): Promise<OpenAiDiscoveryCandidate[]> {
    const cached = openAiDiscoveryCache.get(cacheKey);
    if (cached) {
      this.diagnostics.cacheHits += 1;
      return cached;
    }
    this.diagnostics.cacheMisses += 1;
    const promise = this.runDiscovery(prompt);
    openAiDiscoveryCache.set(cacheKey, promise);
    return promise;
  }

  private async runDiscovery(prompt: string): Promise<OpenAiDiscoveryCandidate[]> {
    this.diagnostics.apiCalls += 1;
    let response: Response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: prompt,
        tools: [{ type: "web_search" }],
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_schema",
            name: "booking_opportunity_discovery",
            schema: RESPONSE_JSON_SCHEMA,
            strict: true
          }
        }
      });
    } catch {
      this.diagnostics.apiErrors += 1;
      return [];
    }

    if (!response.output_text) {
      this.diagnostics.malformedResponses += 1;
      return [];
    }
    const parsed = safeJson(response.output_text);
    const result = DiscoveryResultSchema.safeParse(parsed);
    if (!result.success) {
      this.diagnostics.malformedResponses += 1;
      return [];
    }
    const citedUrls = extractCitedUrls(response);
    return result.data.candidates.filter((candidate) => candidate.evidenceSources.some((source) => citedUrls.has(normalizeUrl(source.url))));
  }
}

export function buildOpenAIOpportunityDiscoveryProvider(options: OpenAIOpportunityDiscoveryProviderOptions = {}): BookingSourceProvider {
  const env = options.env ?? process.env;
  const providerName = "openai_opportunity_discovery";
  let runtimeModeOverride = options.mode ?? null;

  return {
    providerName,
    setDiscoveryMode(mode) {
      runtimeModeOverride = mode;
    },
    async search({ input }): Promise<BookingSourceProviderResult> {
      const status = getOpenAIOpportunityDiscoveryStatus(env);
      if (!status.enabled) {
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: [`OpenAI booking opportunity discovery is disabled: ${status.reason}.`],
          metadata: { enabled: false, reason: status.reason, openAiOpportunityDiscoveryDiagnostics: createDiagnostics("standard") }
        };
      }

      const mode = resolveMode(env, runtimeModeOverride ?? undefined);
      const diagnostics = createDiagnostics(mode);
      const client = options.client ?? new OpenAIOpportunityDiscoveryClient({
        apiKey: env.OPENAI_API_KEY!,
        model: env.OPENAI_BOOKING_DISCOVERY_MODEL || DEFAULT_MODEL
      });
      client.diagnostics.mode = mode;
      const maxCalls = parsePositiveInt(env.OPENAI_BOOKING_MAX_SEARCH_CALLS, mode === "expanded" ? DEFAULT_MAX_SEARCH_CALLS_EXPANDED : DEFAULT_MAX_SEARCH_CALLS_STANDARD);
      const maxArtists = parsePositiveInt(env.OPENAI_BOOKING_MAX_ARTISTS, DEFAULT_MAX_ARTISTS);
      const maxCandidatesPerType = parsePositiveInt(env.OPENAI_BOOKING_MAX_CANDIDATES_PER_TYPE, DEFAULT_MAX_CANDIDATES_PER_TYPE);
      const querySpecs = buildDiscoveryQueries(input, mode, maxArtists).slice(0, maxCalls);
      const rawCandidates: OpenAiDiscoveryCandidate[] = [];

      for (const spec of querySpecs) {
        diagnostics.searches[spec.countKey] += 1;
        const candidates = await client.discover(buildCacheKey(input, mode, spec.kind, spec.prompt), spec.prompt);
        rawCandidates.push(...candidates);
      }

      diagnostics.apiCalls = client.diagnostics.apiCalls;
      diagnostics.cacheHits = client.diagnostics.cacheHits;
      diagnostics.cacheMisses = client.diagnostics.cacheMisses;
      diagnostics.apiErrors = client.diagnostics.apiErrors;
      diagnostics.malformedResponses = client.diagnostics.malformedResponses;
      diagnostics.candidates.rawOpenAiCandidates = rawCandidates.length;

      const targets: BookingTarget[] = [];
      const perTypeCount = new Map<string, number>();
      for (const candidate of rawCandidates) {
        const count = perTypeCount.get(candidate.candidateType) ?? 0;
        if (count >= maxCandidatesPerType) {
          diagnostics.candidates.rejected += 1;
          diagnostics.rejectedCandidates.push(toRejected(candidate, "candidate_type_limit"));
          continue;
        }
        const normalized = toBookingTarget(input, candidate, options.now ?? new Date());
        if (!normalized) {
          diagnostics.candidates.rejected += 1;
          diagnostics.rejectedCandidates.push(toRejected(candidate, "missing_required_evidence_or_unreliable_event_date"));
          continue;
        }
        perTypeCount.set(candidate.candidateType, count + 1);
        targets.push(normalized);
      }

      for (const target of targets) {
        if (target.category === "festival") diagnostics.candidates.festivals += 1;
        if (target.category === "venue") diagnostics.candidates.venues += 1;
        if (target.category === "event") diagnostics.candidates.events += 1;
        if (target.category === "promoter") diagnostics.candidates.promoters += 1;
        if (target.category === "association") diagnostics.candidates.associations += 1;
      }
      diagnostics.candidates.final = targets.length;

      return {
        sourceProvider: providerName,
        searchedQueries: querySpecs.map((spec) => spec.prompt),
        targets,
        warnings: targets.length === 0 ? ["OpenAI booking opportunity discovery returned no verifiable candidates."] : [],
        metadata: { enabled: true, mode, openAiOpportunityDiscoveryDiagnostics: diagnostics }
      };
    }
  };
}

function toBookingTarget(input: BookingSearchInput, candidate: OpenAiDiscoveryCandidate, now: Date): BookingTarget | null {
  if (!candidate.name.trim() || candidate.evidenceSources.length === 0) return null;
  const targetCountry = resolveTargetCountry(input);
  if (!candidate.country && !candidate.city) return null;
  const category = toCategory(candidate.candidateType);
  const source = selectPrimarySource(candidate);
  const compatibleArtists = candidate.compatibleArtists.filter((artist) => artist.name.trim());
  const programmingEvidence: ProgrammingEvidence[] = compatibleArtists.map((artist) => ({
    artistName: artist.name,
    artistNames: [artist.name],
    eventName: artist.eventName,
    eventDate: artist.eventDate,
    sourceUrl: source?.url ?? null,
    genres: candidate.genres
  }));
  if (category !== "event" && programmingEvidence.length === 0 && candidate.genres.length === 0) return null;
  if (category === "event" && (!hasVerifiedIsoDate(candidate) || !isEligibleConcertLeadTime(candidate.compatibleArtists[0]?.eventDate, now))) return null;

  return {
    name: candidate.name,
    category,
    city: candidate.city,
    country: candidate.country ?? targetCountry,
    description: candidate.evidenceSources.map((entry) => entry.evidenceText).join(" "),
    sourceUrl: category === "venue" ? selectVenueSourceUrl(candidate) : source?.url ?? candidate.officialUrl,
    sourceType: toSourceType(category, source?.sourceType),
    sourceProvider: "openai_opportunity_discovery",
    genres: candidate.genres,
    pastProgramming: compatibleArtists.map((artist) => [artist.eventName, artist.name].filter(Boolean).join(" - ")),
    venueName: category === "venue" ? candidate.name : candidate.compatibleArtists[0]?.venueName,
    lineup: compatibleArtists.map((artist) => artist.name),
    programmingEvidence,
    eventDate: category === "event" ? candidate.compatibleArtists[0]?.eventDate : null,
    isFutureEvent: category === "event" ? true : null,
    isPastEvent: category === "event" ? false : null,
    dateConfidence: category === "event" ? "verified" : "unclear",
    opportunityKind: toOpportunityKind(candidate),
    derivedFromSimilarArtist: null,
    contacts: [],
    confidence: clamp01(candidate.discoveryConfidence),
    evidence: [
      `Discovered by OpenAI Web Search using ${candidate.discoveryMethod}.`,
      ...candidate.evidenceSources.map((entry) => `${entry.sourceType}: ${entry.evidenceText} (${entry.url})`)
    ]
  };
}

function buildDiscoveryQueries(input: BookingSearchInput, mode: OpenAiDiscoveryMode, maxArtists: number): Array<{ kind: string; countKey: keyof OpenAIOpportunityDiscoveryDiagnostics["searches"]; prompt: string }> {
  const country = resolveTargetCountry(input) ?? input.artistProfile?.country ?? input.target ?? input.city;
  const genres = buildRelatedGenres(input.genre, input.artistProfile?.genres ?? []);
  const bookingArtists = selectEligibleSimilarArtistsForBookingVenueDiscovery(input.similarArtists ?? [], maxArtists).artists;
  const references = (input.similarArtists ?? []).filter((artist) => artist.bookingCategory === "reference").slice(0, 2);
  const artistNames = bookingArtists.map((artist) => artist.name);
  const referenceNames = references.map((artist) => artist.name);
  const common = `Return only sourced JSON candidates for ${input.artist}, a ${input.genre} artist targeting ${country}. Do not calculate final scores. Do not invent URLs.`;

  const prompts = [
    {
      kind: "festivals",
      countKey: "festivalQueries" as const,
      prompt: `${common} Find festivals in ${country} that regularly program ${genres.join(", ")} or closely related artists. Include festivals that are not exclusively ${input.genre} when programming proves compatibility. Return artists, editions or events that prove compatibility. Reference artists may be used only for festival or scene context: ${referenceNames.join(", ") || "none"}.`
    },
    {
      kind: "venues",
      countKey: "venueQueries" as const,
      prompt: `${common} Find venues in ${country} that hosted compatible ${genres.join(", ")} artists. Use genre searches and artist-based queries for these regional peers/support targets: ${artistNames.join(", ") || "none"}. Each venue must include programming evidence.`
    },
    {
      kind: "history",
      countKey: "similarArtistQueries" as const,
      prompt: `${common} Find verified concerts played by these comparable artists in ${country} during the last 24 months and upcoming concerts: ${artistNames.join(", ") || "none"}. Return event name, event date, venue, city, country, organizer/promoter when available and source type. Do not use reference artists for actionable venue history.`
    },
    {
      kind: "upcoming",
      countKey: "upcomingEventQueries" as const,
      prompt: `${common} Find upcoming concerts in ${country} occurring at least 30 full days from today (${new Date().toISOString().slice(0, 10)}) featuring ${genres.join(", ")} or closely related artists. Prioritize incomplete lineups, one announced headliner, small and medium venues, promoters known to book local support, and official event, venue or ticketing sources. Reject dates without a confirmed year.`
    },
    {
      kind: "organizations",
      countKey: "organizationQueries" as const,
      prompt: `${common} Find promoters, associations, collectives and recurring event organizers in ${country} that organize ${genres.join(", ")} or related concerts. Distinguish venue, promoter, association, festival and booking agency. Do not classify media articles, agenda pages or ticketing platforms as organizers.`
    }
  ];

  if (mode === "expanded") {
    prompts.push(
      {
        kind: "regional-venues",
        countKey: "venueQueries" as const,
        prompt: `${common} Expand venue discovery across French regions and target cities for ${genres.join(", ")} concerts. Search for official venue programming pages and reliable agendas with compatible lineups.`
      },
      {
        kind: "official-sources",
        countKey: "organizationQueries" as const,
        prompt: `${common} Find alternative official sources for compatible venues, festivals and promoters in ${country}, prioritizing official websites, official event pages and social profiles over editorial sources.`
      }
    );
  }
  return prompts;
}

function buildRelatedGenres(primary: string, profileGenres: string[]): string[] {
  const base = [primary, ...profileGenres];
  if (base.some((genre) => /punk|emo|easycore/i.test(genre))) {
    base.push("pop punk", "punk rock", "emo", "emo pop", "easycore", "skate punk", "melodic punk", "melodic hardcore", "post-hardcore");
  }
  return [...new Set(base.map((genre) => genre.trim()).filter(Boolean))];
}

function toCategory(candidateType: OpenAiDiscoveryCandidate["candidateType"]): BookingTargetCategory {
  if (candidateType === "association") return "association";
  if (candidateType === "promoter") return "promoter";
  return candidateType;
}

function toOpportunityKind(candidate: OpenAiDiscoveryCandidate): OpportunityKind {
  if (candidate.candidateType === "event") return "actionable";
  if (candidate.candidateType === "festival" && !candidate.compatibleArtists.some((artist) => artist.eventDate)) return "monitor";
  return "prospecting_target";
}

function toSourceType(category: BookingTargetCategory, sourceType?: OpenAiDiscoveryCandidate["evidenceSources"][number]["sourceType"]): BookingSourceType {
  if (category === "festival") return sourceType === "official_site" ? "festival_official_page" : "festival_page";
  if (category === "promoter" || category === "association") return sourceType === "official_site" ? "promoter_official_page" : "search_result";
  if (category === "venue") return sourceType === "official_site" ? "venue_official_programming_page" : "search_result";
  return sourceType === "ticketing" ? "event_page" : "event_page";
}

function selectPrimarySource(candidate: OpenAiDiscoveryCandidate): OpenAiDiscoveryCandidate["evidenceSources"][number] | null {
  const priority = ["official_site", "official_event", "social", "ticketing", "agenda", "editorial"];
  return [...candidate.evidenceSources].sort((left, right) => priority.indexOf(left.sourceType) - priority.indexOf(right.sourceType))[0] ?? null;
}

function selectVenueSourceUrl(candidate: OpenAiDiscoveryCandidate): string | null {
  const source = candidate.evidenceSources.find((entry) => entry.sourceType === "official_site") ??
    candidate.evidenceSources.find((entry) => entry.sourceType === "social");
  return source?.url ?? null;
}

function hasVerifiedIsoDate(candidate: OpenAiDiscoveryCandidate): boolean {
  const date = candidate.compatibleArtists[0]?.eventDate;
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date));
}

function createDiagnostics(mode: OpenAiDiscoveryMode): OpenAIOpportunityDiscoveryDiagnostics {
  return {
    mode,
    searches: { festivalQueries: 0, venueQueries: 0, similarArtistQueries: 0, upcomingEventQueries: 0, organizationQueries: 0 },
    candidates: { rawOpenAiCandidates: 0, festivals: 0, venues: 0, events: 0, promoters: 0, associations: 0, mergedWithOtherProviders: 0, rejected: 0, final: 0 },
    rejectedCandidates: [],
    apiCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiErrors: 0,
    malformedResponses: 0
  };
}

function resolveMode(env: OpenAIOpportunityDiscoveryEnv, override?: OpenAiDiscoveryMode): OpenAiDiscoveryMode {
  if (override) return override;
  return env.OPENAI_BOOKING_DISCOVERY_MODE === "expanded" ? "expanded" : "standard";
}

function buildCacheKey(input: BookingSearchInput, mode: OpenAiDiscoveryMode, kind: string, prompt: string): string {
  return [mode, kind, normalizeKey(input.artist), normalizeKey(input.genre), normalizeKey(input.target ?? input.city), hashPrompt(prompt)].join("|");
}

function hashPrompt(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function toRejected(candidate: OpenAiDiscoveryCandidate, rejectionReason: string): OpenAIOpportunityDiscoveryDiagnostics["rejectedCandidates"][number] {
  return { name: candidate.name, candidateType: candidate.candidateType, discoveryMethod: candidate.discoveryMethod, rejectionReason };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractCitedUrls(response: { output: unknown }): Set<string> {
  const urls = new Set<string>();
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: string }).type === "web_search_call") {
      const sources = (item as { action?: { sources?: unknown } }).action?.sources;
      if (!Array.isArray(sources)) continue;
      for (const source of sources) {
        const url = source && typeof source === "object" ? (source as { url?: unknown }).url : null;
        if (typeof url === "string") urls.add(normalizeUrl(url));
      }
    }
  }
  return urls;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(value, 1));
}
