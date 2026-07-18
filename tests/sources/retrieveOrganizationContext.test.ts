import { describe, expect, it, vi } from "vitest";
import type { EmbeddingProvider } from "../../src/knowledge/embeddings.js";
import type { OrganizationChunk } from "../../src/sources/rag/organizationChunk.schema.js";
import type { OrganizationChunkStore } from "../../src/sources/rag/organizationChunkStore.js";
import { retrieveOrganizationContext } from "../../src/sources/rag/retrieveOrganizationContext.js";
import type { OrganizationChunkFilter } from "../../src/sources/rag/types.js";

class InMemoryOrganizationChunkStore implements OrganizationChunkStore {
  constructor(private readonly chunks: OrganizationChunk[]) {}

  async save(chunk: OrganizationChunk): Promise<OrganizationChunk> {
    this.chunks.push(chunk);
    return chunk;
  }

  async saveMany(chunks: OrganizationChunk[]): Promise<OrganizationChunk[]> {
    this.chunks.push(...chunks);
    return chunks;
  }

  async list(filter: OrganizationChunkFilter = {}): Promise<OrganizationChunk[]> {
    return this.chunks.filter((chunk) => {
      if (filter.organizationId && chunk.organizationId !== filter.organizationId) return false;
      if (filter.opportunityType && chunk.opportunityType !== filter.opportunityType) return false;
      if (filter.country && chunk.country !== filter.country) return false;
      if (filter.city && chunk.city !== filter.city) return false;
      if (filter.genre && !chunk.genres.includes(filter.genre)) return false;
      if (filter.sourceDomain && chunk.sourceDomain !== filter.sourceDomain) return false;
      if (filter.minConfidenceScore !== undefined && chunk.confidenceScore < filter.minConfidenceScore) return false;
      return true;
    });
  }

  async findByIds(ids: string[]): Promise<OrganizationChunk[]> {
    const idSet = new Set(ids);
    return this.chunks.filter((chunk) => idSet.has(chunk.id));
  }
}

function makeChunk(overrides: Partial<OrganizationChunk> = {}): OrganizationChunk {
  return {
    id: "chunk-id",
    organizationId: "org-1",
    organizationName: "Le Sonic Booking",
    opportunityType: "BOOKER",
    country: "France",
    city: "Lyon",
    genres: ["metalcore"],
    sourceDomain: "booker.example.com",
    sourceUrl: "https://booker.example.com/about",
    lastVerifiedAt: "2026-07-01T00:00:00.000Z",
    confidenceScore: 0.6,
    text: "some text",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

describe("retrieveOrganizationContext", () => {
  it("ranks chunks by similarity to the query and applies the limit", async () => {
    const chunks = [
      makeChunk({ id: "low", text: "unrelated content", embedding: [0, 1] }),
      makeChunk({ id: "high", text: "highly relevant content", embedding: [1, 0] }),
      makeChunk({ id: "mid", text: "somewhat relevant content", embedding: [0.7, 0.7] })
    ];
    const store = new InMemoryOrganizationChunkStore(chunks);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveOrganizationContext("relevant query", store, provider, { limit: 2 });

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.chunkId)).toEqual(["high", "mid"]);
    expect(results[0].similarityScore).toBeGreaterThan(results[1].similarityScore);
  });

  it("includes source citation metadata and similarity score in each result", async () => {
    const chunk = makeChunk({ id: "chunk-1", embedding: [1, 0] });
    const store = new InMemoryOrganizationChunkStore([chunk]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const [result] = await retrieveOrganizationContext("query", store, provider);

    expect(result).toMatchObject({
      chunkId: chunk.id,
      organizationId: chunk.organizationId,
      organizationName: chunk.organizationName,
      sourceUrl: chunk.sourceUrl,
      sourceDomain: chunk.sourceDomain,
      confidenceScore: chunk.confidenceScore,
      lastVerifiedAt: chunk.lastVerifiedAt,
      text: chunk.text
    });
    expect(result.similarityScore).toBeCloseTo(1);
  });

  it("applies structured filters before vector ranking", async () => {
    const bookerChunk = makeChunk({ id: "booker-chunk", opportunityType: "BOOKER", embedding: [1, 0] });
    const venueChunk = makeChunk({
      id: "venue-chunk",
      opportunityType: "VENUE",
      organizationId: "org-2",
      embedding: [1, 0]
    });
    const store = new InMemoryOrganizationChunkStore([bookerChunk, venueChunk]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveOrganizationContext("query", store, provider, {
      filter: { opportunityType: "BOOKER" }
    });

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("booker-chunk");
  });

  it("ignores chunks that have not been embedded yet", async () => {
    const embedded = makeChunk({ id: "embedded", embedding: [1, 0] });
    const notEmbedded = makeChunk({ id: "not-embedded" });
    const store = new InMemoryOrganizationChunkStore([embedded, notEmbedded]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveOrganizationContext("query", store, provider);

    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("embedded");
  });

  it("returns an empty array when there are no embedded chunks matching the filter", async () => {
    const store = new InMemoryOrganizationChunkStore([]);
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

    const results = await retrieveOrganizationContext("query", store, provider);

    expect(results).toEqual([]);
    expect(provider.embed).not.toHaveBeenCalled();
  });
});
