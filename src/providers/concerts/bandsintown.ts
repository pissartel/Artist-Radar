import { fetchWithTimeout, parseTimeoutMs } from "../../utils/fetchWithTimeout.js";
import { warnLog } from "../../utils/logger.js";
import type {
  ArtistConcert,
  ArtistConcertProvider,
  ArtistIdentity,
  ConcertQueryOptions
} from "./ArtistConcertProvider.js";

export interface BandsintownProviderEnv {
  BANDSINTOWN_APP_ID?: string;
  CONCERT_PROVIDER_TIMEOUT_MS?: string;
}

export interface BandsintownProviderOptions {
  env?: BandsintownProviderEnv;
  fetchImpl?: typeof fetch;
}

interface BandsintownVenue {
  name?: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

interface BandsintownOffer {
  type?: string;
  url?: string;
  status?: string;
}

interface BandsintownEvent {
  id?: string | number;
  url?: string;
  datetime?: string;
  title?: string;
  venue?: BandsintownVenue | null;
  lineup?: string[];
  offers?: BandsintownOffer[];
  status?: string;
}

/**
 * Bandsintown adapter (issue: concert-history enrichment for similar
 * artists). Used primarily for upcoming events — the public API has no
 * reliable historical archive, so getPastConcerts always returns [] rather
 * than assuming complete gig history exists.
 */
export function buildBandsintownConcertProvider(options: BandsintownProviderOptions = {}): ArtistConcertProvider {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = parseTimeoutMs(env.CONCERT_PROVIDER_TIMEOUT_MS);

  return {
    name: "bandsintown",
    async getPastConcerts(): Promise<ArtistConcert[]> {
      // Bandsintown's public API does not expose a complete/reliable
      // historical archive; do not assume one exists (ticket requirement).
      return [];
    },
    async getUpcomingConcerts(artist: ArtistIdentity, options: ConcertQueryOptions): Promise<ArtistConcert[]> {
      const appId = env.BANDSINTOWN_APP_ID;
      if (!appId) {
        warnLog("concert-history", `Bandsintown skipped for "${artist.name}": BANDSINTOWN_APP_ID is missing.`);
        return [];
      }

      const url = new URL(`https://rest.bandsintown.com/artists/${encodeURIComponent(artist.name)}/events`);
      url.searchParams.set("app_id", appId);
      url.searchParams.set("date", "upcoming");

      try {
        const response = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } }, timeoutMs, fetchImpl);

        if (response.status === 404) {
          // Bandsintown returns 404 for an artist it doesn't track; not an error.
          return [];
        }
        if (response.status === 401 || response.status === 403) {
          warnLog("concert-history", `Bandsintown rejected credentials for "${artist.name}" (HTTP ${response.status}).`);
          return [];
        }
        if (response.status === 429) {
          warnLog("concert-history", `Bandsintown rate-limited the request for "${artist.name}" (HTTP 429).`);
          return [];
        }
        if (!response.ok) {
          warnLog("concert-history", `Bandsintown request failed for "${artist.name}" (HTTP ${response.status}).`);
          return [];
        }

        const body = (await response.json()) as unknown;
        if (!Array.isArray(body)) {
          warnLog("concert-history", `Bandsintown returned a malformed (non-array) response for "${artist.name}".`);
          return [];
        }

        return body
          .slice(0, options.limit)
          .flatMap((event) => toArtistConcert(event as BandsintownEvent, artist));
      } catch (error) {
        warnLog("concert-history", `Bandsintown request errored for "${artist.name}": ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }
  };
}

function toArtistConcert(event: BandsintownEvent, artist: ArtistIdentity): ArtistConcert[] {
  const date = event.datetime?.trim();
  if (!date) {
    return [];
  }

  const venueName = event.venue?.name?.trim();
  const ticketUrl = event.offers?.find((offer) => offer.url)?.url ?? event.url;
  const status = normalizeStatus(event.status);

  return [{
    externalId: event.id !== undefined ? String(event.id) : undefined,
    artist: { name: artist.name, spotifyId: artist.spotifyId, musicBrainzId: artist.musicBrainzId },
    name: event.title?.trim(),
    date,
    status,
    venue: venueName
      ? {
          name: venueName,
          city: event.venue?.city ?? null,
          region: event.venue?.region ?? null,
          country: event.venue?.country ?? null,
          latitude: toFiniteNumber(event.venue?.latitude),
          longitude: toFiniteNumber(event.venue?.longitude)
        }
      : undefined,
    lineup: event.lineup?.map((name) => ({ name })),
    sources: [{
      provider: "bandsintown",
      externalId: event.id !== undefined ? String(event.id) : undefined,
      url: event.url ?? ticketUrl
    }],
    confidence: 0.75
  }];
}

function normalizeStatus(status: string | undefined): "upcoming" | "cancelled" {
  return status?.trim().toLowerCase() === "cancelled" ? "cancelled" : "upcoming";
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
