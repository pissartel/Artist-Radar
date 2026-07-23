import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { z } from "zod";
import { debugLog, warnLog } from "../../utils/logger.js";
import {
  OpenAIConcertDiscoveryResultSchema,
  createOpenAIConcertDiagnostics,
  type OpenAIConcertDiagnostics,
  type OpenAIConcertDiscoveryResult
} from "./types.js";

/** Narrow interface capturing only what this module calls — makes injecting a fake client in tests trivial without fighting the full SDK's types. */
export interface OpenAIResponsesClient {
  responses: {
    create(params: ResponseCreateParamsNonStreaming): Promise<Response>;
  };
}

export interface OpenAIConcertClientOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Injectable for tests — never construct a second ad-hoc client in production code. */
  client?: OpenAIResponsesClient;
}

export interface ConcertSearchOutcome {
  result: OpenAIConcertDiscoveryResult;
  /** Real URLs backed by the response's own web-search citations — used to reject model-claimed sources that aren't actually cited (see verification step in the provider). */
  citedUrls: Set<string>;
}

const RESPONSE_JSON_SCHEMA = (() => {
  const schema = z.toJSONSchema(OpenAIConcertDiscoveryResultSchema) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();

const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Thin wrapper over the OpenAI Responses API's web_search tool + Structured
 * Outputs. Per-run memoized (one consolidated call per cache key), bounded
 * retry via the SDK's own maxRetries (429/5xx/timeout only — 400/401/403
 * throw immediately and are never retried), and validates the parsed JSON
 * with Zod even though Structured Outputs already enforces the shape.
 */
export class OpenAIConcertClient {
  private readonly client: OpenAIResponsesClient;
  private readonly model: string;
  readonly diagnostics: OpenAIConcertDiagnostics;
  private readonly cache = new Map<string, Promise<ConcertSearchOutcome | null>>();

  constructor(options: OpenAIConcertClientOptions) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxRetries: 1
      });
    this.model = options.model;
    this.diagnostics = createOpenAIConcertDiagnostics(true);
  }

  async search(cacheKey: string, prompt: string): Promise<ConcertSearchOutcome | null> {
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.diagnostics.cacheHits += 1;
      return cached;
    }
    this.diagnostics.cacheMisses += 1;

    const promise = this.runSearch(prompt);
    this.cache.set(cacheKey, promise);
    return promise;
  }

  private async runSearch(prompt: string): Promise<ConcertSearchOutcome | null> {
    this.diagnostics.apiCalls += 1;

    let response;
    try {
      response = await this.client.responses.create({
        model: this.model,
        input: prompt,
        tools: [{ type: "web_search" }],
        // Structured Outputs (strict json_schema) never populates message
        // text annotations — a raw JSON blob has no natural place for
        // inline citation markers — so the actual searched/visited URLs
        // must be requested explicitly via `include` and read from the
        // web_search_call item instead (see extractCitedUrls below).
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_schema",
            name: "concert_discovery_result",
            schema: RESPONSE_JSON_SCHEMA,
            strict: true
          }
        }
      });
    } catch (error) {
      this.diagnostics.apiErrors += 1;
      warnLog("openai-concerts", `OpenAI Responses API call failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    const rawText = response.output_text;
    if (!rawText) {
      this.diagnostics.malformedResponses += 1;
      warnLog("openai-concerts", "OpenAI response had no output text.");
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      this.diagnostics.malformedResponses += 1;
      warnLog("openai-concerts", "OpenAI response output text was not valid JSON.");
      return null;
    }

    const validated = OpenAIConcertDiscoveryResultSchema.safeParse(parsedJson);
    if (!validated.success) {
      this.diagnostics.malformedResponses += 1;
      debugLog("openai-concerts", `OpenAI response failed schema validation: ${validated.error.message}`);
      return null;
    }

    const citedUrls = extractCitedUrls(response);
    return { result: validated.data, citedUrls };
  }
}

/**
 * Real, tool-verified URLs the model could have cited — read from both
 * message-text citation annotations (populated in freeform-text mode) and
 * web_search_call.action.sources (the only place these show up in
 * Structured Outputs mode; requires `include: ["web_search_call.action.sources"]`
 * on the request). URLs are normalized (origin + pathname, query/tracking
 * params like `?utm_source=openai` stripped) since the model's own claimed
 * source URL and the tool's actual URL otherwise fail to match on that
 * suffix alone even when they're the same page.
 */
function extractCitedUrls(response: { output: unknown }): Set<string> {
  const urls = new Set<string>();
  const output = Array.isArray(response.output) ? response.output : [];

  const addUrl = (url: unknown) => {
    if (typeof url === "string" && url) {
      urls.add(normalizeUrlForComparison(url));
    }
  };

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const itemType = (item as { type?: string }).type;

    if (itemType === "web_search_call") {
      const sources = (item as { action?: { sources?: unknown } }).action?.sources;
      if (Array.isArray(sources)) {
        for (const source of sources) {
          if (source && typeof source === "object") {
            addUrl((source as { url?: unknown }).url);
          }
        }
      }
      continue;
    }

    if (itemType !== "message") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== "object" || (part as { type?: string }).type !== "output_text") {
        continue;
      }
      const annotations = (part as { annotations?: unknown }).annotations;
      if (!Array.isArray(annotations)) {
        continue;
      }
      for (const annotation of annotations) {
        if (annotation && typeof annotation === "object" && (annotation as { type?: string }).type === "url_citation") {
          addUrl((annotation as { url?: unknown }).url);
        }
      }
    }
  }

  return urls;
}

/** Exported so callers can normalize a model-claimed URL the same way before checking membership in the cited-URL set. */
export function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}
