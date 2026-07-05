import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBookingRagIngestion } from "../src/ai/ingestion/bookingIngestionService.js";
import type { BookingRagSeedSource } from "../src/ai/ingestion/bookingRagSeedSources.js";
import type { EmbeddingProvider } from "../src/knowledge/embeddings.js";
import { LocalChunkStore } from "../src/knowledge/localChunkStore.js";
import { LocalDocumentStore } from "../src/knowledge/localDocumentStore.js";

const cleanupDirs: string[] = [];

async function createStores(): Promise<{ documentStore: LocalDocumentStore; chunkStore: LocalChunkStore }> {
  const dir = await mkdtemp(path.join(tmpdir(), "booking-ingestion-"));
  cleanupDirs.push(dir);
  return {
    documentStore: new LocalDocumentStore(path.join(dir, "documents.json")),
    chunkStore: new LocalChunkStore(path.join(dir, "chunks.json"))
  };
}

function createFakeEmbeddingProvider(): EmbeddingProvider & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts: string[]): Promise<number[][]> {
      calls.push(texts);
      return texts.map((text) => [text.length % 7, text.length % 5, text.length % 3]);
    }
  };
}

const REAL_PAGE_HTML = `
  <html>
    <head><title>Le Sonic - Venue</title></head>
    <body>
      <h1>Le Sonic</h1>
      <p>Le Sonic is a concert venue in Lyon that regularly books metalcore, hardcore, and punk rock acts.
      Upcoming shows include several touring bands across multiple genres, with a strong focus on emerging
      artists from the regional scene. Doors open at 7pm most weeknights.</p>
      <p>${"Le Sonic also hosts festival showcases and local support slots throughout the year. ".repeat(10)}</p>
    </body>
  </html>
`;

const EMPTY_PAGE_HTML = "<html><body><p>Cookies accepted.</p></body></html>";

function buildFetchImpl(routes: Record<string, { status: number; body?: string } | Error>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes[url];
    if (route instanceof Error) {
      throw route;
    }
    if (!route) {
      throw new Error(`Unexpected fetch to ${url}`);
    }
    return new Response(route.body ?? "", { status: route.status }) as unknown as Response;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  cleanupDirs.length = 0;
  vi.restoreAllMocks();
});

describe("runBookingRagIngestion", () => {
  it("ingests a real page into the document and chunk stores", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Le Sonic", type: "venue", url: "https://le-sonic.example.com" }];
    const fetchImpl = buildFetchImpl({ "https://le-sonic.example.com": { status: 200, body: REAL_PAGE_HTML } });

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });

    expect(summary.sourcesAttempted).toBe(1);
    expect(summary.documentsCreated).toBe(1);
    expect(summary.chunksCreated).toBeGreaterThan(0);
    expect(summary.warnings).toHaveLength(0);
    expect(summary.sourceResults[0].status).toBe("ingested");

    const documents = await documentStore.list();
    expect(documents).toHaveLength(1);
    expect(documents[0].title).toBe("Le Sonic - Venue");

    const chunks = await chunkStore.list();
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.embedding).toBeDefined();
    }
  });

  it("reports a warning and skips a source on HTTP failure without failing the whole run", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [
      { name: "Broken Source", type: "agenda", url: "https://broken.example.com" },
      { name: "Le Sonic", type: "venue", url: "https://le-sonic.example.com" }
    ];
    const fetchImpl = buildFetchImpl({
      "https://broken.example.com": { status: 500 },
      "https://le-sonic.example.com": { status: 200, body: REAL_PAGE_HTML }
    });

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });

    expect(summary.documentsCreated).toBe(1);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toContain("Broken Source");
    expect(summary.sourceResults[0].status).toBe("failed");
    expect(summary.sourceResults[1].status).toBe("ingested");
  });

  it("reports a warning and skips a source that throws a network error", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Timeout Source", type: "agenda", url: "https://timeout.example.com" }];
    const fetchImpl = buildFetchImpl({ "https://timeout.example.com": new Error("network error") });

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });

    expect(summary.documentsCreated).toBe(0);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toContain("network error");
    expect(summary.sourceResults[0].status).toBe("failed");
  });

  it("skips empty or boilerplate-only pages and reports a warning", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Empty Source", type: "agenda", url: "https://empty.example.com" }];
    const fetchImpl = buildFetchImpl({ "https://empty.example.com": { status: 200, body: EMPTY_PAGE_HTML } });

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });

    expect(summary.documentsCreated).toBe(0);
    expect(summary.chunksCreated).toBe(0);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.sourceResults[0].status).toBe("skipped-empty");
    expect(await documentStore.list()).toHaveLength(0);
  });

  it("deduplicates documents by url and reuses embeddings for unchanged chunks on re-ingestion", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Le Sonic", type: "venue", url: "https://le-sonic.example.com" }];
    const fetchImpl = buildFetchImpl({ "https://le-sonic.example.com": { status: 200, body: REAL_PAGE_HTML } });

    await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });
    const firstEmbedCallCount = embeddingProvider.calls.length;

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });

    const documents = await documentStore.list();
    expect(documents).toHaveLength(1);
    expect(summary.documentsCreated).toBe(1);

    const chunks = await chunkStore.list();
    expect(chunks.length).toBe(summary.chunksCreated);

    expect(embeddingProvider.calls.length).toBe(firstEmbedCallCount);
  });
});
