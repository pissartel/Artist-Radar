import type { SimilarArtist } from "../../schemas.js";
import { selectTopCompatibleSimilarArtists } from "../similarArtistSelection.js";
import type { BookingSearchInput, BookingTarget, BookingTargetCategory } from "../types.js";
import type { BookingSourceProvider, BookingSourceProviderResult } from "./BookingSourceProvider.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import { OpenAIConcertClient, normalizeUrlForComparison, type ConcertSearchOutcome } from "../../providers/openaiConcerts/OpenAIConcertClient.js";
import { buildDateWindows, classifyStatusFromDate, isValidEventDate, isWithinWindow, type ConcertDateWindows } from "../../providers/openaiConcerts/dateWindows.js";
import { buildConcertSearchPrompt, type ConcertSearchArtistIdentity } from "../../providers/openaiConcerts/prompt.js";
import { assessArtistIdentity, normalizeArtistName } from "../../providers/openaiConcerts/identity.js";
import { classifyVerification } from "../../providers/openaiConcerts/verification.js";
import {
  createOpenAIConcertDiagnostics,
  type ConcertSource,
  type OpenAIConcertDiagnostics,
  type OpenAIWebConcert,
  type VerifiedConcert
} from "../../providers/openaiConcerts/types.js";

export interface OpenAIWebSearchConcertProviderEnv {
  ENABLE_OPENAI_CONCERT_DISCOVERY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_CONCERT_MODEL?: string;
  OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT?: string;
  OPENAI_CONCERT_PAST_MONTHS?: string;
  OPENAI_CONCERT_UPCOMING_MONTHS?: string;
  OPENAI_CONCERT_MAX_EVENTS_PER_ARTIST?: string;
  OPENAI_CONCERT_CONCURRENCY?: string;
}

export interface OpenAIWebSearchConcertProviderOptions {
  env?: OpenAIWebSearchConcertProviderEnv;
  /** Injectable for tests — never construct a second ad-hoc client in production code. */
  client?: OpenAIConcertClient;
  now?: Date;
}

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_SIMILAR_ARTIST_LIMIT = 5;
const DEFAULT_PAST_MONTHS = 18;
const DEFAULT_UPCOMING_MONTHS = 12;
const DEFAULT_MAX_EVENTS_PER_ARTIST = 10;
const DEFAULT_CONCURRENCY = 1;

export function isOpenAIConcertDiscoveryEnabled(env: OpenAIWebSearchConcertProviderEnv): boolean {
  return env.ENABLE_OPENAI_CONCERT_DISCOVERY === "true" && Boolean(env.OPENAI_API_KEY);
}

export function getOpenAIConcertDiscoveryStatus(env: OpenAIWebSearchConcertProviderEnv): { enabled: boolean; reason: string } {
  if (env.ENABLE_OPENAI_CONCERT_DISCOVERY !== "true") {
    return { enabled: false, reason: "ENABLE_OPENAI_CONCERT_DISCOVERY is not true" };
  }
  if (!env.OPENAI_API_KEY) {
    return { enabled: false, reason: "OPENAI_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled (OPENAI_API_KEY present)" };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

interface ArtistConcertSearchOutcome {
  artist: SimilarArtist;
  concerts: VerifiedConcert[];
  rawEventCount: number;
  confirmedCount: number;
  probableCount: number;
  unverifiedCount: number;
  rejectedCount: number;
  noUpcomingFoundInCheckedSources: boolean;
}

export function buildOpenAIWebSearchConcertProvider(options: OpenAIWebSearchConcertProviderOptions = {}): BookingSourceProvider {
  const env = options.env ?? process.env;
  const providerName = "openai_web_search_concerts";

  return {
    providerName,
    async search({ input }): Promise<BookingSourceProviderResult> {
      const status = getOpenAIConcertDiscoveryStatus(env);
      if (!status.enabled) {
        debugLog("openai-concerts", `Skipped: ${status.reason}`);
        return {
          sourceProvider: providerName,
          searchedQueries: [],
          targets: [],
          warnings: [`OpenAI Web Search concert discovery is disabled: ${status.reason}.`],
          metadata: { enabled: false, reason: status.reason }
        };
      }

      debugLog("openai-concerts", "Integration enabled");
      const model = env.OPENAI_CONCERT_MODEL || DEFAULT_MODEL;
      debugLog("openai-concerts", `Model: ${model}`);

      const client = options.client ?? new OpenAIConcertClient({ apiKey: env.OPENAI_API_KEY!, model });
      const now = options.now ?? new Date();

      const limit = parsePositiveInt(env.OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT, DEFAULT_SIMILAR_ARTIST_LIMIT);
      const pastMonths = parsePositiveInt(env.OPENAI_CONCERT_PAST_MONTHS, DEFAULT_PAST_MONTHS);
      const upcomingMonths = parsePositiveInt(env.OPENAI_CONCERT_UPCOMING_MONTHS, DEFAULT_UPCOMING_MONTHS);
      const maxEventsPerArtist = parsePositiveInt(env.OPENAI_CONCERT_MAX_EVENTS_PER_ARTIST, DEFAULT_MAX_EVENTS_PER_ARTIST);
      const concurrency = parsePositiveInt(env.OPENAI_CONCERT_CONCURRENCY, DEFAULT_CONCURRENCY);

      const similarArtists = selectTopCompatibleSimilarArtists(input.similarArtists ?? [], limit);
      debugLog("openai-concerts", `Selected ${similarArtists.length} similar artists`);
      similarArtists.forEach((artist, index) => {
        debugLog("openai-concerts", `${index + 1}. ${artist.name} — compatibility: ${(artist.totalRelevance / 100).toFixed(2)}`);
      });

      const perArtistOutcomes = await mapWithConcurrency(similarArtists, concurrency, (artist) =>
        searchArtistConcerts(client, artist, now, pastMonths, upcomingMonths, maxEventsPerArtist)
      );

      const diagnostics = createOpenAIConcertDiagnostics(true);
      diagnostics.selectedArtistCount = similarArtists.length;
      diagnostics.searchesTriggered = perArtistOutcomes.length;
      diagnostics.apiCalls = client.diagnostics.apiCalls;
      diagnostics.apiErrors = client.diagnostics.apiErrors;
      diagnostics.malformedResponses = client.diagnostics.malformedResponses;
      diagnostics.cacheHits = client.diagnostics.cacheHits;
      diagnostics.cacheMisses = client.diagnostics.cacheMisses;

      const venueEvidenceCounts = buildVenueEvidenceCounts(perArtistOutcomes);
      const targets: BookingTarget[] = [];

      for (const outcome of perArtistOutcomes) {
        diagnostics.rawEvents += outcome.rawEventCount;
        diagnostics.confirmedEvents += outcome.confirmedCount;
        diagnostics.probableEvents += outcome.probableCount;
        diagnostics.unverifiedEvents += outcome.unverifiedCount;
        diagnostics.rejectedEvents += outcome.rejectedCount;

        for (const concert of outcome.concerts) {
          diagnostics.sourceCount += concert.sources.length;
          targets.push(toBookingTarget(input, outcome.artist, concert, venueEvidenceCounts));
        }
      }

      logSummary(perArtistOutcomes, diagnostics);

      return {
        sourceProvider: providerName,
        searchedQueries: similarArtists.map((artist) => artist.name),
        targets,
        warnings: [],
        metadata: { enabled: true, diagnostics }
      };
    }
  };
}

async function searchArtistConcerts(
  client: OpenAIConcertClient,
  artist: SimilarArtist,
  now: Date,
  pastMonths: number,
  upcomingMonths: number,
  maxEventsPerArtist: number
): Promise<ArtistConcertSearchOutcome> {
  const windows = buildDateWindows(now, pastMonths, upcomingMonths);
  debugLog("openai-concerts", `[${artist.name}] Search triggered`);
  debugLog(
    "openai-concerts",
    `[${artist.name}] Date windows: past=${windows.pastStart}..${windows.pastEnd} upcoming=${windows.upcomingStart}..${windows.upcomingEnd}`
  );

  const identity: ConcertSearchArtistIdentity = {
    name: artist.name,
    city: artist.city,
    country: artist.country,
    genres: artist.genres,
    officialWebsite: artist.url,
    spotifyUrl: artist.spotifyUrl ?? null,
    instagramUrl: artist.instagramUrl ?? null,
    youtubeUrl: artist.youtubeUrl ?? null
  };
  const prompt = buildConcertSearchPrompt(identity, windows);
  const cacheKey = `${normalizeArtistName(artist.name)}|${windows.pastStart}|${windows.upcomingEnd}`;

  const outcome = await client.search(cacheKey, prompt);
  const empty = (): ArtistConcertSearchOutcome => ({
    artist,
    concerts: [],
    rawEventCount: 0,
    confirmedCount: 0,
    probableCount: 0,
    unverifiedCount: 0,
    rejectedCount: 0,
    noUpcomingFoundInCheckedSources: false
  });

  if (!outcome) {
    debugLog("openai-concerts", `[${artist.name}] No result (API error or malformed response) — skipped`);
    return empty();
  }

  const identityAssessment = assessArtistIdentity(artist.name, outcome.result);
  if (identityAssessment.status === "rejected") {
    debugLog("openai-concerts", `[${artist.name}] Identity rejected: ${identityAssessment.reason}`);
    return empty();
  }
  if (identityAssessment.status === "ambiguous") {
    debugLog("openai-concerts", `[${artist.name}] Identity ambiguous (confidence ${identityAssessment.confidence.toFixed(2)}) — diagnostics only, not used`);
    return empty();
  }

  const rawEvents: Array<{ event: OpenAIWebConcert; requestedWindow: "past" | "upcoming" }> = [
    ...outcome.result.pastConcerts.map((event) => ({ event, requestedWindow: "past" as const })),
    ...outcome.result.upcomingConcerts.map((event) => ({ event, requestedWindow: "upcoming" as const }))
  ];

  const verified: VerifiedConcert[] = [];
  let confirmedCount = 0;
  let probableCount = 0;
  let unverifiedCount = 0;
  let rejectedCount = 0;

  for (const { event, requestedWindow } of rawEvents) {
    const rejection = validateEvent(event, windows, requestedWindow, outcome.citedUrls);
    if (rejection) {
      rejectedCount += 1;
      debugLog("openai-concerts", `[${artist.name}] REJECT event reason=${rejection} date=${event.date} venue=${event.venue?.name ?? "Unknown"}`);
      continue;
    }

    const validSources: ConcertSource[] = event.sources
      .filter((source) => outcome.citedUrls.has(normalizeUrlForComparison(source.url)))
      .map((source) => ({
        provider: "openai_web_search" as const,
        url: source.url,
        title: source.title,
        sourceType: source.sourceType,
        retrievedAt: new Date().toISOString()
      }));

    const status = classifyStatusFromDate(event.date, event.status, now);
    const verificationStatus = classifyVerification({
      sourceTypes: validSources.map((s) => s.sourceType!),
      hasVenue: Boolean(event.venue?.name),
      hasCompleteDate: isValidEventDate(event.date)
    });

    if (verificationStatus === "unverified") {
      unverifiedCount += 1;
      continue;
    }
    if (verificationStatus === "confirmed") confirmedCount += 1;
    if (verificationStatus === "probable") probableCount += 1;

    verified.push({
      artistName: artist.name,
      eventName: event.eventName,
      date: event.date,
      status,
      venue: event.venue,
      lineup: event.lineup ?? [],
      eventType: event.eventType,
      sources: validSources,
      evidenceSummary: event.evidenceSummary,
      verificationStatus
    });
  }

  const bounded = verified
    .sort((left, right) => verificationRank(right.verificationStatus) - verificationRank(left.verificationStatus))
    .slice(0, maxEventsPerArtist);

  const upcomingFound = bounded.filter((concert) => concert.status === "upcoming").length;
  const pastFound = bounded.filter((concert) => concert.status === "past").length;
  debugLog("openai-concerts", `[${artist.name}] Raw extracted events: ${rawEvents.length}`);
  debugLog("openai-concerts", `[${artist.name}] Confirmed: ${confirmedCount}`);
  debugLog("openai-concerts", `[${artist.name}] Probable: ${probableCount}`);
  debugLog("openai-concerts", `[${artist.name}] Unverified: ${unverifiedCount}`);
  debugLog("openai-concerts", `[${artist.name}] Rejected: ${rejectedCount}`);
  debugLog("openai-concerts", `[${artist.name}] Past: ${pastFound}`);
  debugLog("openai-concerts", `[${artist.name}] Upcoming found: ${upcomingFound}`);
  if (upcomingFound === 0) {
    debugLog("openai-concerts", `[${artist.name}] No upcoming concerts found in checked sources`);
  }

  return {
    artist,
    concerts: bounded,
    rawEventCount: rawEvents.length,
    confirmedCount,
    probableCount,
    unverifiedCount,
    rejectedCount,
    noUpcomingFoundInCheckedSources: upcomingFound === 0
  };
}

function verificationRank(status: VerifiedConcert["verificationStatus"]): number {
  return status === "confirmed" ? 2 : status === "probable" ? 1 : 0;
}

/** Returns a rejection reason string, or null when the event is acceptable. */
function validateEvent(
  event: OpenAIWebConcert,
  windows: ConcertDateWindows,
  requestedWindow: "past" | "upcoming",
  citedUrls: Set<string>
): string | null {
  if (!isValidEventDate(event.date)) {
    return "invalid_date";
  }
  if (!event.venue?.name) {
    return "missing_venue";
  }
  const window = requestedWindow === "past" ? [windows.pastStart, windows.pastEnd] : [windows.upcomingStart, windows.upcomingEnd];
  if (!isWithinWindow(event.date, window[0], window[1])) {
    return "outside_requested_window";
  }
  const hasValidSource = event.sources.some((source) => citedUrls.has(normalizeUrlForComparison(source.url)));
  if (!hasValidSource) {
    return "missing_source_url";
  }
  return null;
}

function buildVenueEvidenceCounts(outcomes: ArtistConcertSearchOutcome[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    for (const concert of outcome.concerts) {
      if (concert.verificationStatus === "unverified" || concert.verificationStatus === "rejected") {
        continue;
      }
      const key = venueEvidenceKey(concert.venue.name, concert.venue.city);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function venueEvidenceKey(name: string, city: string | null): string {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/^(the|le|la|les|l')\s+/, "")
      .replace(/[^a-z0-9]/g, "");
  return `${normalize(name)}|${city ? normalize(city) : ""}`;
}

function toBookingTarget(
  input: BookingSearchInput,
  artist: SimilarArtist,
  concert: VerifiedConcert,
  venueEvidenceCounts: Map<string, number>
): BookingTarget {
  const category: BookingTargetCategory = concert.eventType === "festival" ? "festival" : "event";
  const venueKey = venueEvidenceKey(concert.venue.name, concert.venue.city);
  const matchingArtistCount = venueEvidenceCounts.get(venueKey) ?? 1;

  const identityConfidence = 0.75; // identity already validated as "resolved" before reaching here
  const confidence = computeConfidence(concert.verificationStatus, identityConfidence, matchingArtistCount);

  const supportSlot = assessSupportSlot(concert.lineup, concert.status);

  const evidence = uniqueStrings([
    `Found via OpenAI web search as a concert by similar artist ${artist.name} (compatibility ${artist.totalRelevance}/100).`,
    `Verification: ${concert.verificationStatus} (${concert.sources.length} source${concert.sources.length === 1 ? "" : "s"}).`,
    concert.evidenceSummary,
    supportSlot.explanation,
    concert.status === "past" ? "This is a past event — retained only as opportunistic evidence, not confirmation of current booking activity." : null,
    ...concert.sources.map((source) => source.url)
  ]);

  return {
    name: concert.eventName ?? `${artist.name} — live in ${concert.venue.city ?? concert.venue.name}`,
    category,
    city: concert.venue.city ?? input.city,
    country: concert.venue.country ?? null,
    description: concert.eventName,
    sourceUrl: concert.sources[0]?.url ?? null,
    sourceType: "event_page",
    sourceProvider: "openai_web_search",
    genres: artist.genres ?? [],
    venueName: concert.venue.name,
    lineup: concert.lineup,
    imageUrl: null,
    ticketUrl: null,
    eventDate: concert.date,
    isFutureEvent: concert.status === "upcoming",
    isPastEvent: concert.status === "past",
    dateConfidence: "verified",
    opportunityKind: concert.status === "upcoming" ? "actionable" : "historical_signal",
    derivedFromSimilarArtist: {
      name: artist.name,
      popularityComparison: "unknown",
      matchedGenres: artist.genres ?? [],
      sourceUrl: concert.sources[0]?.url ?? null
    },
    contacts: [],
    confidence,
    evidence
  };
}

function computeConfidence(verificationStatus: VerifiedConcert["verificationStatus"], identityConfidence: number, venueEvidenceCount: number): number {
  const base = verificationStatus === "confirmed" ? 0.75 : 0.55;
  const identityAdjustment = (identityConfidence - 0.5) * 0.2;
  const venueBoost = Math.min((venueEvidenceCount - 1) * 0.05, 0.15);
  return Math.max(0.1, Math.min(0.95, base + identityAdjustment + venueBoost));
}

function assessSupportSlot(lineup: string[], status: VerifiedConcert["status"]): { signal: "possible" | "unlikely" | "unknown"; explanation: string } {
  if (lineup.length >= 2) {
    return { signal: "unlikely", explanation: `${lineup.length} artists are already listed for this event, so an open support slot is unlikely.` };
  }
  if (lineup.length === 1 && status === "upcoming") {
    return {
      signal: "possible",
      explanation: "Only one artist is currently listed for a future event. Web sources may list an incomplete lineup, so this is not confirmation of an available support slot."
    };
  }
  return { signal: "unknown", explanation: "No usable lineup information is available for this event." };
}

function logSummary(outcomes: ArtistConcertSearchOutcome[], diagnostics: OpenAIConcertDiagnostics): void {
  const verifiedTotal = diagnostics.confirmedEvents + diagnostics.probableEvents;
  if (diagnostics.enabled) {
    debugLog(
      "openai-concerts",
      `[summary] rawEvents=${diagnostics.rawEvents} confirmed=${diagnostics.confirmedEvents} probable=${diagnostics.probableEvents} unverified=${diagnostics.unverifiedEvents} rejected=${diagnostics.rejectedEvents} apiCalls=${diagnostics.apiCalls} cacheHits=${diagnostics.cacheHits}`
    );
  }
  warnLog("openai-concerts", `Found ${verifiedTotal} verified concert record${verifiedTotal === 1 ? "" : "s"} for ${outcomes.length} similar artist${outcomes.length === 1 ? "" : "s"}`);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
