import { describe, expect, it, vi } from "vitest";
import type { ChunkStore } from "../src/knowledge/chunkStore.js";
import { embedChunks, type EmbeddingProvider } from "../src/knowledge/embeddings.js";
import type { KnowledgeChunk } from "../src/knowledge/knowledgeChunk.schema.js";
import type { KnowledgeChunkFilter } from "../src/knowledge/types.js";

class InMemoryChunkStore implements ChunkStore {
  private chunks = new Map<string, KnowledgeChunk>();

  async save(chunk: KnowledgeChunk): Promise<KnowledgeChunk> {
    const [saved] = await this.saveMany([chunk]);
    return saved;
  }

  async saveMany(chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
    return chunks;
  }

  async list(filter: KnowledgeChunkFilter = {}): Promise<KnowledgeChunk[]> {
    return Array.from(this.chunks.values()).filter((chunk) => {
      if (filter.domain && chunk.domain !== filter.domain) return false;
      if (filter.documentId && chunk.documentId !== filter.documentId) return false;
      return true;
    });
  }

  async findByIds(ids: string[]): Promise<KnowledgeChunk[]> {
    return ids.map((id) => this.chunks.get(id)).filter((chunk): chunk is KnowledgeChunk => Boolean(chunk));
  }
}

function makeChunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    id: "doc-1-0-abc",
    documentId: "doc-1",
    domain: "booking",
    sourceName: "Le Sonic",
    sourceType: "venue",
    url: "https://le-sonic.example.com",
    text: "Le Sonic books metalcore and hardcore acts in Lyon.",
    createdAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

function makeFakeProvider(): EmbeddingProvider & { embed: ReturnType<typeof vi.fn> } {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map((text) => [text.length, 1, 0]))
  };
}

describe("embedChunks", () => {
  it("embeds chunks that are not yet cached", async () => {
    const store = new InMemoryChunkStore();
    const provider = makeFakeProvider();
    const chunk = makeChunk();

    const result = await embedChunks([chunk], store, provider);

    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(result[0].embedding).toBeDefined();
    expect(await store.findByIds([chunk.id])).toHaveLength(1);
  });

  it("does not regenerate embeddings for chunks already cached", async () => {
    const store = new InMemoryChunkStore();
    const provider = makeFakeProvider();
    const chunk = makeChunk();

    await embedChunks([chunk], store, provider);
    provider.embed.mockClear();

    const result = await embedChunks([chunk], store, provider);

    expect(provider.embed).not.toHaveBeenCalled();
    expect(result[0].embedding).toBeDefined();
  });

  it("only embeds new chunks when mixed with cached ones", async () => {
    const store = new InMemoryChunkStore();
    const provider = makeFakeProvider();
    const cached = makeChunk({ id: "cached-chunk" });
    const fresh = makeChunk({ id: "fresh-chunk", text: "A different chunk of text." });

    await embedChunks([cached], store, provider);
    provider.embed.mockClear();

    await embedChunks([cached, fresh], store, provider);

    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(provider.embed).toHaveBeenCalledWith([fresh.text]);
  });

  it("regenerates an embedding when the chunk content changes (new deterministic id)", async () => {
    const store = new InMemoryChunkStore();
    const provider = makeFakeProvider();
    const original = makeChunk({ id: "doc-1-0-original", text: "Original text." });

    await embedChunks([original], store, provider);
    provider.embed.mockClear();

    const changed = makeChunk({ id: "doc-1-0-changed", text: "Changed text." });
    await embedChunks([changed], store, provider);

    expect(provider.embed).toHaveBeenCalledTimes(1);
  });
});
