import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runBookingRagIngestion } from "../src/ai/ingestion/bookingIngestionService.js";
import type { BookingRagSeedSource } from "../src/ai/ingestion/bookingRagSeedSources.js";
import type { HeadlessPageFetcher } from "../src/ai/ingestion/headlessPageFetcher.js";
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

function buildFetchImpl(
  routes: Record<string, { status: number; body?: string; headers?: Record<string, string> } | Error>
): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes[url];
    if (route instanceof Error) {
      throw route;
    }
    if (!route) {
      throw new Error(`Unexpected fetch to ${url}`);
    }
    return new Response(route.body ?? "", { status: route.status, headers: route.headers }) as unknown as Response;
  }) as unknown as typeof fetch;
}

function createStubHeadlessFetcher(
  handler: (url: string) => Promise<string>
): HeadlessPageFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetchRenderedHtml(url: string): Promise<string> {
      calls.push(url);
      return handler(url);
    }
  };
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

  it("falls back to the headless fetcher when a source returns a bot-challenge response", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Blocked Source", type: "agenda", url: "https://blocked.example.com" }];
    const fetchImpl = buildFetchImpl({
      "https://blocked.example.com": { status: 403, headers: { "cf-mitigated": "challenge" } }
    });
    const headlessFetcher = createStubHeadlessFetcher(async () => REAL_PAGE_HTML);

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl, headlessFetcher });

    expect(headlessFetcher.calls).toEqual(["https://blocked.example.com"]);
    expect(summary.documentsCreated).toBe(1);
    expect(summary.sourcesIngestedViaHeadless).toBe(1);
    expect(summary.warnings).toHaveLength(0);
    expect(summary.sourceResults[0].status).toBe("ingested");
    expect(summary.sourceResults[0].fetchMethod).toBe("headless");
  });

  it("skips the plain fetch and goes straight to headless for sources configured with requiresHeadless", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [
      { name: "Turnstile Source", type: "agenda", url: "https://turnstile.example.com", requiresHeadless: true }
    ];
    const fetchImpl = buildFetchImpl({});
    const headlessFetcher = createStubHeadlessFetcher(async () => REAL_PAGE_HTML);

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl, headlessFetcher });

    expect(headlessFetcher.calls).toEqual(["https://turnstile.example.com"]);
    expect(summary.documentsCreated).toBe(1);
    expect(summary.sourcesIngestedViaHeadless).toBe(1);
    expect(summary.sourceResults[0].fetchMethod).toBe("headless");
  });

  it("reports a warning and skips gracefully when the headless fallback also fails", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Blocked Source", type: "agenda", url: "https://blocked.example.com" }];
    const fetchImpl = buildFetchImpl({ "https://blocked.example.com": { status: 429 } });
    const headlessFetcher = createStubHeadlessFetcher(async () => {
      throw new Error("navigation timeout");
    });

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl, headlessFetcher });

    expect(summary.documentsCreated).toBe(0);
    expect(summary.sourcesIngestedViaHeadless).toBe(0);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toContain("navigation timeout");
    expect(summary.sourceResults[0].status).toBe("failed");
  });

  it("skips requiresHeadless sources gracefully with a clear reason when no headless fetcher is configured", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [
      { name: "Turnstile Source", type: "agenda", url: "https://turnstile.example.com", requiresHeadless: true }
    ];
    const fetchImpl = buildFetchImpl({});

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.documentsCreated).toBe(0);
    expect(summary.sourceResults[0].status).toBe("skipped-empty");
    expect(summary.sourceResults[0].reason).toContain("not available");
  });

  it("does not use the headless fetcher when the plain fetch already succeeds", async () => {
    const { documentStore, chunkStore } = await createStores();
    const embeddingProvider = createFakeEmbeddingProvider();
    const sources: BookingRagSeedSource[] = [{ name: "Le Sonic", type: "venue", url: "https://le-sonic.example.com" }];
    const fetchImpl = buildFetchImpl({ "https://le-sonic.example.com": { status: 200, body: REAL_PAGE_HTML } });
    const headlessFetcher = createStubHeadlessFetcher(async () => REAL_PAGE_HTML);

    const summary = await runBookingRagIngestion({ sources, documentStore, chunkStore, embeddingProvider, fetchImpl, headlessFetcher });

    expect(headlessFetcher.calls).toEqual([]);
    expect(summary.sourceResults[0].fetchMethod).toBe("plain");
  });
});
