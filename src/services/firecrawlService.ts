import { debugLog } from "../utils/logger.js";
import type { WebSearchProvider, WebSearchResult } from "./artistVerificationService.js";

export interface FirecrawlEnv {
  FIRECRAWL_API_KEY?: string;
  ENABLE_FIRECRAWL_CONSOLIDATION?: string;
  DEBUG_FIRECRAWL?: string;
  FIRECRAWL_TIMEOUT_MS?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: {
    web?: FirecrawlSearchResult[];
  } | FirecrawlSearchResult[];
}

interface FirecrawlSearchResult {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  markdown?: string | null;
  links?: string[];
  metadata?: {
    title?: string | null;
    description?: string | null;
    sourceURL?: string | null;
    url?: string | null;
  };
}

type FetchLike = typeof fetch;

export const FIRECRAWL_SEARCH_ENDPOINT = "https://api.firecrawl.dev/v1/search";
export const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v1/scrape";
export const DEFAULT_FIRECRAWL_TIMEOUT_MS = 20_000;

export function isFirecrawlConsolidationEnabled(env: FirecrawlEnv = process.env): boolean {
  const firecrawlApiKeyPresent = Boolean(env.FIRECRAWL_API_KEY);
  const enabledFlag = env.ENABLE_FIRECRAWL_CONSOLIDATION;
  const enabled = enabledFlag === "true" && firecrawlApiKeyPresent;
  debugLog("firecrawl", "Firecrawl consolidation configuration", {
    firecrawlApiKeyPresent,
    ENABLE_FIRECRAWL_CONSOLIDATION: enabledFlag ?? null,
    firecrawlConsolidationEnabled: enabled
  });
  return enabled;
}

export function buildFirecrawlWebSearchProvider(
  env: FirecrawlEnv = process.env,
  fetchImpl: FetchLike = fetch
): WebSearchProvider | null {
  if (!isFirecrawlConsolidationEnabled(env)) {
    return null;
  }

  return {
    async search(query: string, limit: number): Promise<WebSearchResult[]> {
      const cappedLimit = Math.max(1, Math.min(limit, 5));
      const timeoutMs = parseFirecrawlTimeout(env.FIRECRAWL_TIMEOUT_MS);
      const body = {
        query,
        limit: cappedLimit
      };
      debugLog("firecrawl", "Firecrawl search query", {
        endpoint: FIRECRAWL_SEARCH_ENDPOINT,
        query,
        firecrawlApiKeyPresent: Boolean(env.FIRECRAWL_API_KEY),
        requestTimeoutMs: timeoutMs,
        bodySummary: body
      });

      try {
        const response = await fetchWithTimeout(
          FIRECRAWL_SEARCH_ENDPOINT,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          },
          timeoutMs,
          fetchImpl
        );

        if (!response.ok) {
          logFirecrawlFailure({
            endpoint: FIRECRAWL_SEARCH_ENDPOINT,
            query,
            status: response.status,
            env,
            timeoutMs,
            error: new Error("Firecrawl search HTTP error")
          });
          return [];
        }

        const data = (await response.json()) as FirecrawlSearchResponse;
        const rawResults = Array.isArray(data.data) ? data.data : data.data?.web ?? [];
        const results = rawResults.flatMap(normalizeFirecrawlResult);
        debugLog("firecrawl", "Firecrawl search result count", {
          endpoint: FIRECRAWL_SEARCH_ENDPOINT,
          query,
          resultCount: results.length,
          urlsSelected: results.map((result) => result.url).filter(Boolean)
        });
        return results;
      } catch (error) {
        logFirecrawlFailure({
          endpoint: FIRECRAWL_SEARCH_ENDPOINT,
          query,
          status: null,
          env,
          timeoutMs,
          error
        });
        return [];
      }
    }
  };
}

export async function firecrawlScrapeUrl(
  url: string,
  env: FirecrawlEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<{ success: boolean; status: number | null }> {
  if (!env.FIRECRAWL_API_KEY) {
    return { success: false, status: null };
  }

  const timeoutMs = parseFirecrawlTimeout(env.FIRECRAWL_TIMEOUT_MS);
  try {
    const response = await fetchWithTimeout(
      FIRECRAWL_SCRAPE_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true
        })
      },
      timeoutMs,
      fetchImpl
    );
    return { success: response.ok, status: response.status };
  } catch (error) {
    logFirecrawlFailure({
      endpoint: FIRECRAWL_SCRAPE_ENDPOINT,
      query: url,
      status: null,
      env,
      timeoutMs,
      error
    });
    return { success: false, status: null };
  }
}

function normalizeFirecrawlResult(result: FirecrawlSearchResult): WebSearchResult[] {
  const url = result.url ?? result.metadata?.sourceURL ?? result.metadata?.url ?? null;
  if (!url) {
    return [];
  }

  return [
    {
      title: result.title ?? result.metadata?.title ?? null,
      url,
      snippet: result.description ?? result.metadata?.description ?? null,
      markdown: result.markdown ?? null,
      links: result.links ?? []
    }
  ];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Firecrawl request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function logFirecrawlFailure(input: {
  endpoint: string;
  query: string;
  status: number | null;
  env: FirecrawlEnv;
  timeoutMs: number;
  error: unknown;
}): void {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));
  debugLog("firecrawl", "Firecrawl request failed", {
    endpoint: input.endpoint,
    query: input.query,
    status: input.status,
    errorName: error.name,
    errorMessage: error.message,
    errorCauseMessage: getErrorCauseMessage(error),
    firecrawlApiKeyPresent: Boolean(input.env.FIRECRAWL_API_KEY),
    requestTimeoutMs: input.timeoutMs
  });
}

function getErrorCauseMessage(error: Error): string | null {
  const cause = error.cause;
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === "object" && cause !== null && "message" in cause && typeof cause.message === "string") {
    return cause.message;
  }
  return null;
}

function parseFirecrawlTimeout(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FIRECRAWL_TIMEOUT_MS;
  }
  return Math.max(1_000, Math.min(parsed, 60_000));
}
