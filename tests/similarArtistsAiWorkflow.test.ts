import { describe, expect, it, vi } from "vitest";
import type { ChunkStore } from "../src/knowledge/chunkStore.js";
import type { EmbeddingProvider } from "../src/knowledge/embeddings.js";
import type { KnowledgeChunk } from "../src/knowledge/knowledgeChunk.schema.js";
import type { KnowledgeChunkFilter } from "../src/knowledge/types.js";
import { runSimilarArtistsAiWorkflow } from "../src/similar-artists/similarArtistsAiWorkflow.js";
import type { SimilarArtistRagSearchInput } from "../src/similar-artists/types.js";

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
    id: "chunk-le-sonic-pop-punk",
    documentId: "doc-le-sonic-pop-punk",
    domain: "similar-artists",
    sourceName: "Le Sonic programming page",
    sourceType: "venue",
    url: "https://le-sonic.example.com/programming",
    text: "Paris Pop Punk Collective plays pop punk and easycore shows around Paris and has co-billed with Tuesday Fall.",
    createdAt: "2026-06-01T10:00:00.000Z",
    embedding: [1, 0],
    ...overrides
  };
}

const searchInput: SimilarArtistRagSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 5,
  candidates: [
    { name: "Paris Pop Punk Collective", genres: ["pop punk"], city: "Paris", country: "France", url: "https://parispoppunk.example.com" }
  ]
};

const stubEmbeddingProvider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

describe("runSimilarArtistsAiWorkflow", () => {
  it("grounds an accepted similar artist in retrieved context and preserves source metadata", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        similarArtists: [
          {
            name: "Paris Pop Punk Collective",
            genres: ["pop punk", "easycore"],
            city: "Paris",
            country: "France",
            similarityScore: 88,
            sizeTier: "small",
            genreCompatibility: "strong",
            geographicRelevance: "local",
            category: "musically_similar",
            reason: "Plays pop punk and easycore shows around Paris and has co-billed with Tuesday Fall.",
            evidence: [
              {
                source: "Le Sonic programming page",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "Paris Pop Punk Collective plays pop punk and easycore shows around Paris."
              }
            ],
            rejectionReason: null
          }
        ]
      })
    );

    const result = await runSimilarArtistsAiWorkflow(searchInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel
    });

    expect(result.similarArtists).toHaveLength(1);
    expect(result.similarArtists[0]).toMatchObject({
      name: "Paris Pop Punk Collective",
      genreCompatibility: "strong",
      sizeTier: "small",
      category: "musically_similar"
    });
    expect(result.similarArtists[0].evidence[0].sourceUrl).toBe("https://le-sonic.example.com/programming");
    expect(result.sourcesUsed).toEqual([
      { sourceName: "Le Sonic programming page", sourceType: "venue", url: "https://le-sonic.example.com/programming" }
    ]);
    expect(result.rejectedCount).toBe(0);
  });

  it("rejects a candidate the model classifies as genre-incompatible", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        similarArtists: [
          {
            name: "Paris Pop Punk Collective",
            genres: [],
            similarityScore: null,
            sizeTier: null,
            genreCompatibility: "reject",
            geographicRelevance: null,
            category: "rejected",
            reason: "No pop punk evidence found; this looks like a generic chanson act.",
            evidence: [],
            rejectionReason: "Not genre-compatible with pop punk."
          }
        ]
      })
    );

    const result = await runSimilarArtistsAiWorkflow(searchInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel
    });

    expect(result.similarArtists).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(result.rejectedCandidates).toEqual([
      { name: "Paris Pop Punk Collective", reason: "Not genre-compatible with pop punk." }
    ]);
  });

  it("downgrades a weak/generic genre match instead of trusting a strong model claim", async () => {
    const chunkStore = new InMemoryChunkStore([
      makeChunk({ text: "Paris Pop Punk Collective mostly plays generic rock and pop covers around Paris." })
    ]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        similarArtists: [
          {
            name: "Paris Pop Punk Collective",
            genres: ["rock", "pop"],
            city: "Paris",
            country: "France",
            similarityScore: 90,
            sizeTier: "small",
            genreCompatibility: "strong",
            geographicRelevance: "local",
            category: "musically_similar",
            reason: "Generic rock and pop covers band based in Paris.",
            evidence: [
              {
                source: "Le Sonic programming page",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "Mostly plays generic metal and pop covers around Paris."
              }
            ],
            rejectionReason: null
          }
        ]
      })
    );

    const result = await runSimilarArtistsAiWorkflow(searchInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel
    });

    expect(result.similarArtists).toHaveLength(1);
    expect(result.similarArtists[0].genreCompatibility).toBe("weak");
    expect(result.similarArtists[0].similarityScore).toBeLessThan(90);
    expect(result.similarArtists[0].category).toBe("scene_adjacent");
    expect(
      result.warnings.some((warning) => warning.includes("downgraded genre compatibility from \"strong\" to \"weak\""))
    ).toBe(true);
  });

  it("rejects a candidate whose cited source is not present in the retrieved context", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        similarArtists: [
          {
            name: "Paris Pop Punk Collective",
            genres: ["pop punk"],
            city: "Paris",
            country: "France",
            similarityScore: 85,
            sizeTier: "small",
            genreCompatibility: "strong",
            geographicRelevance: "local",
            category: "musically_similar",
            reason: "Plays pop punk shows.",
            evidence: [
              {
                source: "Fake blog",
                sourceUrl: "https://fake-blog.example.com",
                snippet: "Pop punk night every Friday."
              }
            ],
            rejectionReason: null
          }
        ]
      })
    );

    const result = await runSimilarArtistsAiWorkflow(searchInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel
    });

    expect(result.similarArtists).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(
      result.warnings.some((warning) => warning.includes("not present in the retrieved context"))
    ).toBe(true);
  });

  it("rejects a model result whose name is not in the given candidate list instead of inventing metadata", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        similarArtists: [
          {
            name: "Invented Artist Not In List",
            genres: ["pop punk"],
            similarityScore: 90,
            sizeTier: "small",
            genreCompatibility: "strong",
            geographicRelevance: "local",
            category: "musically_similar",
            reason: "Fabricated result.",
            evidence: [
              {
                source: "Le Sonic programming page",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "Paris Pop Punk Collective plays pop punk and easycore shows."
              }
            ],
            rejectionReason: null
          }
        ]
      })
    );

    const result = await runSimilarArtistsAiWorkflow(searchInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel
    });

    expect(result.similarArtists).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(
      result.warnings.some((warning) => warning.includes("not present in the given candidate list"))
    ).toBe(true);
  });

  it("returns a warning and no similar artists when no RAG context is retrieved", async () => {
    const chunkStore = new InMemoryChunkStore([]);
    const callModel = vi.fn(async () => JSON.stringify({ similarArtists: [] }));

    const result = await runSimilarArtistsAiWorkflow(searchInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel
    });

    expect(result.similarArtists).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes("No RAG context was found"))).toBe(true);
    expect(callModel).not.toHaveBeenCalled();
  });
});
