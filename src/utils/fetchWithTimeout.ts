import { debugLog } from "./logger.js";

type FetchLike = typeof fetch;

/**
 * Aborts the request after `timeoutMs` rather than letting a slow/unreachable
 * third-party API hang the whole pipeline. Logs (without throwing extra
 * context) and rethrows so callers can decide how to handle the failure.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    debugLog("concert-history", "request failed", {
      endpoint: url,
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
