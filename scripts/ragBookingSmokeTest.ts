import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import slugify from "slugify";
import { runBookingAiWorkflow } from "../src/booking/bookingAiWorkflow.js";
import type { BookingSearchInput } from "../src/booking/types.js";
import { OpenAIEmbeddingProvider } from "../src/knowledge/embeddings.js";
import { LocalChunkStore } from "../src/knowledge/localChunkStore.js";
import { LocalDocumentStore } from "../src/knowledge/localDocumentStore.js";
import { retrieveRelevantContext } from "../src/knowledge/retrieveRelevantContext.js";

/**
 * Live end-to-end smoke test for the booking RAG pipeline (issue #66):
 * real local chunk store, real embeddings, real retrieval, real OpenAI call.
 * Gated behind ENABLE_LIVE_EVALS=true so it never runs in default CI.
 */

const REPORT_OUTPUT_DIR = path.join("outputs", "evals", "live");

interface SmokeTestOptions {
  artist: string;
  genre: string;
  city: string;
  target?: string;
}

class SmokeTestFailure extends Error {}

async function main(): Promise<void> {
  if (process.env.ENABLE_LIVE_EVALS !== "true") {
    console.log("Live RAG smoke test is disabled. Set ENABLE_LIVE_EVALS=true to run it (never enabled in default CI).");
    return;
  }

  const program = new Command();
  program
    .requiredOption("--artist <artist>", "artist name")
    .requiredOption("--genre <genre>", "artist genre")
    .requiredOption("--city <city>", "artist city")
    .option("--target <target>", "target region or country");
  program.parse(process.argv);
  const options = program.opts<SmokeTestOptions>();

  console.log("RAG booking smoke test\n");
  console.log("Input:");
  console.log(`- Artist: ${options.artist}`);
  console.log(`- Genre: ${options.genre}`);
  console.log(`- City: ${options.city}`);
  console.log(`- Target: ${options.target ?? "(none)"}`);
  console.log();

  if (!process.env.OPENAI_API_KEY) {
    throw new SmokeTestFailure(
      "OPENAI_API_KEY is missing. Add it to .env or export it in your shell before running the live RAG smoke test."
    );
  }

  const documentStore = new LocalDocumentStore();
  const chunkStore = new LocalChunkStore();
  const embeddingProvider = new OpenAIEmbeddingProvider();

  const documents = await documentStore.list({ domain: "booking" });
  if (documents.length === 0) {
    throw new SmokeTestFailure(
      "No documents were ingested for the booking domain. Run `ENABLE_RAG_INGESTION=true npm run rag:ingest:booking` first."
    );
  }

  const chunks = await chunkStore.list({ domain: "booking" });
  if (chunks.length === 0) {
    throw new SmokeTestFailure(
      "No chunks were found for the booking domain. Run `ENABLE_RAG_INGESTION=true npm run rag:ingest:booking` first."
    );
  }

  const smokeQuery = [options.artist, options.genre, options.city, options.target].filter(Boolean).join(" ");
  const retrieved = await retrieveRelevantContext(smokeQuery, chunkStore, embeddingProvider, { domain: "booking" });
  if (retrieved.length === 0) {
    throw new SmokeTestFailure(
      `Retrieval returned zero relevant chunks for query "${smokeQuery}". Try a broader --genre/--city/--target, or ingest more sources.`
    );
  }

  console.log("Store:");
  console.log(`- Documents: ${documents.length}`);
  console.log(`- Chunks: ${chunks.length}`);
  console.log(`- Retrieved chunks: ${retrieved.length}`);
  console.log();

  const bookingInput: BookingSearchInput = {
    artist: options.artist,
    genre: options.genre,
    city: options.city,
    target: options.target ?? null,
    links: [],
    limit: 5
  };

  const result = await runBookingAiWorkflow(bookingInput, { chunkStore, embeddingProvider });
  const outputInvalid = result.warnings.some((warning) => warning.includes("was not valid JSON"));

  console.log("AI:");
  console.log(`- Model: ${result.metadata.model}`);
  console.log(`- Output valid: ${outputInvalid ? "no" : "yes"}`);
  console.log(`- Opportunities: ${result.opportunities.length}`);
  console.log(`- Sources used: ${result.sourcesUsed.length}`);
  console.log(`- Warnings: ${result.warnings.length}`);
  console.log();

  await mkdir(REPORT_OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = slugify(`booking-${options.artist}-${options.genre}`, { lower: true, strict: true });
  const reportPath = path.join(REPORT_OUTPUT_DIR, `${slug}-${timestamp}.json`);

  await writeFile(
    reportPath,
    JSON.stringify(
      {
        input: bookingInput,
        store: { documents: documents.length, chunks: chunks.length, retrievedChunks: retrieved.length },
        outputValid: !outputInvalid,
        result
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Report:");
  console.log(reportPath);
  console.log();

  const passed = !outputInvalid;
  console.log(passed ? "PASS: live RAG smoke test succeeded." : "FAIL: live RAG smoke test produced invalid AI output.");

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof SmokeTestFailure) {
    console.error(`FAIL: ${error.message}`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Live RAG smoke test crashed: ${message}`);
  }
  process.exitCode = 1;
});
