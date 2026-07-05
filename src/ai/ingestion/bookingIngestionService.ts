import type { DocumentStore } from "../../knowledge/documentStore.js";
import type { ChunkStore } from "../../knowledge/chunkStore.js";
import { buildKnowledgeChunks } from "../../knowledge/chunkText.js";
import { embedChunks, type EmbeddingProvider } from "../../knowledge/embeddings.js";
import { cleanHtmlToText, extractHtmlTitle, isEmptyOrBoilerplateText } from "../../knowledge/htmlText.js";
import type { NewKnowledgeDocument } from "../../knowledge/types.js";
import { warnLog } from "../../utils/logger.js";
import { BOOKING_RAG_SEED_SOURCES, type BookingRagSeedSource } from "./bookingRagSeedSources.js";

const FETCH_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

export interface BookingIngestionOptions {
  sources?: BookingRagSeedSource[];
  documentStore: DocumentStore;
  chunkStore: ChunkStore;
  embeddingProvider: EmbeddingProvider;
  fetchImpl?: FetchLike;
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
}

export interface BookingIngestionSummary {
  sourcesAttempted: number;
  documentsCreated: number;
  chunksCreated: number;
  warnings: string[];
  sourceResults: BookingIngestionSourceResult[];
  generatedAt: string;
}

export async function runBookingRagIngestion(options: BookingIngestionOptions): Promise<BookingIngestionSummary> {
  const sources = options.sources ?? BOOKING_RAG_SEED_SOURCES;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  const warnings: string[] = [];
  const sourceResults: BookingIngestionSourceResult[] = [];
  let documentsCreated = 0;
  let chunksCreated = 0;

  for (const source of sources) {
    try {
      const response = await fetchWithTimeout(source.url, fetchImpl);
      if (!response.ok) {
        const reason = `HTTP ${response.status}`;
        warnings.push(`${source.name} (${source.url}) skipped: ${reason}.`);
        sourceResults.push({ name: source.name, url: source.url, status: "failed", reason });
        continue;
      }

      const html = await response.text();
      const text = cleanHtmlToText(html);

      if (isEmptyOrBoilerplateText(text)) {
        const reason = "page had no meaningful content";
        warnings.push(`${source.name} (${source.url}) skipped: ${reason}.`);
        sourceResults.push({ name: source.name, url: source.url, status: "skipped-empty", reason });
        continue;
      }

      const newDocument: NewKnowledgeDocument = {
        domain: "booking",
        sourceName: source.name,
        sourceType: source.type,
        url: source.url,
        title: extractHtmlTitle(html) ?? undefined,
        text,
        fetchedAt: now.toISOString()
      };

      const document = await options.documentStore.save(newDocument);
      documentsCreated += 1;

      const chunks = buildKnowledgeChunks(document);
      const savedChunks = await embedChunks(chunks, options.chunkStore, options.embeddingProvider);
      chunksCreated += savedChunks.length;

      sourceResults.push({
        name: source.name,
        url: source.url,
        status: "ingested",
        documentId: document.id,
        chunksCreated: savedChunks.length
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
    warnings,
    sourceResults,
    generatedAt: now.toISOString()
  };

  warnLog("booking", [
    "Booking RAG ingestion:",
    `- sources attempted: ${summary.sourcesAttempted}`,
    `- documents created/updated: ${summary.documentsCreated}`,
    `- chunks created/updated: ${summary.chunksCreated}`,
    `- warnings: ${summary.warnings.length}`
  ].join("\n"));

  return summary;
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
