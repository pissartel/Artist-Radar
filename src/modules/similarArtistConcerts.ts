import type { SimilarArtist } from "../schemas.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { toDateOnlyString } from "../utils/dateOnly.js";
import { debugLog, warnLog } from "../utils/logger.js";
import { normalizeKey, normalizeVenueName } from "../utils/venueNameNormalization.js";
import { searchMusicBrainzArtistByName, type MusicBrainzArtistMetadata } from "../services/musicBrainzService.js";
import type {
  ArtistConcert,
  ArtistConcertProvider,
  ArtistIdentity
} from "../providers/concerts/ArtistConcertProvider.js";

// Configurable limits, env-overridable via a small parsePositiveInt getter.
export const DEFAULT_SIMILAR_ARTISTS_CONCERT_LIMIT = 10;
export const DEFAULT_RECENT_PAST_MONTHS = 18;
export const DEFAULT_PAST_EVENTS_PER_ARTIST = 10;
export const DEFAULT_UPCOMING_EVENTS_PER_ARTIST = 10;
const DEFAULT_ARTIST_CONCURRENCY = 3;

export interface SimilarArtistConcertsEnv {
  SIMILAR_ARTISTS_CONCERT_LIMIT?: string;
  RECENT_PAST_MONTHS?: string;
  PAST_EVENTS_PER_ARTIST?: string;
  UPCOMING_EVENTS_PER_ARTIST?: string;
}

export function getSimilarArtistsConcertLimit(env: SimilarArtistConcertsEnv = process.env): number {
  return parsePositiveInt(env.SIMILAR_ARTISTS_CONCERT_LIMIT, DEFAULT_SIMILAR_ARTISTS_CONCERT_LIMIT);
}

export function getRecentPastMonths(env: SimilarArtistConcertsEnv = process.env): number {
  return parsePositiveInt(env.RECENT_PAST_MONTHS, DEFAULT_RECENT_PAST_MONTHS);
}

export function getPastEventsPerArtist(env: SimilarArtistConcertsEnv = process.env): number {
  return parsePositiveInt(env.PAST_EVENTS_PER_ARTIST, DEFAULT_PAST_EVENTS_PER_ARTIST);
}

export function getUpcomingEventsPerArtist(env: SimilarArtistConcertsEnv = process.env): number {
  return parsePositiveInt(env.UPCOMING_EVENTS_PER_ARTIST, DEFAULT_UPCOMING_EVENTS_PER_ARTIST);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface SimilarArtistConcertsResult {
  artist: SimilarArtist;
  pastConcerts: ArtistConcert[];
  upcomingConcerts: ArtistConcert[];
}

export interface FindSimilarArtistConcertsOptions {
  limit?: number;
  pastEventsPerArtist?: number;
  upcomingEventsPerArtist?: number;
  recentPastMonths?: number;
  concurrency?: number;
  now?: Date;
  musicBrainzSearch?: (artistName: string) => Promise<MusicBrainzArtistMetadata | null>;
}

/**
 * Deterministically sorts by compatibility (SimilarArtist.totalRelevance,
 * 0-100) and takes the top `limit`. Ties break by name so the selection is
 * fully reproducible for the same input — never random.
 */
export function selectTopCompatibleSimilarArtists(artists: SimilarArtist[], limit: number): SimilarArtist[] {
  return [...artists]
    .sort((left, right) => {
      if (right.totalRelevance !== left.totalRelevance) {
        return right.totalRelevance - left.totalRelevance;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

export async function findSimilarArtistConcerts(
  similarArtists: SimilarArtist[],
  providers: ArtistConcertProvider[],
  options: FindSimilarArtistConcertsOptions = {}
): Promise<SimilarArtistConcertsResult[]> {
  const limit = options.limit ?? getSimilarArtistsConcertLimit();
  const pastLimit = options.pastEventsPerArtist ?? getPastEventsPerArtist();
  const upcomingLimit = options.upcomingEventsPerArtist ?? getUpcomingEventsPerArtist();
  const recentPastMonths = options.recentPastMonths ?? getRecentPastMonths();
  const concurrency = options.concurrency ?? DEFAULT_ARTIST_CONCURRENCY;
  const now = options.now ?? new Date();
  const musicBrainzSearch = options.musicBrainzSearch ?? ((name: string) => searchMusicBrainzArtistByName(name));

  debugLog("concert-history", `Found ${similarArtists.length} similar artists`);

  if (providers.length === 0 || similarArtists.length === 0) {
    return [];
  }

  const selected = selectTopCompatibleSimilarArtists(similarArtists, limit);
  debugLog("concert-history", `Selecting top ${selected.length} compatible artists`);
  selected.forEach((artist, index) => {
    debugLog("concert-history", `${index + 1}. ${artist.name} — compatibility: ${artist.totalRelevance}/100`);
  });

  const dateFrom = new Date(now);
  dateFrom.setMonth(dateFrom.getMonth() - recentPastMonths);
  const dateFromIso = toDateOnlyString(dateFrom) ?? undefined;
  const dateToIso = toDateOnlyString(now) ?? undefined;

  const results = await mapWithConcurrency(selected, concurrency, async (artist) => {
    const musicBrainzId = await resolveMusicBrainzId(artist.name, musicBrainzSearch);
    const identity: ArtistIdentity = {
      name: artist.name,
      spotifyId: artist.spotifyId,
      musicBrainzId
    };

    const rawEvents: ArtistConcert[] = [];

    await Promise.all(providers.map(async (provider) => {
      const [pastOutcome, upcomingOutcome] = await Promise.allSettled([
        fetchWithLog(provider, "past", identity, { dateFrom: dateFromIso, dateTo: dateToIso, limit: pastLimit }),
        fetchWithLog(provider, "upcoming", identity, { dateFrom: dateFromIso, dateTo: dateToIso, limit: upcomingLimit })
      ]);

      if (pastOutcome.status === "fulfilled") {
        rawEvents.push(...pastOutcome.value);
      } else {
        warnLog("concert-history", `[${artist.name}][${provider.name}] past-concerts request failed: ${describeError(pastOutcome.reason)}`);
      }
      if (upcomingOutcome.status === "fulfilled") {
        rawEvents.push(...upcomingOutcome.value);
      } else {
        warnLog("concert-history", `[${artist.name}][${provider.name}] upcoming-concerts request failed: ${describeError(upcomingOutcome.reason)}`);
      }
    }));

    debugLog("concert-history", `[${artist.name}] Raw events: ${rawEvents.length}`);
    const withCompatibility = rawEvents.map((event) => ({
      ...event,
      artist: { ...event.artist, compatibilityScore: artist.totalRelevance }
    }));
    const deduped = dedupeArtistConcerts(withCompatibility).map((event) => ({
      ...event,
      status: classifyConcertStatus(event.date, event.status, now)
    }));
    debugLog("concert-history", `[${artist.name}] Events after deduplication: ${deduped.length}`);

    const pastConcerts = deduped.filter((event) => event.status === "past");
    const upcomingConcerts = deduped.filter((event) => event.status === "upcoming");
    debugLog("concert-history", `[${artist.name}] Past: ${pastConcerts.length} | Upcoming: ${upcomingConcerts.length}`);

    return { artist, pastConcerts, upcomingConcerts };
  });

  logFinalSummary(results);
  return results;
}

async function fetchWithLog(
  provider: ArtistConcertProvider,
  kind: "past" | "upcoming",
  identity: ArtistIdentity,
  options: { dateFrom?: string; dateTo?: string; limit: number }
): Promise<ArtistConcert[]> {
  debugLog("concert-history", `[${identity.name}][${provider.name}] Fetching ${kind === "past" ? "recent past" : "upcoming"} events`);
  const events = kind === "past"
    ? await provider.getPastConcerts(identity, options)
    : await provider.getUpcomingConcerts(identity, options);
  debugLog("concert-history", `[${identity.name}][${provider.name}] Found ${events.length} ${kind} events`);
  return events;
}

async function resolveMusicBrainzId(
  artistName: string,
  musicBrainzSearch: (artistName: string) => Promise<MusicBrainzArtistMetadata | null>
): Promise<string | null> {
  try {
    const metadata = await musicBrainzSearch(artistName);
    return metadata?.musicBrainzId ?? null;
  } catch {
    return null;
  }
}

export function classifyConcertStatus(
  date: string,
  providerStatus: ArtistConcert["status"],
  now: Date
): ArtistConcert["status"] {
  if (providerStatus === "cancelled") {
    return "cancelled";
  }
  const dateOnly = toDateOnlyString(date);
  const nowOnly = toDateOnlyString(now);
  if (!dateOnly || !nowOnly) {
    return "unknown";
  }
  return dateOnly >= nowOnly ? "upcoming" : "past";
}

/**
 * Deterministic cross-provider dedup: groups by (normalized artist name,
 * calendar date), then merges within a group when venue names normalize
 * equal, or one side is missing a venue name and cities match. Uncertain
 * matches (different venue, different/unknown city) are kept separate
 * rather than risking an incorrect merge.
 */
export function dedupeArtistConcerts(events: ArtistConcert[]): ArtistConcert[] {
  const merged: ArtistConcert[] = [];

  for (const event of events) {
    const dateOnly = toDateOnlyString(event.date);
    if (!dateOnly) {
      continue;
    }

    const matchIndex = merged.findIndex((existing) => isSameConcert(existing, event));
    if (matchIndex === -1) {
      merged.push({ ...event, date: dateOnly });
      continue;
    }

    merged[matchIndex] = mergeConcerts(merged[matchIndex], { ...event, date: dateOnly });
  }

  return merged;
}

function isSameConcert(left: ArtistConcert, right: ArtistConcert): boolean {
  const leftDate = toDateOnlyString(left.date);
  const rightDate = toDateOnlyString(right.date);
  if (!leftDate || !rightDate || leftDate !== rightDate) {
    return false;
  }
  if (normalizeKey(left.artist.name) !== normalizeKey(right.artist.name)) {
    return false;
  }

  const leftVenue = left.venue?.name ? normalizeVenueName(left.venue.name, left.venue.city ?? null) : null;
  const rightVenue = right.venue?.name ? normalizeVenueName(right.venue.name, right.venue.city ?? null) : null;

  if (leftVenue && rightVenue) {
    return leftVenue === rightVenue;
  }

  // One side is missing venue-name evidence: fall back to a city match
  // rather than merging blindly (an uncertain match is kept separate).
  const leftCity = left.venue?.city ? normalizeKey(left.venue.city) : null;
  const rightCity = right.venue?.city ? normalizeKey(right.venue.city) : null;
  return Boolean(leftCity && rightCity && leftCity === rightCity);
}

function mergeConcerts(existing: ArtistConcert, incoming: ArtistConcert): ArtistConcert {
  return {
    ...existing,
    externalId: existing.externalId ?? incoming.externalId,
    name: existing.name ?? incoming.name,
    venue: preferRicherVenue(existing.venue, incoming.venue),
    lineup: preferRicherLineup(existing.lineup, incoming.lineup),
    tourName: existing.tourName ?? incoming.tourName,
    festivalName: existing.festivalName ?? incoming.festivalName,
    sources: [...existing.sources, ...incoming.sources],
    // Multiple independent providers confirming the same show is itself a
    // signal, capped so it never exceeds a "fully confirmed" 1.0.
    confidence: Math.min(1, Math.max(existing.confidence ?? 0, incoming.confidence ?? 0) + 0.1)
  };
}

function preferRicherVenue(
  existing: ArtistConcert["venue"],
  incoming: ArtistConcert["venue"]
): ArtistConcert["venue"] {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return {
    name: existing.name || incoming.name,
    city: existing.city ?? incoming.city,
    region: existing.region ?? incoming.region,
    country: existing.country ?? incoming.country,
    latitude: existing.latitude ?? incoming.latitude,
    longitude: existing.longitude ?? incoming.longitude
  };
}

function preferRicherLineup(
  existing: ArtistConcert["lineup"],
  incoming: ArtistConcert["lineup"]
): ArtistConcert["lineup"] {
  if (!existing || existing.length === 0) return incoming ?? existing;
  if (!incoming || incoming.length === 0) return existing;
  return existing.length >= incoming.length ? existing : incoming;
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function logFinalSummary(results: SimilarArtistConcertsResult[]): void {
  const lines: string[] = ["Final concert summary", ""];
  for (const result of results) {
    lines.push(result.artist.name);
    for (const concert of result.pastConcerts) {
      lines.push(formatConcertLine("PAST", concert));
    }
    for (const concert of result.upcomingConcerts) {
      lines.push(formatConcertLine("UPCOMING", concert));
    }
    lines.push("");
  }
  warnLog("concert-history", lines.join("\n"));
}

function formatConcertLine(label: "PAST" | "UPCOMING", concert: ArtistConcert): string {
  const venue = concert.venue?.name ?? "Unknown venue";
  const location = [concert.venue?.city, concert.venue?.country].filter(Boolean).join(", ");
  const providers = concert.sources.map((source) => source.provider).join(" + ");
  return `  ${label.padEnd(8)} ${concert.date} — ${venue} — ${location} — ${providers}`;
}
