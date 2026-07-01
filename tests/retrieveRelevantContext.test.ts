import { describe, expect, it, vi } from "vitest";
import type { ChunkStore } from "../src/knowledge/chunkStore.js";
import type { EmbeddingProvider } from "../src/knowledge/embeddings.js";
import type { KnowledgeChunk } from "../src/knowledge/knowledgeChunk.schema.js";
import { retrieveRelevantContext } from "../src/knowledge/retrieveRelevantContext.js";
import type { KnowledgeChunkFilter } from "../src/knowledge/types.js";

class InMemoryChunkStore implements ChunkStore {
  constructor(private readonly chunks: KnowledgeChunk[]) {}

  async save(chunk: KnowledgeChunk): Promise<KnowledgeChunk> {
    this.chunks.push(chunk);
    return chunk;
  }

  async saveMany(chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
    this.chunks.push(...chunks);
    return chunks;
  }

  async list(filter: KnowledgeChunkFilter = {}): Promise<KnowledgeChunk[]> {
    return this.chunks.filter((chunk) => {
      if (filter.domain && chunk.domain !== filter.domain) return false;
      if (filter.documentId && chunk.documentId !== filter.documentId) return false;
      return true;
    });
  }

  async findByIds(ids: string[]): Promise<KnowledgeChunk[]> {
    const idSet = new Set(ids);
    return this.chunks.filter((chunk) => idSet.has(chunk.id));
  }
}

function makeChunk(overrides: Partial<KnowledgeChunk>): KnowledgeChunk {
  return {
    id: "chunk-id",
    documentId: "doc-1",
    domain: "booking",
    sourceName: "Le Sonic",
    sourceType: "venue",
    url: "https://le-sonic.example.com",
    text: "some text",
    createdAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

describe("retrieveRelevantContext", () => {
  it("ranks chunks by similarity to the query and applies the limit", async () => {
    const chunks = [
      makeChunk({ id: "low", text: "unrelated content", embedding: [0, 1] }),
      makeChunk({ id: "high", text: "highly relevant content", embedding: [1, 0] }),
      makeChunk({ id: "mid", text: "somewhat relevant content", embedding: [0.7, 0.7] })
    ];
    const store = new InMemoryChunkStore(chunks);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveRelevantContext("relevant query", store, provider, { limit: 2 });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.chunkId)).toEqual(["high", "mid"]);
    expect(results[0].similarityScore).toBeGreaterThan(results[1].similarityScore);
  });

  it("includes source metadata and similarity score in each result", async () => {
    const chunk = makeChunk({ id: "chunk-1", url: "https://example.com/page", embedding: [1, 0] });
    const store = new InMemoryChunkStore([chunk]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const [result] = await retrieveRelevantContext("query", store, provider);

    expect(result).toMatchObject({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      sourceName: chunk.sourceName,
      sourceType: chunk.sourceType,
      url: chunk.url,
      text: chunk.text
    });
    expect(result.similarityScore).toBeCloseTo(1);
  });

  it("filters retrieval by domain", async () => {
    const bookingChunk = makeChunk({ id: "booking-chunk", domain: "booking", embedding: [1, 0] });
    const similarArtistsChunk = makeChunk({
      id: "similar-chunk",
      domain: "similar-artists",
      embedding: [1, 0]
    });
    const store = new InMemoryChunkStore([bookingChunk, similarArtistsChunk]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveRelevantContext("query", store, provider, { domain: "booking" });

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("booking-chunk");
  });

  it("ignores chunks that have not been embedded yet", async () => {
    const embedded = makeChunk({ id: "embedded", embedding: [1, 0] });
    const notEmbedded = makeChunk({ id: "not-embedded" });
    const store = new InMemoryChunkStore([embedded, notEmbedded]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveRelevantContext("query", store, provider);

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("embedded");
  });

  it("returns an empty array when there are no embedded chunks", async () => {
    const store = new InMemoryChunkStore([]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveRelevantContext("query", store, provider);

    expect(results).toEqual([]);
    expect(provider.embed).not.toHaveBeenCalled();
  });
});
