// Issue #142 section 7 (timeout/retry isolation): thin HTTP client for the
// handful of Chartmetric v2 endpoints this phase-1 integration needs. Every
// request goes through `request()`, which enforces a strict timeout,
// classifies the failure, and retries at most once — only for a transient
// network error or a 5xx server response. Authentication errors, invalid
// requests, not-found results and rate limits are never retried, since
// retrying those either can't succeed or would multiply API cost for no
// benefit.
import { fetchWithTimeout, redactUrlForLogging } from "../../../utils/fetchWithTimeout.js";
import { debugLog } from "../../../utils/logger.js";

type FetchLike = typeof fetch;

export type ChartmetricErrorKind = "auth" | "invalid_request" | "not_found" | "rate_limited" | "timeout" | "server" | "network" | "malformed";

export class ChartmetricApiError extends Error {
  constructor(message: string, readonly kind: ChartmetricErrorKind) {
    super(message);
    this.name = "ChartmetricApiError";
  }
}

export interface ChartmetricClientEnv {
  CHARTMETRIC_REFRESH_TOKEN?: string;
  CHARTMETRIC_BASE_URL?: string;
  CHARTMETRIC_REQUEST_TIMEOUT_MS?: string;
}

export interface ChartmetricClientOptions {
  env?: ChartmetricClientEnv;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.chartmetric.com";
const DEFAULT_TIMEOUT_MS = 8_000;

export interface ChartmetricArtistIdentityRaw {
  id: number;
  name: string;
  spotifyId?: string;
}

export interface ChartmetricArtistStatPoint {
  date: string;
  spotifyMonthlyListeners?: number;
  spotifyFollowers?: number;
}

export interface ChartmetricArtistStatsRaw {
  latest: ChartmetricArtistStatPoint | null;
  history: ChartmetricArtistStatPoint[];
}

// Issue #201: best-effort fields beyond phase-1's Spotify-only scope.
// Chartmetric's artist-metadata response shape for score/social follower
// counts isn't exercised against a live account in this codebase, so
// parsing below is deliberately defensive — any field it can't confidently
// read is left undefined (never guessed at) rather than risk attaching the
// wrong number to an artist.
export interface ChartmetricArtistScoreAndSocialRaw {
  chartmetricArtistScore?: number;
  instagramFollowers?: number;
  tiktokFollowers?: number;
  youtubeSubscribers?: number;
  facebookFollowers?: number;
  twitterFollowers?: number;
}

export interface ChartmetricPlaylistReachRaw {
  playlistReachScore?: number;
  totalCurrentPlaylists?: number;
}

export interface ChartmetricSimilarArtistRaw {
  id: number;
  name: string;
  score?: number;
}

export interface ChartmetricRequestOutcome<T> {
  data: T;
  // Credits Chartmetric reported spending on this call, when the API
  // reports usage via a response header. Undefined when unreported (the
  // service layer then falls back to a fixed per-endpoint estimate).
  reportedCredits?: number;
  retryCount: number;
  durationMs: number;
}

export class ChartmetricClient {
  private readonly env: ChartmetricClientEnv;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private tokenPromise: Promise<string> | null = null;
  private tokenExpiresAt = 0;

  constructor(options: ChartmetricClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? (Number.parseInt(this.env.CHARTMETRIC_REQUEST_TIMEOUT_MS ?? "", 10) || DEFAULT_TIMEOUT_MS);
    this.baseUrl = (this.env.CHARTMETRIC_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async getArtistBySpotifyId(spotifyArtistId: string): Promise<ChartmetricRequestOutcome<ChartmetricArtistIdentityRaw | null>> {
    return this.request(`/api/artist/spotify/${encodeURIComponent(spotifyArtistId)}`, (payload) =>
      parseArtistIdentity(payload)
    );
  }

  async searchArtistsByName(name: string): Promise<ChartmetricRequestOutcome<ChartmetricArtistIdentityRaw[]>> {
    const outcome = await this.request<ChartmetricArtistIdentityRaw[]>(
      `/api/search?q=${encodeURIComponent(name)}&type=artists&limit=10`,
      (payload) => parseArtistSearchResults(payload)
    );
    return outcome;
  }

  async getArtistStats(chartmetricArtistId: string, options: { sinceDays?: number } = {}): Promise<ChartmetricRequestOutcome<ChartmetricArtistStatsRaw>> {
    const sinceDays = options.sinceDays ?? 0;
    const query = sinceDays > 0 ? `?since=${sinceDays}d` : "";
    return this.request(`/api/artist/${encodeURIComponent(chartmetricArtistId)}/stat/spotify${query}`, (payload) =>
      parseArtistStats(payload)
    );
  }

  // Issue #201 scope item: Chartmetric artist score + available social
  // audience metrics. Best-effort — a missing/unparseable field here should
  // never fail the caller, so every field of the parsed result is optional.
  async getArtistScoreAndSocial(chartmetricArtistId: string): Promise<ChartmetricRequestOutcome<ChartmetricArtistScoreAndSocialRaw>> {
    return this.request(`/api/artist/${encodeURIComponent(chartmetricArtistId)}`, (payload) =>
      parseArtistScoreAndSocial(payload)
    );
  }

  // Issue #201 scope item: playlist reach / discovery-surface signal.
  async getArtistPlaylistReach(chartmetricArtistId: string): Promise<ChartmetricRequestOutcome<ChartmetricPlaylistReachRaw>> {
    return this.request(`/api/artist/${encodeURIComponent(chartmetricArtistId)}/playlists/current/stats`, (payload) =>
      parsePlaylistReach(payload)
    );
  }

  // Issue #201 scope item: "neighbouring-artist relationship or score, if
  // available through the API." Not guaranteed to exist for every artist;
  // callers must treat an empty/missing result as unavailable, not as "no
  // relationship."
  async getSimilarArtists(chartmetricArtistId: string): Promise<ChartmetricRequestOutcome<ChartmetricSimilarArtistRaw[]>> {
    return this.request(`/api/artist/${encodeURIComponent(chartmetricArtistId)}/similar-artists`, (payload) =>
      parseSimilarArtists(payload)
    );
  }

  private async getAccessToken(): Promise<string> {
    const refreshToken = this.env.CHARTMETRIC_REFRESH_TOKEN?.trim();
    if (!refreshToken) {
      throw new ChartmetricApiError("Missing CHARTMETRIC_REFRESH_TOKEN", "auth");
    }

    if (this.tokenPromise && Date.now() < this.tokenExpiresAt) {
      return this.tokenPromise;
    }

    this.tokenPromise = (async () => {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/api/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshtoken: refreshToken })
        },
        this.timeoutMs,
        this.fetchImpl,
        "chartmetric"
      );
      if (!response.ok) {
        throw new ChartmetricApiError(`Token request failed with status ${response.status}`, classifyHttpStatus(response.status));
      }
      const payload = (await response.json().catch(() => null)) as { token?: string; expires_in?: number } | null;
      if (!payload?.token) {
        throw new ChartmetricApiError("Malformed token response", "malformed");
      }
      this.tokenExpiresAt = Date.now() + Math.max(1, (payload.expires_in ?? 3_600) - 60) * 1000;
      return payload.token;
    })();

    try {
      return await this.tokenPromise;
    } catch (error) {
      this.tokenPromise = null;
      this.tokenExpiresAt = 0;
      throw error;
    }
  }

  private async request<T>(path: string, parse: (payload: unknown) => T): Promise<ChartmetricRequestOutcome<T>> {
    const start = Date.now();
    let retryCount = 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      try {
        const token = await this.getAccessToken();
        const url = `${this.baseUrl}${path}`;
        const response = await fetchWithTimeout(
          url,
          { headers: { Authorization: `Bearer ${token}` } },
          this.timeoutMs,
          this.fetchImpl,
          "chartmetric"
        );

        if (!response.ok) {
          const kind = classifyHttpStatus(response.status);
          const error = new ChartmetricApiError(`Chartmetric request failed with status ${response.status}`, kind);
          if (kind === "server" && attempt === 0) {
            lastError = error;
            retryCount += 1;
            continue;
          }
          throw error;
        }

        const payload = await response.json().catch(() => {
          throw new ChartmetricApiError("Malformed Chartmetric response body", "malformed");
        });

        const data = parse(payload);
        return { data, reportedCredits: extractReportedCredits(response), retryCount, durationMs: Date.now() - start };
      } catch (error) {
        if (isAbortError(error)) {
          throw new ChartmetricApiError("Chartmetric request timed out", "timeout");
        }
        if (error instanceof ChartmetricApiError) {
          throw error;
        }
        // Unclassified network-level failure (DNS, connection reset, ...):
        // retry once, then surface as a network error.
        if (attempt === 0) {
          lastError = error;
          retryCount += 1;
          debugLog("chartmetric", "network error, retrying once", {
            endpoint: redactUrlForLogging(path),
            message: error instanceof Error ? error.message : String(error)
          });
          continue;
        }
        throw new ChartmetricApiError(
          error instanceof Error ? error.message : "Unknown network error",
          "network"
        );
      }
    }

    // Unreachable in practice (the loop always returns or throws), but keeps
    // the compiler satisfied and fails safe if it ever were reached.
    throw lastError instanceof Error ? lastError : new ChartmetricApiError("Chartmetric request failed", "network");
  }
}

function classifyHttpStatus(status: number): ChartmetricErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status === 400 || status === 422) {
    return "invalid_request";
  }
  if (status >= 500) {
    return "server";
  }
  return "server";
}

// fetchWithTimeout aborts with a custom Error reason (`Request timed out
// after Xms`) rather than a DOMException, and Node's fetch rejects with
// that exact reason (verified against the runtime's actual behavior, not
// assumed) — so a timeout is identified by message, not by `error.name`.
function isAbortError(error: unknown): boolean {
  return error instanceof Error && /timed out after \d+ms/.test(error.message);
}

function extractReportedCredits(response: Response): number | undefined {
  const header = response.headers.get("x-cm-credits-used") ?? response.headers.get("x-credits-used");
  if (!header) {
    return undefined;
  }
  const parsed = Number.parseFloat(header);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseArtistIdentity(payload: unknown): ChartmetricArtistIdentityRaw | null {
  const obj = extractObj(payload);
  if (!obj || typeof obj.id !== "number" || typeof obj.name !== "string") {
    return null;
  }
  const spotifyId = extractSpotifyIdFromCodes(obj);
  return { id: obj.id, name: obj.name, ...(spotifyId ? { spotifyId } : {}) };
}

function parseArtistSearchResults(payload: unknown): ChartmetricArtistIdentityRaw[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const objRecord = payload as Record<string, unknown>;
  const artists = (objRecord.obj as { artists?: unknown[] } | undefined)?.artists ?? [];
  if (!Array.isArray(artists)) {
    return [];
  }
  return artists
    .map((entry) => parseArtistIdentity({ obj: entry }))
    .filter((entry): entry is ChartmetricArtistIdentityRaw => entry !== null);
}

function parseArtistStats(payload: unknown): ChartmetricArtistStatsRaw {
  if (typeof payload !== "object" || payload === null) {
    return { latest: null, history: [] };
  }
  const objRecord = payload as Record<string, unknown>;
  const rawPoints = objRecord.obj;
  if (!Array.isArray(rawPoints)) {
    return { latest: null, history: [] };
  }

  const history: ChartmetricArtistStatPoint[] = rawPoints
    .map((entry) => parseStatPoint(entry))
    .filter((entry): entry is ChartmetricArtistStatPoint => entry !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { latest: history.length > 0 ? history[history.length - 1]! : null, history };
}

function parseStatPoint(entry: unknown): ChartmetricArtistStatPoint | null {
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const date = typeof record.timestp === "string" ? record.timestp : typeof record.date === "string" ? record.date : null;
  if (!date) {
    return null;
  }
  const listeners = toFiniteNumber(record.listeners);
  const followers = toFiniteNumber(record.followers);
  return {
    date,
    ...(listeners !== undefined ? { spotifyMonthlyListeners: listeners } : {}),
    ...(followers !== undefined ? { spotifyFollowers: followers } : {})
  };
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Chartmetric's artist-metadata payload reports social follower counts under
// per-platform keys that vary by API version; check the known aliases and
// take the first finite number found, leaving the field undefined otherwise.
function firstFiniteField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toFiniteNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseArtistScoreAndSocial(payload: unknown): ChartmetricArtistScoreAndSocialRaw {
  const obj = extractObj(payload) as Record<string, unknown> | null;
  if (!obj) {
    return {};
  }
  return {
    chartmetricArtistScore: firstFiniteField(obj, ["cm_artist_score", "cmArtistScore", "chartmetric_score"]),
    instagramFollowers: firstFiniteField(obj, ["ins_followers", "instagram_followers", "instagramFollowers"]),
    tiktokFollowers: firstFiniteField(obj, ["tiktok_followers", "tiktokFollowers"]),
    youtubeSubscribers: firstFiniteField(obj, ["youtube_subscribers", "youtubeSubscribers"]),
    facebookFollowers: firstFiniteField(obj, ["facebook_followers", "facebookFollowers"]),
    twitterFollowers: firstFiniteField(obj, ["twitter_followers", "twitterFollowers"])
  };
}

function parsePlaylistReach(payload: unknown): ChartmetricPlaylistReachRaw {
  const obj = extractObj(payload) as Record<string, unknown> | null;
  if (!obj) {
    return {};
  }
  return {
    playlistReachScore: firstFiniteField(obj, ["playlist_reach_score", "playlistReachScore", "reach_score"]),
    totalCurrentPlaylists: firstFiniteField(obj, ["num_playlists", "total_playlists", "totalCurrentPlaylists"])
  };
}

function parseSimilarArtists(payload: unknown): ChartmetricSimilarArtistRaw[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const objRecord = payload as Record<string, unknown>;
  const list = Array.isArray(objRecord.obj) ? objRecord.obj : [];
  return list
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = record.id;
      const name = record.name;
      if (typeof id !== "number" || typeof name !== "string") {
        return null;
      }
      const score = toFiniteNumber(record.score ?? record.similarity ?? record.weight);
      return { id, name, ...(score !== undefined ? { score } : {}) };
    })
    .filter((entry): entry is ChartmetricSimilarArtistRaw => entry !== null);
}

function extractObj(payload: unknown): { id?: unknown; name?: unknown; code2?: unknown } | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const obj = record.obj ?? payload;
  return typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>) : null;
}

function extractSpotifyIdFromCodes(obj: Record<string, unknown>): string | undefined {
  const code2 = obj.code2;
  if (typeof code2 !== "object" || code2 === null) {
    return undefined;
  }
  const spotifyIds = (code2 as Record<string, unknown>).spotify;
  if (Array.isArray(spotifyIds) && typeof spotifyIds[0] === "string") {
    return spotifyIds[0];
  }
  return undefined;
}
