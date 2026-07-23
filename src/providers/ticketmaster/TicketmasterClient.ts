import { fetchWithTimeout, parseTimeoutMs, redactUrlForLogging } from "../../utils/fetchWithTimeout.js";
import { debugLog, warnLog } from "../../utils/logger.js";
import { normalizeKey } from "../../utils/venueNameNormalization.js";
import type { TicketmasterEventApi } from "./normalizeTicketmasterEvent.js";

export interface TicketmasterAttractionApi {
  id?: string;
  name?: string;
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }>;
}

export interface TicketmasterVenueDetailApi {
  id?: string;
  name?: string;
  city?: { name?: string };
  state?: { name?: string };
  country?: { name?: string };
  address?: { line1?: string };
  postalCode?: string;
  location?: { longitude?: string; latitude?: string };
  url?: string;
}

export interface TicketmasterDiagnostics {
  enabled: boolean;
  genreQueries: number;
  locationQueries: number;
  attractionQueries: number;
  eventQueries: number;
  venueQueries: number;
  cacheHits: number;
  cacheMisses: number;
  rateLimitErrors: number;
  ambiguousAttractions: number;
  unresolvedAttractions: number;
  rawEventCount: number;
  finalEventCount: number;
}

export function createTicketmasterDiagnostics(enabled: boolean): TicketmasterDiagnostics {
  return {
    enabled,
    genreQueries: 0,
    locationQueries: 0,
    attractionQueries: 0,
    eventQueries: 0,
    venueQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    rateLimitErrors: 0,
    ambiguousAttractions: 0,
    unresolvedAttractions: 0,
    rawEventCount: 0,
    finalEventCount: 0
  };
}

export interface TicketmasterClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  diagnostics?: TicketmasterDiagnostics;
}

const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;

interface TicketmasterEventsResponse {
  _embedded?: { events?: TicketmasterEventApi[] };
}

interface TicketmasterAttractionsResponse {
  _embedded?: { attractions?: TicketmasterAttractionApi[] };
}

interface TicketmasterVenueResponse extends TicketmasterVenueDetailApi {}

/**
 * Thin, cost-conscious client over the Ticketmaster Discovery API v2.
 * Every query is memoized per exact parameter shape for this client
 * instance's lifetime (one booking search), never retries 4xx (only 429
 * and 5xx, bounded), and never logs the API key — it travels as a URL
 * query param, so every logged URL is redacted first (see
 * src/utils/fetchWithTimeout.ts's redactUrlForLogging).
 */
export class TicketmasterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  readonly diagnostics: TicketmasterDiagnostics;

  private readonly eventCache = new Map<string, Promise<TicketmasterEventApi[]>>();
  private readonly attractionCache = new Map<string, Promise<TicketmasterAttractionApi[]>>();
  private readonly venueCache = new Map<string, Promise<TicketmasterVenueDetailApi | null>>();

  constructor(options: TicketmasterClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://app.ticketmaster.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? parseTimeoutMs(undefined);
    this.diagnostics = options.diagnostics ?? createTicketmasterDiagnostics(true);
  }

  async searchEvents(
    params: Record<string, string>,
    queryKind: "genre" | "location" | "artist"
  ): Promise<TicketmasterEventApi[]> {
    const cacheKey = `events:${stableParamKey(params)}`;
    const cached = this.eventCache.get(cacheKey);
    if (cached) {
      this.diagnostics.cacheHits += 1;
      return cached;
    }
    this.diagnostics.cacheMisses += 1;
    if (queryKind === "genre") this.diagnostics.genreQueries += 1;
    if (queryKind === "location") this.diagnostics.locationQueries += 1;
    if (queryKind === "artist") this.diagnostics.eventQueries += 1;

    const promise = (async () => {
      const url = this.buildUrl("/discovery/v2/events.json", params);
      const response = await this.requestWithRetry(url);
      if (!response) {
        return [];
      }
      const body = (await response.json()) as TicketmasterEventsResponse;
      const events = body._embedded?.events ?? [];
      this.diagnostics.rawEventCount += events.length;
      return events;
    })();
    this.eventCache.set(cacheKey, promise);
    return promise;
  }

  async searchAttractions(artistName: string): Promise<TicketmasterAttractionApi[]> {
    const cacheKey = normalizeKey(artistName);
    const cached = this.attractionCache.get(cacheKey);
    if (cached) {
      this.diagnostics.cacheHits += 1;
      return cached;
    }
    this.diagnostics.cacheMisses += 1;
    this.diagnostics.attractionQueries += 1;

    const promise = (async () => {
      const url = this.buildUrl("/discovery/v2/attractions.json", { keyword: artistName, size: "10" });
      const response = await this.requestWithRetry(url);
      if (!response) {
        return [];
      }
      const body = (await response.json()) as TicketmasterAttractionsResponse;
      return body._embedded?.attractions ?? [];
    })();
    this.attractionCache.set(cacheKey, promise);
    return promise;
  }

  async getVenue(venueId: string): Promise<TicketmasterVenueDetailApi | null> {
    const cached = this.venueCache.get(venueId);
    if (cached) {
      this.diagnostics.cacheHits += 1;
      return cached;
    }
    this.diagnostics.cacheMisses += 1;
    this.diagnostics.venueQueries += 1;

    const promise = (async () => {
      const url = this.buildUrl(`/discovery/v2/venues/${encodeURIComponent(venueId)}.json`, {});
      const response = await this.requestWithRetry(url);
      if (!response) {
        return null;
      }
      return (await response.json()) as TicketmasterVenueResponse;
    })();
    this.venueCache.set(venueId, promise);
    return promise;
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("apikey", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async requestWithRetry(url: string, attempt = 0): Promise<Response | null> {
    try {
      debugLog("ticketmaster", `[request]${attempt > 0 ? ` (retry ${attempt})` : ""} GET ${redactUrlForLogging(url)}`);
      const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, this.timeoutMs, this.fetchImpl);
      debugLog("ticketmaster", `[request]   -> HTTP ${response.status}`);

      if (response.status === 429) {
        this.diagnostics.rateLimitErrors += 1;
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_BACKOFF_MS * (attempt + 1));
          return this.requestWithRetry(url, attempt + 1);
        }
        warnLog("ticketmaster", "Rate limited (HTTP 429) and retries exhausted; skipping this query.");
        return null;
      }
      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_BACKOFF_MS * (attempt + 1));
          return this.requestWithRetry(url, attempt + 1);
        }
        warnLog("ticketmaster", `Ticketmaster server error (HTTP ${response.status}) after retries; skipping this query.`);
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        warnLog("ticketmaster", `Ticketmaster rejected credentials (HTTP ${response.status}).`);
        return null;
      }
      if (response.status === 404) {
        return null;
      }
      if (response.status === 400) {
        warnLog("ticketmaster", `Ticketmaster rejected the request (HTTP 400) for ${redactUrlForLogging(url)}.`);
        return null;
      }
      if (!response.ok) {
        warnLog("ticketmaster", `Ticketmaster request failed (HTTP ${response.status}).`);
        return null;
      }
      return response;
    } catch (error) {
      warnLog("ticketmaster", `Ticketmaster request errored: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

function stableParamKey(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
