import { debugLog } from "../../utils/logger.js";
import {
  DEFAULT_FIRECRAWL_TIMEOUT_MS,
  FIRECRAWL_SCRAPE_ENDPOINT,
  FIRECRAWL_SEARCH_ENDPOINT
} from "../../services/firecrawlService.js";
import type { WebExtractProvider, WebExtractResult } from "./WebExtractProvider.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "./WebSearchProvider.js";

type FetchLike = typeof fetch;

export interface WebProviderEnv {
  TAVILY_API_KEY?: string;
  EXA_API_KEY?: string;
  JINA_API_KEY?: string;
  FIRECRAWL_API_KEY?: string;
  ENABLE_TAVILY_SEARCH?: string;
  ENABLE_EXA_SEARCH?: string;
  ENABLE_TAVILY_BOOKING?: string;
  ENABLE_EXA_BOOKING?: string;
  ENABLE_JINA_READER?: string;
  ENABLE_FIRECRAWL_CONSOLIDATION?: string;
  DEBUG_WEB_SEARCH?: string;
  WEB_PROVIDER_TIMEOUT_MS?: string;
  WEB_PROVIDER_DAILY_BUDGET_GUARD?: string;
}

export class NoopSearchProvider implements WebSearchProvider {
  providerName = "noop";

  async search(): Promise<WebSearchResult[]> {
    return [];
  }
}

export class TavilySearchProvider implements WebSearchProvider {
  providerName = "tavily";

  constructor(private readonly env: WebProviderEnv, private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    if (!this.env.TAVILY_API_KEY) {
      return [];
    }

    const limit = clampLimit(options.limit, 5);
    const response = await fetchWithTimeout(
      "https://api.tavily.com/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.env.TAVILY_API_KEY,
          query,
          max_results: limit,
          include_answer: false,
          include_raw_content: false
        })
      },
      parseTimeout(this.env.WEB_PROVIDER_TIMEOUT_MS, options.timeoutMs),
      this.fetchImpl
    );

    if (!response.ok) {
      logProviderFailure("tavily", "search", query, response.status);
      return [];
    }

    const data = (await response.json()) as { results?: Array<{ title?: string; url?: string; content?: string; score?: number }> };
    return (data.results ?? []).flatMap((result) => normalizeSearchResult({
      title: result.title ?? null,
      url: result.url ?? null,
      snippet: result.content ?? null,
      confidence: typeof result.score === "number" ? clampConfidence(result.score) : 0.72,
      sourceProvider: this.providerName
    }));
  }
}

export class ExaSearchProvider implements WebSearchProvider {
  providerName = "exa";

  constructor(private readonly env: WebProviderEnv, private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    if (!this.env.EXA_API_KEY) {
      return [];
    }

    const limit = clampLimit(options.limit, 5);
    const response = await fetchWithTimeout(
      "https://api.exa.ai/search",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.EXA_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          numResults: limit,
          type: "auto"
        })
      },
      parseTimeout(this.env.WEB_PROVIDER_TIMEOUT_MS, options.timeoutMs),
      this.fetchImpl
    );

    if (!response.ok) {
      logProviderFailure("exa", "search", query, response.status);
      return [];
    }

    const data = (await response.json()) as { results?: Array<{ title?: string; url?: string; text?: string; score?: number }> };
    return (data.results ?? []).flatMap((result) => normalizeSearchResult({
      title: result.title ?? null,
      url: result.url ?? null,
      snippet: result.text ?? null,
      confidence: typeof result.score === "number" ? clampConfidence(result.score) : 0.7,
      sourceProvider: this.providerName
    }));
  }
}

export class FirecrawlSearchProvider implements WebSearchProvider {
  providerName = "firecrawl";

  constructor(private readonly env: WebProviderEnv, private readonly fetchImpl: FetchLike = fetch) {}

  async search(query: string, options: WebSearchOptions = {}): Promise<WebSearchResult[]> {
    if (!this.env.FIRECRAWL_API_KEY) {
      return [];
    }

    const limit = clampLimit(options.limit, 5);
    const response = await fetchWithTimeout(
      FIRECRAWL_SEARCH_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, limit })
      },
      parseTimeout(this.env.WEB_PROVIDER_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_FIRECRAWL_TIMEOUT_MS),
      this.fetchImpl
    );

    if (!response.ok) {
      logProviderFailure("firecrawl", "search", query, response.status);
      return [];
    }

    const data = (await response.json()) as {
      data?: { web?: FirecrawlResult[] } | FirecrawlResult[];
    };
    const rawResults = Array.isArray(data.data) ? data.data : data.data?.web ?? [];
    return rawResults.flatMap((result) => normalizeSearchResult({
      title: result.title ?? result.metadata?.title ?? null,
      url: result.url ?? result.metadata?.sourceURL ?? result.metadata?.url ?? null,
      snippet: result.description ?? result.metadata?.description ?? null,
      markdown: result.markdown ?? null,
      links: result.links ?? [],
      confidence: 0.72,
      sourceProvider: this.providerName
    }));
  }
}

export class JinaExtractProvider implements WebExtractProvider {
  providerName = "jina";

  constructor(private readonly env: WebProviderEnv, private readonly fetchImpl: FetchLike = fetch) {}

  async extract(url: string, options: { timeoutMs?: number } = {}): Promise<WebExtractResult | null> {
    const readerUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {};
    if (this.env.JINA_API_KEY) {
      headers.Authorization = `Bearer ${this.env.JINA_API_KEY}`;
    }

    const response = await fetchWithTimeout(
      readerUrl,
      { method: "GET", headers },
      parseTimeout(this.env.WEB_PROVIDER_TIMEOUT_MS, options.timeoutMs),
      this.fetchImpl
    );

    if (!response.ok) {
      logProviderFailure("jina", "extract", url, response.status);
      return null;
    }

    const markdown = await response.text();
    return {
      url,
      title: extractMarkdownTitle(markdown),
      text: markdown,
      markdown,
      sourceProvider: this.providerName,
      statusCode: response.status
    };
  }
}

export class FirecrawlExtractProvider implements WebExtractProvider {
  providerName = "firecrawl";

  constructor(private readonly env: WebProviderEnv, private readonly fetchImpl: FetchLike = fetch) {}

  async extract(url: string, options: { timeoutMs?: number } = {}): Promise<WebExtractResult | null> {
    if (!this.env.FIRECRAWL_API_KEY) {
      return null;
    }

    const response = await fetchWithTimeout(
      FIRECRAWL_SCRAPE_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json"
        },
        // rawHtml stays fully unprocessed (head/header/footer/JSON-LD/meta
        // tags intact) regardless of onlyMainContent — confirmed live: only
        // `markdown` is affected by that flag, so requesting rawHtml/links
        // alongside it is purely additive (same 1 scrape credit) and never
        // regresses the existing clean-markdown behavior other callers rely on.
        body: JSON.stringify({ url, formats: ["markdown", "rawHtml", "links"], onlyMainContent: true })
      },
      parseTimeout(this.env.WEB_PROVIDER_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_FIRECRAWL_TIMEOUT_MS),
      this.fetchImpl
    );

    if (!response.ok) {
      logProviderFailure("firecrawl", "extract", url, response.status);
      return null;
    }

    const data = (await response.json()) as {
      data?: { markdown?: string; content?: string; rawHtml?: string; links?: string[]; metadata?: { title?: string } };
    };
    const markdown = data.data?.markdown ?? data.data?.content ?? null;
    return {
      url,
      title: data.data?.metadata?.title ?? extractMarkdownTitle(markdown ?? ""),
      text: markdown,
      markdown,
      html: data.data?.rawHtml ?? null,
      links: data.data?.links ?? null,
      sourceProvider: this.providerName,
      statusCode: response.status
    };
  }
}

export function buildDefaultWebSearchProvider(env: WebProviderEnv = process.env, fetchImpl: FetchLike = fetch): WebSearchProvider {
  const providers = getEnabledSearchProviders(env, fetchImpl);
  const provider = providers[0] ?? new NoopSearchProvider();
  debugLog("web-search", "web search provider selected", {
    providersEnabled: providers.map((entry) => entry.providerName),
    selectedProvider: provider.providerName,
    budgetGuardEnabled: env.WEB_PROVIDER_DAILY_BUDGET_GUARD !== "false",
    tavilyApiKeyPresent: Boolean(env.TAVILY_API_KEY),
    exaApiKeyPresent: Boolean(env.EXA_API_KEY),
    firecrawlApiKeyPresent: Boolean(env.FIRECRAWL_API_KEY)
  });
  return provider;
}

export function buildDefaultWebExtractProvider(env: WebProviderEnv = process.env, fetchImpl: FetchLike = fetch): WebExtractProvider | null {
  const providers = getEnabledExtractProviders(env, fetchImpl);
  const provider = providers[0] ?? null;
  debugLog("web-search", "web extract provider selected", {
    providersEnabled: providers.map((entry) => entry.providerName),
    selectedProvider: provider?.providerName ?? null,
    jinaApiKeyPresent: Boolean(env.JINA_API_KEY),
    firecrawlApiKeyPresent: Boolean(env.FIRECRAWL_API_KEY)
  });
  return provider;
}

export function getEnabledSearchProviders(env: WebProviderEnv = process.env, fetchImpl: FetchLike = fetch): WebSearchProvider[] {
  const providers: WebSearchProvider[] = [];
  if (env.ENABLE_TAVILY_SEARCH === "true" && env.TAVILY_API_KEY) {
    providers.push(new TavilySearchProvider(env, fetchImpl));
  }
  if (env.ENABLE_EXA_SEARCH === "true" && env.EXA_API_KEY) {
    providers.push(new ExaSearchProvider(env, fetchImpl));
  }
  if (env.ENABLE_FIRECRAWL_CONSOLIDATION === "true" && env.FIRECRAWL_API_KEY) {
    providers.push(new FirecrawlSearchProvider(env, fetchImpl));
  }
  return providers;
}

export function getEnabledBookingSearchProviders(env: WebProviderEnv = process.env, fetchImpl: FetchLike = fetch): WebSearchProvider[] {
  const providers: WebSearchProvider[] = [];
  if (env.TAVILY_API_KEY && env.ENABLE_TAVILY_BOOKING !== "false") {
    providers.push(new TavilySearchProvider(env, fetchImpl));
  }
  if (env.EXA_API_KEY && env.ENABLE_EXA_BOOKING !== "false") {
    providers.push(new ExaSearchProvider(env, fetchImpl));
  }
  return providers;
}

export function getEnabledExtractProviders(env: WebProviderEnv = process.env, fetchImpl: FetchLike = fetch): WebExtractProvider[] {
  const providers: WebExtractProvider[] = [];
  if (env.ENABLE_JINA_READER !== "false") {
    providers.push(new JinaExtractProvider(env, fetchImpl));
  }
  if (env.ENABLE_FIRECRAWL_CONSOLIDATION === "true" && env.FIRECRAWL_API_KEY) {
    providers.push(new FirecrawlExtractProvider(env, fetchImpl));
  }
  return providers;
}

interface FirecrawlResult {
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

function normalizeSearchResult(result: WebSearchResult): WebSearchResult[] {
  if (!result.url) {
    return [];
  }
  return [{
    ...result,
    title: result.title ?? null,
    snippet: result.snippet ?? null,
    confidence: clampConfidence(result.confidence),
    links: result.links ?? []
  }];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, fetchImpl: FetchLike): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Web provider request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    debugLog("web-search", "web provider request failed", {
      endpoint: url,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function logProviderFailure(provider: string, operation: string, input: string, status: number): void {
  debugLog("web-search", "web provider request returned non-ok status", {
    provider,
    operation,
    input,
    status
  });
}

function clampLimit(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.min(value ?? fallback, 10));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function parseTimeout(envValue: string | undefined, optionValue: number | undefined): number {
  const parsed = Number.parseInt(String(optionValue ?? envValue ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(1_000, Math.min(parsed, 60_000)) : 20_000;
}

function extractMarkdownTitle(markdown: string): string | null {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}
