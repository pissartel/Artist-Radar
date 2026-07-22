import { debugLog, type DebugScope } from "./logger.js";

type FetchLike = typeof fetch;

// Some providers (Ticketmaster) require the API key as a URL query
// parameter rather than a header. debugLog's own redaction only inspects
// object keys/Authorization-style string values, so it would not catch a
// secret embedded inside an arbitrary logged URL string — redact it here,
// before the URL ever reaches a log call, regardless of which provider.
const SECRET_QUERY_PARAM_PATTERN = /([?&](?:apikey|api_key|key|token|access_token)=)[^&]+/gi;

export function redactUrlForLogging(url: string): string {
  return url.replace(SECRET_QUERY_PARAM_PATTERN, "$1[redacted]");
}

/**
 * Aborts the request after `timeoutMs` rather than letting a slow/unreachable
 * third-party API hang the whole pipeline. Logs (without throwing extra
 * context) and rethrows so callers can decide how to handle the failure.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
  scope: DebugScope = "sources"
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    debugLog(scope, "request failed", {
      endpoint: redactUrlForLogging(url),
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseTimeoutMs(envValue: string | undefined, fallback = 10_000): number {
  const parsed = Number.parseInt(envValue ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(1_000, Math.min(parsed, 60_000)) : fallback;
}
