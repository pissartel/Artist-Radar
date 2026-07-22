import { fetchWithTimeout, parseTimeoutMs } from "../../utils/fetchWithTimeout.js";
import { warnLog } from "../../utils/logger.js";
import { toDateOnlyString } from "../../utils/dateOnly.js";
import { normalizeKey } from "../../utils/venueNameNormalization.js";
import type {
  ArtistConcert,
  ArtistConcertProvider,
  ArtistIdentity,
  ConcertQueryOptions
} from "./ArtistConcertProvider.js";

export interface SetlistFmProviderEnv {
  SETLISTFM_API_KEY?: string;
  CONCERT_PROVIDER_TIMEOUT_MS?: string;
}

export interface SetlistFmProviderOptions {
  env?: SetlistFmProviderEnv;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const MAX_SETLIST_PAGES = 3;

interface SetlistFmVenue {
  name?: string;
  city?: {
    name?: string;
    state?: string;
    country?: { name?: string; code?: string };
  };
}

interface SetlistFmSetlist {
  id?: string;
  eventDate?: string;
  artist?: { mbid?: string; name?: string };
  venue?: SetlistFmVenue;
  tour?: { name?: string };
  url?: string;
}

interface SetlistFmSetlistsResponse {
  setlist?: SetlistFmSetlist[];
  total?: number;
  page?: number;
  itemsPerPage?: number;
}

/**
 * setlist.fm adapter (issue: concert-history enrichment for similar
 * artists). Past concerts only — a setlist.fm result must never be
 * interpreted as an upcoming booking opportunity, so getUpcomingConcerts
 * always returns [].
 */
export function buildSetlistFmConcertProvider(options: SetlistFmProviderOptions = {}): ArtistConcertProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.setlist.fm/rest/1.0";
  const timeoutMs = parseTimeoutMs(env.CONCERT_PROVIDER_TIMEOUT_MS);

  return {
    name: "setlistfm",
    async getUpcomingConcerts(): Promise<ArtistConcert[]> {
      return [];
    },
    async getPastConcerts(artist: ArtistIdentity, queryOptions: ConcertQueryOptions): Promise<ArtistConcert[]> {
      const apiKey = env.SETLISTFM_API_KEY;
      if (!apiKey) {
        warnLog("concert-history", `setlist.fm skipped for "${artist.name}": SETLISTFM_API_KEY is missing.`);
        return [];
      }

      const dateFromIso = queryOptions.dateFrom ? toDateOnlyString(queryOptions.dateFrom) : null;
      const collected: SetlistFmSetlist[] = [];

      for (let page = 1; page <= MAX_SETLIST_PAGES && collected.length < queryOptions.limit; page += 1) {
        const endpoint = artist.musicBrainzId
          ? `${baseUrl}/artist/${encodeURIComponent(artist.musicBrainzId)}/setlists`
          : `${baseUrl}/search/setlists`;
        const url = new URL(endpoint);
        url.searchParams.set("p", String(page));
        if (!artist.musicBrainzId) {
          url.searchParams.set("artistName", artist.name);
        }

        const setlists = await fetchSetlistFmPage(url, apiKey, timeoutMs, fetchImpl, artist.name);
        if (setlists.length === 0) {
          break;
        }

        let sawOldEvent = false;
        for (const setlist of setlists) {
          // setlist.fm's search matches loosely; without an exact MBID lookup,
          // never trust the search match blindly — require the returned
          // artist name to actually match (normalized), same lesson learned
          // from another provider's loose full-text search matching words
          // instead of the full name.
          if (!artist.musicBrainzId && !isSameArtistName(setlist.artist?.name, artist.name)) {
            continue;
          }

          const eventDate = setlist.eventDate ? setlistFmDateToIso(setlist.eventDate) : null;
          if (dateFromIso && eventDate && eventDate < dateFromIso) {
            // setlist.fm returns most recent setlists first: once we see an
            // event older than the cutoff, no later page can help.
            sawOldEvent = true;
            break;
          }
          collected.push(setlist);
          if (collected.length >= queryOptions.limit) {
            break;
          }
        }

        if (sawOldEvent) {
          break;
        }
      }

      return collected.slice(0, queryOptions.limit).flatMap((setlist) => toArtistConcert(setlist, artist));
    }
  };
}

async function fetchSetlistFmPage(
  url: URL,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  artistName: string
): Promise<SetlistFmSetlist[]> {
  try {
    const response = await fetchWithTimeout(
      url.toString(),
      { headers: { Accept: "application/json", "x-api-key": apiKey } },
      timeoutMs,
      fetchImpl
    );

    if (response.status === 401 || response.status === 403) {
      warnLog("concert-history", `setlist.fm rejected credentials for "${artistName}" (HTTP ${response.status}).`);
      return [];
    }
    if (response.status === 404) {
      // No setlists found for this artist/page — not an error.
      return [];
    }
    if (response.status === 429) {
      warnLog("concert-history", `setlist.fm rate-limited the request for "${artistName}" (HTTP 429).`);
      return [];
    }
    if (!response.ok) {
      warnLog("concert-history", `setlist.fm request failed for "${artistName}" (HTTP ${response.status}).`);
      return [];
    }

    const body = (await response.json()) as SetlistFmSetlistsResponse;
    if (!Array.isArray(body.setlist)) {
      return [];
    }
    return body.setlist;
  } catch (error) {
    warnLog("concert-history", `setlist.fm request errored for "${artistName}": ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function toArtistConcert(setlist: SetlistFmSetlist, artist: ArtistIdentity): ArtistConcert[] {
  const date = setlist.eventDate ? setlistFmDateToIso(setlist.eventDate) : null;
  const venueName = setlist.venue?.name?.trim();
  if (!date || !venueName) {
    return [];
  }

  return [{
    externalId: setlist.id,
    artist: { name: artist.name, spotifyId: artist.spotifyId, musicBrainzId: artist.musicBrainzId ?? setlist.artist?.mbid ?? null },
    date,
    status: "past",
    venue: {
      name: venueName,
      city: setlist.venue?.city?.name ?? null,
      region: setlist.venue?.city?.state ?? null,
      country: setlist.venue?.city?.country?.name ?? null
    },
    tourName: setlist.tour?.name?.trim() || undefined,
    sources: [{
      provider: "setlistfm",
      externalId: setlist.id,
      url: setlist.url
    }],
    confidence: 0.8
  }];
}

// setlist.fm dates are dd-MM-yyyy; the rest of the pipeline uses ISO
// yyyy-MM-dd (see src/utils/dateOnly.ts).
function setlistFmDateToIso(eventDate: string): string | null {
  const match = eventDate.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function isSameArtistName(candidate: string | undefined, artistName: string): boolean {
  if (!candidate) {
    return false;
  }
  return normalizeArtistName(candidate) === normalizeArtistName(artistName);
}

function normalizeArtistName(value: string): string {
  return normalizeKey(value).replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
