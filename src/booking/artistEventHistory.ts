import { matchBookingGenres } from "./genreMatching.js";
import { compareArtistPopularity } from "./relevance.js";
import type {
  BookingSearchInput,
  BookingTarget,
  DerivedFromSimilarArtist,
  VenueArtistEvidence
} from "./types.js";
import type { SimilarArtist } from "../schemas.js";
import { toDateOnlyString } from "../utils/dateOnly.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { resolveVenueOfficialUrl } from "./venueUrl.js";

// Configurable limits (issue #182). Keep every magic number for this
// pipeline here rather than scattered across providers, and allow env
// overrides using the same pattern as relevance.ts's getRecentEventMonths.
export const MAX_SIMILAR_ARTISTS_FOR_VENUE_DISCOVERY = 10;
export const MAX_HISTORICAL_EVENTS_PER_ARTIST = 20;
export const HISTORICAL_EVENT_LOOKBACK_MONTHS = 24;
export const DEFAULT_EVENT_HISTORY_ARTIST_CONCURRENCY = 3;

export interface ArtistEventHistoryEnv {
  BOOKING_MAX_SIMILAR_ARTISTS_FOR_VENUE_HISTORY?: string;
  BOOKING_MAX_HISTORICAL_EVENTS_PER_ARTIST?: string;
  BOOKING_HISTORICAL_EVENT_LOOKBACK_MONTHS?: string;
}

export function getMaxSimilarArtistsForVenueDiscovery(env: ArtistEventHistoryEnv = process.env): number {
  return parsePositiveInt(env.BOOKING_MAX_SIMILAR_ARTISTS_FOR_VENUE_HISTORY, MAX_SIMILAR_ARTISTS_FOR_VENUE_DISCOVERY);
}

export function getMaxHistoricalEventsPerArtist(env: ArtistEventHistoryEnv = process.env): number {
  return parsePositiveInt(env.BOOKING_MAX_HISTORICAL_EVENTS_PER_ARTIST, MAX_HISTORICAL_EVENTS_PER_ARTIST);
}

export function getHistoricalEventLookbackMonths(env: ArtistEventHistoryEnv = process.env): number {
  return parsePositiveInt(env.BOOKING_HISTORICAL_EVENT_LOOKBACK_MONTHS, HISTORICAL_EVENT_LOOKBACK_MONTHS);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface HistoricalArtistEvent {
  artistName: string;
  artistExternalIds?: Record<string, string>;
  eventName?: string | null;
  eventDate?: string | null;
  venueName?: string | null;
  city?: string | null;
  country?: string | null;
  sourceUrl: string | null;
  sourceProvider: string;
  lineup?: string[];
  organizer?: string | null;
  confidence: number;
}

export interface ArtistEventHistoryProvider {
  providerName: string;
  findPastEvents(input: {
    artistName: string;
    artistExternalIds?: Record<string, string>;
    countries?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Promise<HistoricalArtistEvent[]>;
}

export interface VenueCandidateGenerationOptions {
  now?: Date;
  lookbackMonths?: number;
}

export function selectSimilarArtistsForLiveHistory(input: BookingSearchInput, limit: number): SimilarArtist[] {
  const useful = [...(input.similarArtists ?? [])]
    .filter((artist) => isCompatibleSimilarArtistForLiveHistory(input, artist))
    .sort((left, right) => scoreSimilarArtistSelection(input, right) - scoreSimilarArtistSelection(input, left));

  const peerFirst = useful.filter((artist) => artist.bookingCategory !== "reference");
  const references = useful.filter((artist) => artist.bookingCategory === "reference");
  return [...peerFirst, ...references].slice(0, limit);
}

function isCompatibleSimilarArtistForLiveHistory(input: BookingSearchInput, artist: SimilarArtist): boolean {
  const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], artist.genres, artist.reason);
  if (genreMatch.level !== "exact" && genreMatch.level !== "related") {
    return false;
  }
  if (artist.bookingCategory === "reference") {
    return compareArtistPopularity(input, artist).score >= 50;
  }
  return compareArtistPopularity(input, artist).score >= 40 || artist.artistTier === "small" || artist.artistTier === "medium";
}

export function dedupeHistoricalArtistEvents(events: HistoricalArtistEvent[]): HistoricalArtistEvent[] {
  const seen = new Set<string>();
  const deduped: HistoricalArtistEvent[] = [];

  for (const event of events) {
    const key = [
      normalizeKey(event.artistName),
      toDateOnlyString(event.eventDate ?? "") ?? "",
      normalizeKey(event.venueName ?? ""),
      normalizeKey(event.city ?? ""),
      normalizeUrl(event.sourceUrl)
    ].join("|");

    if (!event.sourceUrl || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      ...event,
      eventDate: toDateOnlyString(event.eventDate ?? "") ?? event.eventDate ?? null,
      confidence: clampConfidence(event.confidence)
    });
  }

  return deduped;
}

export function buildVenueTargetsFromArtistEventHistory(
  input: BookingSearchInput,
  similarArtists: SimilarArtist[],
  events: HistoricalArtistEvent[],
  options: VenueCandidateGenerationOptions = {}
): BookingTarget[] {
  const now = options.now ?? new Date();
  const lookbackMonths = options.lookbackMonths ?? getHistoricalEventLookbackMonths();
  const artistById = new Map(similarArtists.map((artist) => [similarArtistId(artist.name), artist]));
  const dedupedEvents = dedupeHistoricalArtistEvents(events)
    .filter((event) => event.venueName && event.sourceUrl)
    .filter((event) => isWithinLookbackOrUndated(event.eventDate ?? null, now, lookbackMonths));
  const venues = new Map<string, {
    venueId: string;
    name: string;
    city: string | null;
    country: string | null;
    // Every matching event's own sourceUrl, kept only as a candidate pool —
    // the venue's primary URL is resolved from these via
    // resolveVenueOfficialUrl below, never assigned directly, so a concert's
    // event/ticket page is never used as the venue opportunity's link.
    sourceUrlCandidates: string[];
    genres: string[];
    pastProgramming: string[];
    evidence: VenueArtistEvidence[];
    textEvidence: string[];
    derivedFromSimilarArtist: DerivedFromSimilarArtist | null;
  }>();

  for (const event of dedupedEvents) {
    const artist = artistById.get(similarArtistId(event.artistName));
    if (!artist || !event.venueName || !event.sourceUrl) {
      continue;
    }

    const venueId = venueIdentity(event.venueName, event.city ?? null, event.country ?? null);
    const popularity = compareArtistPopularity(input, artist);
    const genreMatch = matchBookingGenres([input.genre, ...(input.artistProfile?.genres ?? [])], artist.genres, artist.reason);
    const confidence = scoreVenueEvidenceConfidence(input, event, popularity.score, now, lookbackMonths);
    const evidence: VenueArtistEvidence = {
      venueId,
      similarArtistId: similarArtistId(artist.name),
      similarArtistName: artist.name,
      eventName: event.eventName ?? undefined,
      eventDate: toDateOnlyString(event.eventDate ?? "") ?? undefined,
      sourceUrl: event.sourceUrl,
      collectedAt: now.toISOString(),
      sourceProvider: event.sourceProvider,
      confidence
    };
    const existing = venues.get(venueId);
    const textEvidence = [
      `Similar artist ${artist.name} played ${event.venueName}.`,
      event.eventDate ? `Historical concert date: ${toDateOnlyString(event.eventDate) ?? event.eventDate}.` : "Historical concert date unavailable.",
      event.eventName ? `Event: ${event.eventName}.` : null,
      event.organizer ? `Organizer/promoter: ${event.organizer}.` : null,
      `Popularity comparison: ${popularity.comparison}.`,
      genreMatch.matchedGenres.length > 0 ? `Matched genres: ${genreMatch.matchedGenres.join(", ")}.` : null
    ].filter((value): value is string => Boolean(value));

    if (existing) {
      existing.evidence.push(evidence);
      existing.genres = uniqueStrings([...existing.genres, ...artist.genres, ...genreMatch.matchedGenres]);
      existing.pastProgramming = uniqueStrings([...existing.pastProgramming, artist.name, ...(event.lineup ?? [])]);
      existing.textEvidence = uniqueStrings([...existing.textEvidence, ...textEvidence]);
      existing.sourceUrlCandidates.push(event.sourceUrl);
      continue;
    }

    venues.set(venueId, {
      venueId,
      name: event.venueName,
      city: event.city ?? null,
      country: event.country ?? input.artistProfile?.country ?? null,
      sourceUrlCandidates: [event.sourceUrl],
      genres: uniqueStrings([...artist.genres, ...genreMatch.matchedGenres]),
      pastProgramming: uniqueStrings([artist.name, ...(event.lineup ?? [])]),
      evidence: [evidence],
      textEvidence,
      derivedFromSimilarArtist: {
        name: artist.name,
        popularityComparison: popularity.comparison,
        matchedGenres: genreMatch.matchedGenres,
        sourceUrl: event.sourceUrl
      }
    });
  }

  return [...venues.values()].map((venue): BookingTarget => {
    const confidence = scoreVenueCandidateConfidence(venue.evidence, now, lookbackMonths);
    // None of these candidates are independently verified as the venue's own
    // site — they're all concert-discovery source URLs — so
    // resolveVenueOfficialUrl only ever accepts one that doesn't itself look
    // like a specific event/ticket/artist/aggregator page. `null` (never a
    // concert URL) when nothing qualifies.
    const resolvedUrl = resolveVenueOfficialUrl(venue.sourceUrlCandidates.map((url) => ({ url, verified: false })));
    return {
      name: venue.name,
      category: "venue",
      city: venue.city,
      country: venue.country,
      description: uniqueStrings([
        `${venue.name} has historical programming evidence from compatible similar artists.`,
        ...venue.textEvidence
      ]).join(" "),
      sourceUrl: resolvedUrl,
      sourceType: resolvedUrl ? "venue_official_programming_page" : "similar_artist_live_history",
      sourceProvider: "similar_artist_event_history",
      genres: venue.genres,
      estimatedCapacity: null,
      estimatedArtistTier: null,
      pastProgramming: venue.pastProgramming,
      venueName: venue.name,
      lineup: venue.pastProgramming,
      imageUrl: null,
      ticketUrl: null,
      eventDate: mostRecentEventDate(venue.evidence),
      eventDateRange: null,
      isFutureEvent: null,
      isPastEvent: null,
      dateConfidence: null,
      opportunityKind: null,
      ageMonths: null,
      deadline: null,
      recommendedAction: null,
      derivedFromSimilarArtist: venue.derivedFromSimilarArtist,
      venueArtistEvidence: venue.evidence,
      contacts: [],
      confidence,
      evidence: uniqueStrings([
        ...venue.textEvidence,
        `Venue evidence records: ${venue.evidence.length}.`,
        `Compatible similar artists found at venue: ${new Set(venue.evidence.map((item) => item.similarArtistId)).size}.`
      ])
    };
  });
}

export function buildArtistExternalIds(artist: SimilarArtist): Record<string, string> {
  return Object.fromEntries([
    ["spotify", artist.spotifyId],
    ["youtube", artist.youtubeChannelId ?? null],
    ["instagram", artist.instagramHandle ?? null]
  ].filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export interface HistoricalEventFetchOptions {
  maxHistoricalEventsPerArtist?: number;
  countries?: string[];
  dateFrom?: string;
  dateTo?: string;
  concurrency?: number;
}

export interface ArtistEventHistoryProviderDiagnostic {
  providerName: string;
  artistName: string;
  status: "ok" | "failed";
  eventCount: number;
  message?: string;
}

export interface HistoricalEventFetchResult {
  events: HistoricalArtistEvent[];
  warnings: string[];
  providerDiagnostics: ArtistEventHistoryProviderDiagnostic[];
}

// Fans out to every event-history provider for every selected similar
// artist with bounded artist concurrency (issue #182 cost controls). A
// failing provider or artist never aborts the others: each artist x provider
// call is isolated via Promise.allSettled, and failures are surfaced as
// warnings/diagnostics rather than swallowed or thrown.
export async function fetchHistoricalEventsForSimilarArtists(
  artists: SimilarArtist[],
  providers: ArtistEventHistoryProvider[],
  options: HistoricalEventFetchOptions = {}
): Promise<HistoricalEventFetchResult> {
  const maxPerArtist = options.maxHistoricalEventsPerArtist ?? getMaxHistoricalEventsPerArtist();
  const concurrency = options.concurrency ?? DEFAULT_EVENT_HISTORY_ARTIST_CONCURRENCY;
  const warnings: string[] = [];
  const providerDiagnostics: ArtistEventHistoryProviderDiagnostic[] = [];

  if (providers.length === 0 || artists.length === 0) {
    return { events: [], warnings, providerDiagnostics };
  }

  const perArtistEvents = await mapWithConcurrency(artists, concurrency, async (artist) => {
    const externalIds = buildArtistExternalIds(artist);
    const outcomes = await Promise.allSettled(
      providers.map((provider) =>
        provider.findPastEvents({
          artistName: artist.name,
          artistExternalIds: Object.keys(externalIds).length > 0 ? externalIds : undefined,
          countries: options.countries,
          dateFrom: options.dateFrom,
          dateTo: options.dateTo
        })
      )
    );

    const events: HistoricalArtistEvent[] = [];
    outcomes.forEach((outcome, index) => {
      const provider = providers[index];
      if (outcome.status === "fulfilled") {
        const kept = outcome.value.slice(0, maxPerArtist);
        events.push(...kept);
        providerDiagnostics.push({ providerName: provider.providerName, artistName: artist.name, status: "ok", eventCount: kept.length });
      } else {
        const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        warnings.push(`${provider.providerName} failed for "${artist.name}": ${message}`);
        providerDiagnostics.push({ providerName: provider.providerName, artistName: artist.name, status: "failed", eventCount: 0, message });
      }
    });
    return events;
  });

  return {
    events: perArtistEvents.flat(),
    warnings,
    providerDiagnostics
  };
}

function scoreSimilarArtistSelection(input: BookingSearchInput, artist: SimilarArtist): number {
  const popularity = compareArtistPopularity(input, artist);
  const localBonus = normalizeKey(artist.city ?? "") === normalizeKey(input.city) ? 18 : artist.localRelevance / 10;
  const tierBonus = artist.artistTier === "small" ? 18 : artist.artistTier === "medium" ? 14 : artist.artistTier === "large" ? -20 : 0;
  const categoryBonus = artist.bookingCategory === "local_peer" ? 20
    : artist.bookingCategory === "regional_peer" ? 16
      : artist.bookingCategory === "support_target" ? 8
        : artist.bookingCategory === "reference" ? -30
          : 0;
  return artist.genreRelevance + popularity.score + localBonus + tierBonus + categoryBonus;
}

function scoreVenueEvidenceConfidence(
  input: BookingSearchInput,
  event: HistoricalArtistEvent,
  popularityScore: number,
  now: Date,
  lookbackMonths: number
): number {
  const sourceBonus = event.sourceUrl && isOfficialSource(event.sourceUrl) ? 0.12 : 0;
  const locationBonus = normalizeKey(event.city ?? "") === normalizeKey(input.city) ? 0.08 : 0;
  const recencyBonus = event.eventDate && monthsSince(event.eventDate, now) <= lookbackMonths ? 0.08 : 0;
  const popularityBonus = popularityScore >= 70 ? 0.08 : popularityScore >= 50 ? 0.04 : 0;
  return clampConfidence(event.confidence + sourceBonus + locationBonus + recencyBonus + popularityBonus);
}

function scoreVenueCandidateConfidence(evidence: VenueArtistEvidence[], now: Date, lookbackMonths: number): number {
  const uniqueArtistCount = new Set(evidence.map((item) => item.similarArtistId)).size;
  const recentCount = evidence.filter((item) => item.eventDate && monthsSince(item.eventDate, now) <= lookbackMonths).length;
  const officialCount = evidence.filter((item) => isOfficialSource(item.sourceUrl)).length;
  const averageEvidenceConfidence = evidence.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, evidence.length);
  return clampConfidence(
    averageEvidenceConfidence +
    Math.min(0.16, (uniqueArtistCount - 1) * 0.06) +
    Math.min(0.08, (evidence.length - 1) * 0.03) +
    Math.min(0.08, recentCount * 0.02) +
    Math.min(0.08, officialCount * 0.02)
  );
}

function mostRecentEventDate(evidence: VenueArtistEvidence[]): string | null {
  const dates = evidence.map((item) => item.eventDate).filter((value): value is string => Boolean(value)).sort();
  return dates.at(-1) ?? null;
}

function isWithinLookbackOrUndated(eventDate: string | null, now: Date, lookbackMonths: number): boolean {
  if (!eventDate) {
    return true;
  }
  return monthsSince(eventDate, now) <= lookbackMonths;
}

function monthsSince(eventDate: string, now: Date): number {
  const normalized = toDateOnlyString(eventDate);
  if (!normalized) {
    return Number.POSITIVE_INFINITY;
  }
  const left = new Date(`${normalized}T00:00:00Z`);
  const right = new Date(`${toDateOnlyString(now) ?? now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, (right.getFullYear() - left.getFullYear()) * 12 + right.getMonth() - left.getMonth());
}

function isOfficialSource(sourceUrl: string): boolean {
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
    return ![
      "songkick.com",
      "bandsintown.com",
      "setlist.fm",
      "last.fm",
      "facebook.com",
      "instagram.com",
      "youtube.com"
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function venueIdentity(venueName: string, city: string | null, country: string | null): string {
  return [normalizeVenueName(venueName, city), normalizeKey(city ?? ""), normalizeKey(country ?? "")].filter(Boolean).join(":");
}

const LEADING_FRENCH_ARTICLE_PATTERN = /^(le|la|les|l['’])\s*/i;

// Handles common venue-name variants for the same place, e.g. "Le Krakatoa",
// "Krakatoa" and "Krakatoa Mérignac" (issue #182): strips a leading French
// article and, when the venue name is suffixed with its own city, that
// suffix too, so all three collapse to the same dedup identity. Only used
// for the identity key, never for the displayed venue name.
function normalizeVenueName(venueName: string, city: string | null): string {
  const withoutArticle = normalizeKey(venueName).replace(LEADING_FRENCH_ARTICLE_PATTERN, "").trim();
  const normalizedCity = city ? normalizeKey(city) : "";
  if (!normalizedCity || !withoutArticle.endsWith(` ${normalizedCity}`)) {
    return withoutArticle;
  }
  const withoutCitySuffix = withoutArticle.slice(0, -(normalizedCity.length + 1)).trim();
  return withoutCitySuffix || withoutArticle;
}

export function similarArtistId(name: string): string {
  return normalizeKey(name).replace(/\s+/g, "-");
}

function normalizeUrl(value: string | null): string {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeKey(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(value, 1));
}
