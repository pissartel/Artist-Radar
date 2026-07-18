import { describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "../../src/knowledge/embeddings.js";
import { embedOrganizationChunks } from "../../src/sources/rag/embedOrganizationChunks.js";
import type { OrganizationChunk } from "../../src/sources/rag/organizationChunk.schema.js";
import type { OrganizationChunkStore } from "../../src/sources/rag/organizationChunkStore.js";
import type { OrganizationChunkFilter } from "../../src/sources/rag/types.js";

class InMemoryOrganizationChunkStore implements OrganizationChunkStore {
  private chunks = new Map<string, OrganizationChunk>();

  async save(chunk: OrganizationChunk): Promise<OrganizationChunk> {
    const [saved] = await this.saveMany([chunk]);
    return saved;
  }

  async saveMany(chunks: OrganizationChunk[]): Promise<OrganizationChunk[]> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
    return chunks;
  }

  async list(_filter: OrganizationChunkFilter = {}): Promise<OrganizationChunk[]> {
    return Array.from(this.chunks.values());
  }

  async findByIds(ids: string[]): Promise<OrganizationChunk[]> {
    return ids.map((id) => this.chunks.get(id)).filter((chunk): chunk is OrganizationChunk => Boolean(chunk));
  }
}

function makeChunk(overrides: Partial<OrganizationChunk> = {}): OrganizationChunk {
  return {
    id: "org-1-0-abc",
    organizationId: "org-1",
    organizationName: "Le Sonic Booking",
    opportunityType: "BOOKER",
    country: "France",
    city: "Lyon",
    genres: [],
    sourceDomain: "booker.example.com",
    sourceUrl: "https://booker.example.com/about",
    lastVerifiedAt: "2026-07-01T00:00:00.000Z",
    confidenceScore: 0.6,
    text: "Le Sonic Booking represents metalcore acts across France.",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function makeFakeProvider(): EmbeddingProvider & { embed: ReturnType<typeof vi.fn> } {
  return {
    embed: vi.fn(async (texts: string[]) => texts.map((text) => [text.length, 1, 0]))
  };
}

describe("embedOrganizationChunks", () => {
  it("embeds chunks that are not yet cached", async () => {
    const store = new InMemoryOrganizationChunkStore();
    const provider = makeFakeProvider();
    const chunk = makeChunk();

    const result = await embedOrganizationChunks([chunk], store, provider);

    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(result[0].embedding).toBeDefined();
    expect(await store.findByIds([chunk.id])).toHaveLength(1);
  });

  it("does not regenerate embeddings for chunks already cached", async () => {
    const store = new InMemoryOrganizationChunkStore();
    const provider = makeFakeProvider();
    const chunk = makeChunk();

    await embedOrganizationChunks([chunk], store, provider);
    provider.embed.mockClear();

    const result = await embedOrganizationChunks([chunk], store, provider);

    expect(provider.embed).not.toHaveBeenCalled();
    expect(result[0].embedding).toBeDefined();
  });

  it("only embeds new chunks when mixed with cached ones", async () => {
    const store = new InMemoryOrganizationChunkStore();
    const provider = makeFakeProvider();
    const cached = makeChunk({ id: "cached-chunk" });
    const fresh = makeChunk({ id: "fresh-chunk", text: "A different chunk of text." });

    await embedOrganizationChunks([cached], store, provider);
    provider.embed.mockClear();

    await embedOrganizationChunks([cached, fresh], store, provider);

    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(provider.embed).toHaveBeenCalledWith([fresh.text]);
  });
});
