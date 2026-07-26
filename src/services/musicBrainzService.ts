import { debugLog, warnLog } from "../utils/logger.js";

export interface MusicBrainzArtistMetadata {
  musicBrainzId: string;
  name: string;
  country: string | null;
  area: string | null;
  beginArea: string | null;
  tags: string[];
  sourceUrl: string | null;
  score: number | null;
}

interface MusicBrainzSearchResponse {
  artists?: Array<{
    id?: string;
    name?: string;
    country?: string | null;
    area?: { name?: string | null } | string | null;
    "begin-area"?: { name?: string | null } | string | null;
    tags?: Array<{ name?: string } | string>;
    score?: number | string | null;
  }>;
}

interface MusicBrainzLookupResponse {
  id?: string;
  name?: string;
  country?: string | null;
  area?: { name?: string | null } | string | null;
  "begin-area"?: { name?: string | null } | string | null;
  tags?: Array<{ name?: string } | string>;
}

export interface MusicBrainzEnv {
  APP_USER_AGENT?: string;
  // Dedicated, MusicBrainz-specific override (issue #195): takes priority
  // over the generic APP_USER_AGENT so label discovery can identify itself
  // distinctly from other MusicBrainz callers if desired, without requiring
  // it.
  MUSICBRAINZ_USER_AGENT?: string;
}

type FetchLike = typeof fetch;
type MusicBrainzArtistApi = NonNullable<MusicBrainzSearchResponse["artists"]>[number];

let musicBrainzQueue: Promise<void> = Promise.resolve();

export function getMusicBrainzUserAgent(env: MusicBrainzEnv = process.env): string {
  return (
    env.MUSICBRAINZ_USER_AGENT?.trim() ||
    env.APP_USER_AGENT?.trim() ||
    "ArtistRadar/0.1.0 ( https://github.com/pissartel/Artist-Radar )"
  );
}

const DEFAULT_MUSICBRAINZ_TIMEOUT_MS = 15_000;
const DEFAULT_MUSICBRAINZ_MAX_RETRIES = 2;
const DEFAULT_MUSICBRAINZ_RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface MusicBrainzRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

/**
 * Fetches and parses a MusicBrainz JSON endpoint with a request timeout and
 * bounded exponential backoff retry on network errors, 429 and 5xx
 * responses, on top of the existing 1-request/second scheduling queue
 * (issue #195: "request throttling; retry with bounded exponential backoff;
 * timeout handling"). Throws on final failure so callers can apply their own
 * fault isolation (skip this artist/label/release, keep going).
 */
export async function fetchMusicBrainzJson<T>(
  url: string,
  env: MusicBrainzEnv = process.env,
  fetchImpl: FetchLike = fetch,
  options: MusicBrainzRequestOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MUSICBRAINZ_MAX_RETRIES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_MUSICBRAINZ_TIMEOUT_MS;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_MUSICBRAINZ_RETRY_BASE_DELAY_MS;
  const userAgent = getMusicBrainzUserAgent(env);

  return scheduleMusicBrainzRequest(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error(`MusicBrainz request timed out after ${timeoutMs}ms`)), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          headers: { Accept: "application/json", "User-Agent": userAgent },
          signal: controller.signal
        });

        if (!response.ok) {
          if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
            debugLog("musicbrainz", "retrying request after non-ok status", { url, status: response.status, attempt });
            await delay(retryBaseDelayMs * 2 ** attempt);
            continue;
          }
          throw new MusicBrainzHttpError(response.status, url);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        const isAbort = error instanceof Error && error.name === "AbortError";
        const isHttpError = error instanceof MusicBrainzHttpError;
        if (!isHttpError && attempt < maxRetries) {
          debugLog("musicbrainz", "retrying request after error", {
            url,
            attempt,
            errorType: isAbort ? "timeout" : "network_error"
          });
          await delay(retryBaseDelayMs * 2 ** attempt);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`MusicBrainz request failed for ${url}`);
  });
}

export class MusicBrainzHttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`MusicBrainz request failed with HTTP ${status} for ${url}`);
    this.name = "MusicBrainzHttpError";
  }
}

export async function searchMusicBrainzArtistByName(
  artistName: string,
  env: MusicBrainzEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<MusicBrainzArtistMetadata | null> {
  const trimmedArtistName = artistName.trim();
  if (!trimmedArtistName) {
    return null;
  }

  try {
    return await scheduleMusicBrainzRequest(async () => {
      const searchUrl = new URL("https://musicbrainz.org/ws/2/artist");
      searchUrl.searchParams.set("query", `artist:${trimmedArtistName}`);
      searchUrl.searchParams.set("fmt", "json");
      searchUrl.searchParams.set("limit", "5");

      debugLog("musicbrainz", "artist search request", {
        artistName: trimmedArtistName
      });

      const userAgent = getMusicBrainzUserAgent(env);
      debugLog("musicbrainz", "user agent configured", { userAgentPresent: Boolean(userAgent) });
      const searchResponse = await fetchImpl(searchUrl.toString(), {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent
        }
      });
      const searchData = (await searchResponse.json()) as MusicBrainzSearchResponse;
      const bestMatch = pickBestMusicBrainzArtist(searchData.artists ?? [], trimmedArtistName);
      debugLog("musicbrainz", "artist search response", {
        artistName: trimmedArtistName,
        status: searchResponse.status,
        resultCount: searchData.artists?.length ?? 0
      });

      if (!searchResponse.ok) {
        warnLog("musicbrainz", "request failed", { status: searchResponse.status, errorType: "http_error", message: "MusicBrainz search failed." });
        return null;
      }
      if (!bestMatch?.id) {
        debugLog("musicbrainz", "no artist match", {
          artistName: trimmedArtistName
        });
        return null;
      }

      const lookup = await lookupMusicBrainzArtist(
        bestMatch.id,
        fetchImpl,
        trimmedArtistName,
        toScore(bestMatch.score),
        env
      );
      if (lookup) {
        debugLog("musicbrainz", "selected artist match", {
          artistName: trimmedArtistName,
          musicBrainzId: lookup.musicBrainzId,
          country: lookup.country,
          area: lookup.area,
          beginArea: lookup.beginArea,
          tagsCount: lookup.tags.length,
          score: lookup.score
        });
        return lookup;
      }

      const normalized = normalizeMusicBrainzArtist(bestMatch, toScore(bestMatch.score));
      if (normalized) {
        debugLog("musicbrainz", "selected artist match", {
          artistName: trimmedArtistName,
          musicBrainzId: normalized.musicBrainzId,
          country: normalized.country,
          area: normalized.area,
          beginArea: normalized.beginArea,
          tagsCount: normalized.tags.length,
          score: normalized.score
        });
      }
      return normalized;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnLog("musicbrainz", "request failed", { status: null, errorType: error instanceof TypeError ? "network_error" : "unknown", message });
    return null;
  }
}

export async function enrichArtistWithMusicBrainz(
  artistName: string,
  env: MusicBrainzEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<MusicBrainzArtistMetadata | null> {
  return searchMusicBrainzArtistByName(artistName, env, fetchImpl);
}

export const searchMusicBrainzArtistMetadata = searchMusicBrainzArtistByName;

async function lookupMusicBrainzArtist(
  musicBrainzId: string,
  fetchImpl: FetchLike,
  artistName: string,
  fallbackScore: number | null,
  env: MusicBrainzEnv
): Promise<MusicBrainzArtistMetadata | null> {
  const lookupUrl = new URL(`https://musicbrainz.org/ws/2/artist/${encodeURIComponent(musicBrainzId)}`);
  lookupUrl.searchParams.set("fmt", "json");
  lookupUrl.searchParams.set("inc", "tags");

  debugLog("musicbrainz", "MusicBrainz artist lookup", {
    artistName,
    musicBrainzId
  });

  const userAgent = getMusicBrainzUserAgent(env);
  debugLog("musicbrainz", "user agent configured", { userAgentPresent: Boolean(userAgent) });
  const lookupResponse = await fetchImpl(lookupUrl.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent
    }
  });
  debugLog("musicbrainz", "artist search response", {
    artistName,
    musicBrainzId,
    status: lookupResponse.status,
    resultCount: 1
  });

  if (!lookupResponse.ok) {
    warnLog("musicbrainz", "request failed", { status: lookupResponse.status, errorType: "http_error", message: "MusicBrainz lookup failed." });
    return null;
  }

  const lookupData = (await lookupResponse.json()) as MusicBrainzLookupResponse;
  const normalized = normalizeMusicBrainzArtist(lookupData, fallbackScore);
  if (normalized) {
    debugLog("musicbrainz", "selected artist match", {
      artistName,
      musicBrainzId,
      country: normalized.country,
      area: normalized.area,
      beginArea: normalized.beginArea,
      tagsCount: normalized.tags.length,
      score: normalized.score
    });
  }
  return normalized;
}

function pickBestMusicBrainzArtist(
  artists: MusicBrainzArtistApi[],
  artistName: string
): MusicBrainzArtistApi | null {
  if (artists.length === 0) {
    return null;
  }

  const normalizedTarget = normalizeText(artistName);
  const exact = artists.find((artist) => normalizeText(artist.name ?? "") === normalizedTarget);
  if (exact) {
    return exact;
  }

  return [...artists].sort((left, right) => scoreMusicBrainzArtist(right, normalizedTarget) - scoreMusicBrainzArtist(left, normalizedTarget))[0] ?? null;
}

function scoreMusicBrainzArtist(
  artist: MusicBrainzArtistApi,
  normalizedTarget: string
): number {
  const name = normalizeText(artist.name ?? "");
  const score = typeof artist.score === "number" ? artist.score : Number.parseFloat(String(artist.score ?? 0)) || 0;
  if (name === normalizedTarget) {
    return score + 100;
  }

  if (name.includes(normalizedTarget) || normalizedTarget.includes(name)) {
    return score + 50;
  }

  return score;
}

function normalizeMusicBrainzArtist(
  artist: MusicBrainzArtistApi | MusicBrainzLookupResponse,
  fallbackScore: number | null
): MusicBrainzArtistMetadata | null {
  if (!artist.id || !artist.name) {
    return null;
  }

  const tags = extractTags(artist.tags);
  const area = extractName(artist.area);
  const beginArea = extractName(artist["begin-area"]);

  return {
    musicBrainzId: artist.id,
    name: artist.name,
    country: normalizeCountry(artist.country) ?? null,
    area,
    beginArea,
    tags,
    sourceUrl: `https://musicbrainz.org/artist/${encodeURIComponent(artist.id)}`,
    score: normalizeScore((artist as { score?: number | string | null }).score, fallbackScore)
  };
}

function normalizeScore(score: unknown, fallbackScore: number | null): number | null {
  if (typeof score === "number" && Number.isFinite(score)) {
    return score;
  }

  const parsed = Number.parseFloat(String(score ?? fallbackScore ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractName(value: { name?: string | null } | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  return value.name?.trim() || null;
}

function extractTags(tags: Array<{ name?: string } | string> | undefined): string[] {
  return (tags ?? [])
    .map((tag) => (typeof tag === "string" ? tag : tag.name ?? ""))
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeCountry(country: string | null | undefined): string | null {
  const trimmed = country?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.toUpperCase() === "FR") {
    return "France";
  }

  return trimmed;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function scheduleMusicBrainzRequest<T>(task: () => Promise<T>): Promise<T> {
  const next = musicBrainzQueue.then(async () => {
    if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
      debugLog("musicbrainz", "throttling request", { delayMs: 1000 });
    }
    const result = await task();
    if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
      await delay(1000);
    }
    return result;
  });

  musicBrainzQueue = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
