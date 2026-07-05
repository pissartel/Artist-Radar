import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runBookingRagIngestion } from "../src/ai/ingestion/bookingIngestionService.js";
import { createHeadlessPageFetcherIfAvailable } from "../src/ai/ingestion/headlessPageFetcher.js";
import { OpenAIEmbeddingProvider } from "../src/knowledge/embeddings.js";
import { LocalChunkStore } from "../src/knowledge/localChunkStore.js";
import { LocalDocumentStore } from "../src/knowledge/localDocumentStore.js";

const DEBUG_REPORT_PATH = path.join("outputs", "debug", "rag-ingestion-booking.json");

async function main(): Promise<void> {
  if (process.env.ENABLE_RAG_INGESTION !== "true") {
    console.log("Booking RAG ingestion is disabled. Set ENABLE_RAG_INGESTION=true to run it.");
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required to generate embeddings for booking RAG ingestion.");
    process.exitCode = 1;
    return;
  }

  const headlessFetcher =
    process.env.ENABLE_HEADLESS_FALLBACK === "true" ? await createHeadlessPageFetcherIfAvailable() : undefined;

  const summary = await runBookingRagIngestion({
    documentStore: new LocalDocumentStore(),
    chunkStore: new LocalChunkStore(),
    embeddingProvider: new OpenAIEmbeddingProvider(),
    headlessFetcher: headlessFetcher ?? undefined
  });

  await mkdir(path.dirname(DEBUG_REPORT_PATH), { recursive: true });
  await writeFile(DEBUG_REPORT_PATH, JSON.stringify(summary, null, 2), "utf8");

  console.log(
    `Booking RAG ingestion complete: ${summary.documentsCreated} document(s), ${summary.chunksCreated} chunk(s) ` +
      `(${summary.sourcesIngestedViaHeadless} via headless fallback).`
  );
  if (summary.warnings.length > 0) {
    console.warn(`Warnings (${summary.warnings.length}):`);
    for (const warning of summary.warnings) {
      console.warn(`- ${warning}`);
    }
  }
  console.log(`Debug report: ${DEBUG_REPORT_PATH}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Booking RAG ingestion failed: ${message}`);
  process.exitCode = 1;
});
