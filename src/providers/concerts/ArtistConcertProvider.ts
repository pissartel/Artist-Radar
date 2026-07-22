import { warnLog } from "../../utils/logger.js";
import { buildBandsintownConcertProvider, type BandsintownProviderEnv } from "./bandsintown.js";
import { buildSongkickConcertProvider, type SongkickProviderEnv } from "./songkick.js";
import { buildSetlistFmConcertProvider, type SetlistFmProviderEnv } from "./setlistfm.js";

export type ArtistConcertProviderName = "bandsintown" | "songkick" | "setlistfm";

/**
 * Minimal artist identity needed to query a concert-data provider. Not every
 * provider needs every field (e.g. setlist.fm prefers musicBrainzId; the others
 * only use name), so all identifiers beyond name are optional.
 */
export interface ArtistIdentity {
  name: string;
  spotifyId?: string | null;
  musicBrainzId?: string | null;
}

export interface ConcertQueryOptions {
  /** Inclusive lower bound (YYYY-MM-DD). Providers without date filtering stop pagination once this is passed. */
  dateFrom?: string;
  /** Inclusive upper bound (YYYY-MM-DD). */
  dateTo?: string;
  /** Max events to return for this call. */
  limit: number;
}

export type ArtistConcertStatus = "past" | "upcoming" | "cancelled" | "unknown";

export interface ArtistConcertSource {
  provider: ArtistConcertProviderName;
  externalId?: string;
  url?: string;
}

/**
 * Normalized concert record, adapted from the ticket's model to this repo's
 * conventions. `sources` is plural from the start (rather than a single
 * `source`) since deduplication across providers always needs to preserve
 * every contributing source, never just the first one.
 */
export interface ArtistConcert {
  externalId?: string;
  artist: {
    name: string;
    spotifyId?: string | null;
    musicBrainzId?: string | null;
    /** SimilarArtist.totalRelevance (0-100), carried through for later venue-compatibility scoring. */
    compatibilityScore?: number;
  };
  name?: string;
  date: string;
  status: ArtistConcertStatus;
  venue?: {
    name: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  lineup?: Array<{ name: string; externalId?: string }>;
  tourName?: string;
  festivalName?: string;
  sources: ArtistConcertSource[];
  confidence?: number;
}

/**
 * Provider-neutral interface for a concert-data source. A provider may
 * return an empty list for an operation it doesn't support (e.g. Bandsintown
 * has no real historical archive, setlist.fm has no upcoming calendar)
 * rather than throwing.
 */
export interface ArtistConcertProvider {
  name: ArtistConcertProviderName;
  getPastConcerts(artist: ArtistIdentity, options: ConcertQueryOptions): Promise<ArtistConcert[]>;
  getUpcomingConcerts(artist: ArtistIdentity, options: ConcertQueryOptions): Promise<ArtistConcert[]>;
}

export interface DefaultArtistConcertProviderEnv extends BandsintownProviderEnv, SongkickProviderEnv, SetlistFmProviderEnv {}

export function buildDefaultArtistConcertProviders(
  env: DefaultArtistConcertProviderEnv = process.env,
  fetchImpl: typeof fetch = fetch
): ArtistConcertProvider[] {
  const providers: ArtistConcertProvider[] = [];
  const statuses = {
    bandsintown: getBandsintownStatus(env),
    songkick: getSongkickStatus(env),
    setlistfm: getSetlistFmStatus(env)
  };

  warnLog("concert-history", [
    "Concert-history providers:",
    `- Bandsintown: ${statuses.bandsintown.enabled ? "enabled" : "disabled"} (${statuses.bandsintown.reason})`,
    `- Songkick: ${statuses.songkick.enabled ? "enabled" : "disabled"} (${statuses.songkick.reason})`,
    `- setlist.fm: ${statuses.setlistfm.enabled ? "enabled" : "disabled"} (${statuses.setlistfm.reason})`
  ].join("\n"));

  if (statuses.bandsintown.enabled) {
    providers.push(buildBandsintownConcertProvider({ env, fetchImpl }));
  }
  if (statuses.songkick.enabled) {
    providers.push(buildSongkickConcertProvider({ env, fetchImpl }));
  }
  if (statuses.setlistfm.enabled) {
    providers.push(buildSetlistFmConcertProvider({ env, fetchImpl }));
  }

  return providers;
}

function getBandsintownStatus(env: BandsintownProviderEnv): { enabled: boolean; reason: string } {
  if (!env.BANDSINTOWN_APP_ID) {
    return { enabled: false, reason: "BANDSINTOWN_APP_ID is missing" };
  }
  return { enabled: true, reason: "enabled (BANDSINTOWN_APP_ID present)" };
}

function getSongkickStatus(env: SongkickProviderEnv): { enabled: boolean; reason: string } {
  if (!env.SONGKICK_API_KEY) {
    return { enabled: false, reason: "SONGKICK_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled (SONGKICK_API_KEY present)" };
}

function getSetlistFmStatus(env: SetlistFmProviderEnv): { enabled: boolean; reason: string } {
  if (!env.SETLISTFM_API_KEY) {
    return { enabled: false, reason: "SETLISTFM_API_KEY is missing" };
  }
  return { enabled: true, reason: "enabled (SETLISTFM_API_KEY present)" };
}
