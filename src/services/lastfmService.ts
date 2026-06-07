import { debugLog, warnLog } from "../utils/logger.js";

export interface LastFmSimilarArtist {
  name: string;
  url: string | null;
  match: number | null;
}

export interface LastFmArtistInfo {
  name: string;
  url: string | null;
  tags: string[];
  listeners: number | null;
  playcount: number | null;
}

interface LastFmArtistGetSimilarResponse {
  similarartists?: {
    artist?: Array<{
      name?: string;
      url?: string;
      match?: string | number;
    }>;
  };
  error?: number;
  message?: string;
}

interface LastFmArtistGetInfoResponse {
  artist?: {
    name?: string;
    url?: string;
    stats?: {
      listeners?: string | number;
      playcount?: string | number;
    };
    tags?: {
      tag?: Array<{ name?: string } | string>;
    };
  };
  error?: number;
  message?: string;
}

interface LastFmEnv {
  LASTFM_API_KEY?: string;
}

type FetchLike = typeof fetch;

export async function getLastFmSimilarArtists(
  artistName: string,
  limit = 10,
  env: LastFmEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<LastFmSimilarArtist[]> {
  const trimmedArtistName = artistName.trim();
  debugLog("lastfm", "credentials check", {
    lastFmApiKeyPresent: Boolean(env.LASTFM_API_KEY)
  });
  if (!trimmedArtistName || !env.LASTFM_API_KEY) {
    return [];
  }

  try {
    debugLog("lastfm", "similar artists request", {
      artistName: trimmedArtistName,
      limit,
    });
    const params = new URLSearchParams({
      method: "artist.getSimilar",
      artist: trimmedArtistName,
      api_key: env.LASTFM_API_KEY,
      format: "json",
      limit: String(Math.max(1, Math.min(limit, 100)))
    });
    const response = await fetchImpl(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`);
    const data = (await response.json()) as LastFmArtistGetSimilarResponse;
    const artists = (data.similarartists?.artist ?? []).flatMap((artist) => {
      if (!artist.name) {
        return [];
      }

      return [
        {
          name: artist.name,
          url: artist.url ?? null,
          match: parseLastFmMatch(artist.match)
        }
      ];
    });

    debugLog("lastfm", "similar artists response", {
      status: response.status,
      resultCount: artists.length
    });

    if (!response.ok) {
      warnLog("lastfm", "request failed", { status: response.status, errorType: "http_error", message: "Last.fm request failed." });
      return [];
    }
    if (data.error) {
      warnLog("lastfm", "request failed", {
        status: response.status,
        errorType: "api_error",
        message: data.message ?? "Last.fm API error"
      });
      return [];
    }

    if (artists.length === 0) {
      debugLog("lastfm", "no similar artists found", { artistName: trimmedArtistName });
    }

    debugLog("lastfm", "mapped similar artists", {
      count: artists.length,
      topNames: artists.slice(0, 5).map((artist) => artist.name)
    });

    return artists;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("lastfm", "request failed", { status: null, errorType: error instanceof TypeError ? "network_error" : "unknown", message });
    return [];
  }
}

export async function getLastFmArtistInfo(
  artistName: string,
  env: LastFmEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<LastFmArtistInfo | null> {
  const trimmedArtistName = artistName.trim();
  debugLog("lastfm", "artist info credentials check", {
    lastFmApiKeyPresent: Boolean(env.LASTFM_API_KEY)
  });
  if (!trimmedArtistName || !env.LASTFM_API_KEY) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      method: "artist.getInfo",
      artist: trimmedArtistName,
      api_key: env.LASTFM_API_KEY,
      format: "json",
      autocorrect: "1"
    });
    const response = await fetchImpl(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`);
    const data = (await response.json()) as LastFmArtistGetInfoResponse;
    debugLog("lastfm", "artist info response", {
      artistName: trimmedArtistName,
      status: response.status,
      tagsCount: data.artist?.tags?.tag?.length ?? 0
    });

    if (!response.ok || data.error || !data.artist?.name) {
      return null;
    }

    return {
      name: data.artist.name,
      url: data.artist.url ?? null,
      tags: normalizeLastFmTags(data.artist.tags?.tag ?? []),
      listeners: parseNullableInt(data.artist.stats?.listeners),
      playcount: parseNullableInt(data.artist.stats?.playcount)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("lastfm", "artist info request failed", {
      status: null,
      errorType: error instanceof TypeError ? "network_error" : "unknown",
      message
    });
    return null;
  }
}

function parseLastFmMatch(match: string | number | undefined): number | null {
  if (typeof match === "number" && Number.isFinite(match)) {
    return clamp01(match);
  }

  if (typeof match === "string") {
    const parsed = Number.parseFloat(match);
    if (Number.isFinite(parsed)) {
      return clamp01(parsed);
    }
  }

  return null;
}

function normalizeLastFmTags(tags: Array<{ name?: string } | string>): string[] {
  const seen = new Set<string>();
  return tags.flatMap((tag) => {
    const name = typeof tag === "string" ? tag : tag.name;
    const normalized = name?.trim();
    if (!normalized) {
      return [];
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  });
}

function parseNullableInt(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }
  return null;
}

function clamp01(value: number): number {
  if (value > 1) {
    return Math.max(0, Math.min(1, value / 100));
  }
  return Math.max(0, Math.min(1, value));
}
