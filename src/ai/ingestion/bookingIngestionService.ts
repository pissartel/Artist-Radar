import type { DocumentStore } from "../../knowledge/documentStore.js";
import type { ChunkStore } from "../../knowledge/chunkStore.js";
import { buildKnowledgeChunks } from "../../knowledge/chunkText.js";
import { embedChunks, type EmbeddingProvider } from "../../knowledge/embeddings.js";
import { cleanHtmlToText, extractHtmlTitle, isEmptyOrBoilerplateText } from "../../knowledge/htmlText.js";
import type { NewKnowledgeDocument } from "../../knowledge/types.js";
import { warnLog } from "../../utils/logger.js";
import { BOOKING_RAG_SEED_SOURCES, type BookingRagSeedSource } from "./bookingRagSeedSources.js";
import type { HeadlessPageFetcher } from "./headlessPageFetcher.js";

const FETCH_TIMEOUT_MS = 10_000;
const CHALLENGE_STATUS_CODES = new Set([403, 429]);
const CHALLENGE_HEADER_NAMES = ["cf-mitigated", "x-vercel-mitigated"];

type FetchLike = typeof fetch;
type FetchMethod = "plain" | "headless";

export interface BookingIngestionOptions {
  sources?: BookingRagSeedSource[];
  documentStore: DocumentStore;
  chunkStore: ChunkStore;
  embeddingProvider: EmbeddingProvider;
  fetchImpl?: FetchLike;
  headlessFetcher?: HeadlessPageFetcher;
  now?: Date;
}

export type BookingIngestionSourceStatus = "ingested" | "skipped-empty" | "failed";

export interface BookingIngestionSourceResult {
  name: string;
  url: string;
  status: BookingIngestionSourceStatus;
  reason?: string;
  documentId?: string;
  chunksCreated?: number;
  fetchMethod?: FetchMethod;
}

export interface BookingIngestionSummary {
  sourcesAttempted: number;
  documentsCreated: number;
  chunksCreated: number;
  sourcesIngestedViaHeadless: number;
  warnings: string[];
  sourceResults: BookingIngestionSourceResult[];
  generatedAt: string;
}

interface RenderedPage {
  html: string;
  text: string;
  fetchMethod: FetchMethod;
}

export async function runBookingRagIngestion(options: BookingIngestionOptions): Promise<BookingIngestionSummary> {
  const sources = options.sources ?? BOOKING_RAG_SEED_SOURCES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  const warnings: string[] = [];
  const sourceResults: BookingIngestionSourceResult[] = [];
  let documentsCreated = 0;
  let chunksCreated = 0;
  let sourcesIngestedViaHeadless = 0;

  for (const source of sources) {
    try {
      const plainAttempt = await fetchPlainPage(source, fetchImpl);
      let page: RenderedPage | null = plainAttempt.page;
      let reason = plainAttempt.reason;
      let status: BookingIngestionSourceStatus = plainAttempt.status;

      if (!page && options.headlessFetcher && (plainAttempt.shouldRetryHeadless || source.requiresHeadless)) {
        const headlessAttempt = await fetchHeadlessPage(source, options.headlessFetcher);
        page = headlessAttempt.page;
        if (!page) {
          reason = headlessAttempt.reason;
          status = headlessAttempt.status;
        }
      }

      if (!page) {
        const finalReason = reason ?? "page had no meaningful content";
        warnings.push(`${source.name} (${source.url}) skipped: ${finalReason}.`);
        sourceResults.push({ name: source.name, url: source.url, status, reason: finalReason });
        continue;
      }

      const newDocument: NewKnowledgeDocument = {
        domain: "booking",
        sourceName: source.name,
        sourceType: source.type,
        url: source.url,
        title: extractHtmlTitle(page.html) ?? undefined,
        text: page.text,
        fetchedAt: now.toISOString()
      };

      const document = await options.documentStore.save(newDocument);
      documentsCreated += 1;

      const chunks = buildKnowledgeChunks(document);
      const savedChunks = await embedChunks(chunks, options.chunkStore, options.embeddingProvider);
      chunksCreated += savedChunks.length;

      if (page.fetchMethod === "headless") {
        sourcesIngestedViaHeadless += 1;
      }

      sourceResults.push({
        name: source.name,
        url: source.url,
        status: "ingested",
        documentId: document.id,
        chunksCreated: savedChunks.length,
        fetchMethod: page.fetchMethod
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${source.name} (${source.url}) failed: ${message}.`);
      sourceResults.push({ name: source.name, url: source.url, status: "failed", reason: message });
    }
  }

  const summary: BookingIngestionSummary = {
    sourcesAttempted: sources.length,
    documentsCreated,
    chunksCreated,
    sourcesIngestedViaHeadless,
    warnings,
    sourceResults,
    generatedAt: now.toISOString()
  };

  warnLog("booking", [
    "Booking RAG ingestion:",
    `- sources attempted: ${summary.sourcesAttempted}`,
    `- documents created/updated: ${summary.documentsCreated}`,
    `- chunks created/updated: ${summary.chunksCreated}`,
    `- ingested via headless fallback: ${summary.sourcesIngestedViaHeadless}`,
    `- warnings: ${summary.warnings.length}`
  ].join("\n"));

  return summary;
}

interface PageAttempt {
  page: RenderedPage | null;
  reason?: string;
  status: BookingIngestionSourceStatus;
  shouldRetryHeadless: boolean;
}

async function fetchPlainPage(source: BookingRagSeedSource, fetchImpl: FetchLike): Promise<PageAttempt> {
  if (source.requiresHeadless) {
    return {
      page: null,
      reason: "requires headless fallback, which is not available",
      status: "skipped-empty",
      shouldRetryHeadless: true
    };
  }

  const response = await fetchWithTimeout(source.url, fetchImpl);
  if (!response.ok) {
    return {
      page: null,
      reason: `HTTP ${response.status}`,
      status: "failed",
      shouldRetryHeadless: isChallengeResponse(response)
    };
  }

  const html = await response.text();
  const text = cleanHtmlToText(html);

  if (isEmptyOrBoilerplateText(text)) {
    return {
      page: null,
      reason: "page had no meaningful content",
      status: "skipped-empty",
      shouldRetryHeadless: true
    };
  }

  return { page: { html, text, fetchMethod: "plain" }, status: "ingested", shouldRetryHeadless: false };
}

async function fetchHeadlessPage(
  source: BookingRagSeedSource,
  headlessFetcher: HeadlessPageFetcher
): Promise<{ page: RenderedPage | null; reason: string; status: BookingIngestionSourceStatus }> {
  try {
    const html = await headlessFetcher.fetchRenderedHtml(source.url);
    const text = cleanHtmlToText(html);

    if (isEmptyOrBoilerplateText(text)) {
      return {
        page: null,
        reason: "page had no meaningful content after headless fallback",
        status: "skipped-empty"
      };
    }

    return { page: { html, text, fetchMethod: "headless" }, reason: "", status: "ingested" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { page: null, reason: `headless fallback failed: ${message}`, status: "failed" };
  }
}

function isChallengeResponse(response: Response): boolean {
  if (CHALLENGE_STATUS_CODES.has(response.status)) {
    return true;
  }

  return CHALLENGE_HEADER_NAMES.some((headerName) => response.headers.get(headerName) !== null);
}

async function fetchWithTimeout(url: string, fetchImpl: FetchLike): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ArtistRadar/1.0 (booking RAG ingestion)" }
    });
  } finally {
    clearTimeout(timeout);
  }
}
