import { fetchWithTimeout, parseTimeoutMs } from "../../utils/fetchWithTimeout.js";
import { warnLog } from "../../utils/logger.js";
import { toDateOnlyString } from "../../utils/dateOnly.js";
import type {
  ArtistConcert,
  ArtistConcertProvider,
  ArtistIdentity,
  ConcertQueryOptions
} from "./ArtistConcertProvider.js";

export interface SongkickProviderEnv {
  SONGKICK_API_KEY?: string;
  CONCERT_PROVIDER_TIMEOUT_MS?: string;
}

export interface SongkickProviderOptions {
  env?: SongkickProviderEnv;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const MAX_GIGOGRAPHY_PAGES = 3;

interface SongkickArtistSearchResponse {
  resultsPage?: {
    status?: string;
    results?: { artist?: Array<{ id?: number; displayName?: string }> };
  };
}

interface SongkickVenue {
  displayName?: string;
  lat?: number | null;
  lng?: number | null;
  metroArea?: {
    displayName?: string;
    country?: { displayName?: string };
    state?: { displayName?: string };
  } | null;
}

interface SongkickEvent {
  id?: number;
  displayName?: string;
  type?: string;
  status?: string;
  start?: { date?: string; datetime?: string };
  venue?: SongkickVenue | null;
  performance?: Array<{ artist?: { id?: number; displayName?: string } }>;
  uri?: string;
}

interface SongkickEventsResponse {
  resultsPage?: {
    status?: string;
    results?: { event?: SongkickEvent[] };
  };
}

/**
 * Songkick adapter (issue: concert-history enrichment for similar artists).
 * Resolves the Songkick artist ID once per artist name (memoized for this
 * provider instance's lifetime) before requesting either endpoint.
 */
export function buildSongkickConcertProvider(options: SongkickProviderOptions = {}): ArtistConcertProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.songkick.com/api/3.0";
  const timeoutMs = parseTimeoutMs(env.CONCERT_PROVIDER_TIMEOUT_MS);
  const artistIdCache = new Map<string, Promise<number | null>>();

  function resolveArtistId(artistName: string, apiKey: string): Promise<number | null> {
    const cacheKey = artistName.trim().toLowerCase();
    if (!artistIdCache.has(cacheKey)) {
      artistIdCache.set(cacheKey, fetchSongkickArtistId(baseUrl, artistName, apiKey, timeoutMs, fetchImpl));
    }
    return artistIdCache.get(cacheKey)!;
  }

  return {
    name: "songkick",
    async getUpcomingConcerts(artist: ArtistIdentity, queryOptions: ConcertQueryOptions): Promise<ArtistConcert[]> {
      const apiKey = env.SONGKICK_API_KEY;
      if (!apiKey) {
        warnLog("concert-history", `Songkick skipped for "${artist.name}": SONGKICK_API_KEY is missing.`);
        return [];
      }

      const artistId = await resolveArtistId(artist.name, apiKey);
      if (artistId === null) {
        return [];
      }

      const events = await fetchSongkickEvents(
        `${baseUrl}/artists/${artistId}/calendar.json`,
        apiKey,
        timeoutMs,
        fetchImpl,
        artist.name,
        1
      );
      return events.slice(0, queryOptions.limit).flatMap((event) => toArtistConcert(event, artist));
    },
    async getPastConcerts(artist: ArtistIdentity, queryOptions: ConcertQueryOptions): Promise<ArtistConcert[]> {
      const apiKey = env.SONGKICK_API_KEY;
      if (!apiKey) {
        warnLog("concert-history", `Songkick skipped for "${artist.name}": SONGKICK_API_KEY is missing.`);
        return [];
      }

      const artistId = await resolveArtistId(artist.name, apiKey);
      if (artistId === null) {
        return [];
      }

      const dateFromIso = queryOptions.dateFrom ? toDateOnlyString(queryOptions.dateFrom) : null;
      const collected: SongkickEvent[] = [];

      for (let page = 1; page <= MAX_GIGOGRAPHY_PAGES && collected.length < queryOptions.limit; page += 1) {
        const events = await fetchSongkickEvents(
          `${baseUrl}/artists/${artistId}/gigography.json`,
          apiKey,
          timeoutMs,
          fetchImpl,
          artist.name,
          page,
          "desc"
        );
        if (events.length === 0) {
          break;
        }

        let sawOldEvent = false;
        for (const event of events) {
          const eventDate = event.start?.date ? toDateOnlyString(event.start.date) : null;
          if (dateFromIso && eventDate && eventDate < dateFromIso) {
            // gigography is requested order=desc (most recent first): once we
            // see an event older than the cutoff, no later page can help.
            sawOldEvent = true;
            break;
          }
          collected.push(event);
          if (collected.length >= queryOptions.limit) {
            break;
          }
        }

        if (sawOldEvent) {
          break;
        }
      }

      return collected.slice(0, queryOptions.limit).flatMap((event) => toArtistConcert(event, artist));
    }
  };
}

async function fetchSongkickArtistId(
  baseUrl: string,
  artistName: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<number | null> {
  const url = new URL(`${baseUrl}/search/artists.json`);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("query", artistName);

  try {
    const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } }, timeoutMs, fetchImpl, "concert-history");

    if (response.status === 401 || response.status === 403) {
      warnLog("concert-history", `Songkick rejected credentials while resolving "${artistName}" (HTTP ${response.status}).`);
      return null;
    }
    if (response.status === 404) {
      return null;
    }
    if (response.status === 429) {
      warnLog("concert-history", `Songkick rate-limited artist resolution for "${artistName}" (HTTP 429).`);
      return null;
    }
    if (!response.ok) {
      warnLog("concert-history", `Songkick artist search failed for "${artistName}" (HTTP ${response.status}).`);
      return null;
    }

    const body = (await response.json()) as SongkickArtistSearchResponse;
    if (body.resultsPage?.status !== "ok") {
      warnLog("concert-history", `Songkick artist search returned a non-ok status for "${artistName}".`);
      return null;
    }

    const bestMatch = pickBestSongkickArtist(body.resultsPage.results?.artist ?? [], artistName);
    return bestMatch?.id ?? null;
  } catch (error) {
    warnLog("concert-history", `Songkick artist search errored for "${artistName}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function pickBestSongkickArtist(
  candidates: Array<{ id?: number; displayName?: string }>,
  artistName: string
): { id?: number; displayName?: string } | null {
  const normalizedTarget = artistName.trim().toLowerCase();
  const exact = candidates.find((candidate) => candidate.displayName?.trim().toLowerCase() === normalizedTarget);
  return exact ?? candidates[0] ?? null;
}

async function fetchSongkickEvents(
  endpoint: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  artistName: string,
  page: number,
  order?: "asc" | "desc"
): Promise<SongkickEvent[]> {
  const url = new URL(endpoint);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("page", String(page));
  if (order) {
    url.searchParams.set("order", order);
  }

  try {
    const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } }, timeoutMs, fetchImpl, "concert-history");

    if (response.status === 401 || response.status === 403) {
      warnLog("concert-history", `Songkick rejected credentials for "${artistName}" (HTTP ${response.status}).`);
      return [];
    }
    if (response.status === 404) {
      return [];
    }
    if (response.status === 429) {
      warnLog("concert-history", `Songkick rate-limited the request for "${artistName}" (HTTP 429).`);
      return [];
    }
    if (!response.ok) {
      warnLog("concert-history", `Songkick events request failed for "${artistName}" (HTTP ${response.status}).`);
      return [];
    }

    const body = (await response.json()) as SongkickEventsResponse;
    if (body.resultsPage?.status !== "ok") {
      warnLog("concert-history", `Songkick events request returned a non-ok status for "${artistName}".`);
      return [];
    }

    return body.resultsPage.results?.event ?? [];
  } catch (error) {
    warnLog("concert-history", `Songkick events request errored for "${artistName}": ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function toArtistConcert(event: SongkickEvent, artist: ArtistIdentity): ArtistConcert[] {
  const date = event.start?.date ?? event.start?.datetime;
  const venueName = event.venue?.displayName?.trim();
  if (!date || !venueName) {
    return [];
  }

  return [{
    externalId: event.id !== undefined ? String(event.id) : undefined,
    artist: { name: artist.name, spotifyId: artist.spotifyId, musicBrainzId: artist.musicBrainzId },
    name: event.displayName?.trim(),
    date,
    status: normalizeStatus(event.status),
    venue: {
      name: venueName,
      city: event.venue?.metroArea?.displayName ?? null,
      region: event.venue?.metroArea?.state?.displayName || null,
      country: event.venue?.metroArea?.country?.displayName ?? null,
      latitude: typeof event.venue?.lat === "number" ? event.venue.lat : null,
      longitude: typeof event.venue?.lng === "number" ? event.venue.lng : null
    },
    lineup: event.performance
      ?.filter((performance) => performance.artist?.displayName)
      .map((performance) => ({
        name: performance.artist!.displayName!.trim(),
        externalId: performance.artist?.id !== undefined ? String(performance.artist.id) : undefined
      })),
    festivalName: event.type === "Festival" ? event.displayName?.trim() : undefined,
    sources: [{
      provider: "songkick",
      externalId: event.id !== undefined ? String(event.id) : undefined,
      url: event.uri
    }],
    confidence: 0.75
  }];
}

function normalizeStatus(status: string | undefined): "past" | "upcoming" | "cancelled" | "unknown" {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "cancelled") return "cancelled";
  if (normalized === "ok") return "unknown"; // caller classifies past/upcoming from the date itself
  return "unknown";
}
