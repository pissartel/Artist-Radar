import { describe, expect, it, vi } from "vitest";
import type { ChunkStore } from "../src/knowledge/chunkStore.js";
import type { EmbeddingProvider } from "../src/knowledge/embeddings.js";
import type { KnowledgeChunk } from "../src/knowledge/knowledgeChunk.schema.js";
import type { KnowledgeChunkFilter } from "../src/knowledge/types.js";
import { runBookingAiWorkflow } from "../src/booking/bookingAiWorkflow.js";
import type { BookingSearchInput } from "../src/booking/types.js";

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
    id: "chunk-le-sonic",
    documentId: "doc-le-sonic",
    domain: "booking",
    sourceName: "Le Sonic",
    sourceType: "venue",
    url: "https://le-sonic.example.com/programming",
    text: "Le Sonic books pop punk and easycore nights year-round in Lyon.",
    createdAt: "2026-06-01T10:00:00.000Z",
    embedding: [1, 0],
    ...overrides
  };
}

const bookingInput: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Lyon",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 5
};

const stubEmbeddingProvider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };

describe("runBookingAiWorkflow", () => {
  it("grounds accepted opportunities in retrieved context and preserves source metadata", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        opportunities: [
          {
            name: "Le Sonic",
            type: "venue",
            city: "Lyon",
            relevanceScore: 88,
            genreCompatibility: 90,
            reason: "Books pop punk and easycore nights year-round.",
            evidence: [
              {
                source: "Le Sonic",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "Le Sonic books pop punk and easycore nights year-round in Lyon."
              }
            ],
            contact: null,
            risks: []
          }
        ]
      })
    );

    const result = await runBookingAiWorkflow(bookingInput, { chunkStore, embeddingProvider: stubEmbeddingProvider, callModel });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({ name: "Le Sonic", confidence: "high" });
    expect(result.opportunities[0].evidence[0].sourceUrl).toBe("https://le-sonic.example.com/programming");
    expect(result.sourcesUsed).toEqual([
      { sourceName: "Le Sonic", sourceType: "venue", url: "https://le-sonic.example.com/programming" }
    ]);
    expect(result.rejectedCount).toBe(0);

    const [opportunity] = result.opportunities;
    expect(opportunity.deterministicScore).toBeGreaterThan(0);
    expect(opportunity.deterministicScore).toBeLessThanOrEqual(100);
    expect(Object.keys(opportunity.scoreBreakdown).sort()).toEqual(
      [
        "artistSizeFitScore",
        "contactabilityScore",
        "evidenceQualityScore",
        "genreCompatibilityScore",
        "locationScore",
        "recencyScore",
        "sourceConfidenceScore"
      ].sort()
    );
    expect(opportunity.scoreExplanation).toContain("Deterministic relevance score");
    expect(opportunity.judgeVerdict).toBeNull();
    expect(result.aiJudgeEnabled).toBe(false);

    expect(result.metadata).toMatchObject({
      domain: "booking",
      model: "gpt-4.1-mini",
      promptVersion: "booking-rag-v1",
      retrievedChunkCount: 1,
      sourcesUsed: ["https://le-sonic.example.com/programming"]
    });
    expect(result.metadata.generatedAt).toBe(result.generatedAt);
  });

  it("attaches an AI judge verdict to the matching opportunity when the judge is enabled", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        opportunities: [
          {
            name: "Le Sonic",
            type: "venue",
            city: "Lyon",
            relevanceScore: 88,
            genreCompatibility: 90,
            reason: "Books pop punk and easycore nights year-round.",
            evidence: [
              {
                source: "Le Sonic",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "Le Sonic books pop punk and easycore nights year-round in Lyon."
              }
            ],
            contact: null,
            risks: []
          }
        ]
      })
    );
    const judgeCallModel = vi.fn(async () =>
      JSON.stringify({
        verdicts: [
          {
            itemName: "Le Sonic",
            relevance: "high",
            realism: "realistic",
            missingEvidence: [],
            risks: [],
            recommendedNextAction: "Reach out with a press kit.",
            explanation: "Consistent with the deterministic score."
          }
        ]
      })
    );

    const result = await runBookingAiWorkflow(bookingInput, {
      chunkStore,
      embeddingProvider: stubEmbeddingProvider,
      callModel,
      aiJudge: { enabled: true, callModel: judgeCallModel }
    });

    expect(result.aiJudgeEnabled).toBe(true);
    expect(judgeCallModel).toHaveBeenCalledTimes(1);
    expect(result.opportunities[0].judgeVerdict).toMatchObject({ relevance: "high", realism: "realistic" });
  });

  it("rejects an opportunity whose cited source is not present in the retrieved context", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        opportunities: [
          {
            name: "Fake Venue",
            type: "venue",
            city: "Lyon",
            relevanceScore: 80,
            genreCompatibility: 80,
            reason: "Books pop punk shows regularly.",
            evidence: [
              {
                source: "Fake Venue website",
                sourceUrl: "https://fake-venue.example.com",
                snippet: "Pop punk night every Friday."
              }
            ],
            contact: null,
            risks: []
          }
        ]
      })
    );

    const result = await runBookingAiWorkflow(bookingInput, { chunkStore, embeddingProvider: stubEmbeddingProvider, callModel });

    expect(result.opportunities).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("Fake Venue") && warning.includes("not present in the retrieved context"))).toBe(
      true
    );
  });

  it("rejects generic rock/pop opportunities for a pop punk search", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        opportunities: [
          {
            name: "Generic Rock Bar",
            type: "bar",
            city: "Lyon",
            relevanceScore: 70,
            genreCompatibility: 60,
            reason: "This venue mostly books alternative rock and mainstream pop acts; no genre-specific evidence available.",
            evidence: [
              {
                source: "Le Sonic",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "General concert programming, mostly mainstream rock and pop acts."
              }
            ],
            contact: null,
            risks: []
          }
        ]
      })
    );

    const result = await runBookingAiWorkflow(bookingInput, { chunkStore, embeddingProvider: stubEmbeddingProvider, callModel });

    expect(result.opportunities).toHaveLength(0);
    expect(result.rejectedCount).toBe(1);
    expect(
      result.warnings.some((warning) => warning.includes("Generic Rock Bar") && warning.includes("not genre-compatible"))
    ).toBe(true);
  });

  it("returns a warning and no opportunities when no RAG context is retrieved", async () => {
    const chunkStore = new InMemoryChunkStore([]);
    const callModel = vi.fn(async () => JSON.stringify({ opportunities: [] }));

    const result = await runBookingAiWorkflow(bookingInput, { chunkStore, embeddingProvider: stubEmbeddingProvider, callModel });

    expect(result.opportunities).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes("No RAG context was found"))).toBe(true);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("clears an unverifiable contact instead of inventing one", async () => {
    const chunkStore = new InMemoryChunkStore([makeChunk({})]);
    const callModel = vi.fn(async () =>
      JSON.stringify({
        opportunities: [
          {
            name: "Le Sonic",
            type: "venue",
            city: "Lyon",
            relevanceScore: 85,
            genreCompatibility: 90,
            reason: "Books pop punk and easycore nights year-round.",
            evidence: [
              {
                source: "Le Sonic",
                sourceUrl: "https://le-sonic.example.com/programming",
                snippet: "Le Sonic books pop punk and easycore nights year-round in Lyon."
              }
            ],
            contact: "booking@invented-not-in-context.com",
            risks: []
          }
        ]
      })
    );

    const result = await runBookingAiWorkflow(bookingInput, { chunkStore, embeddingProvider: stubEmbeddingProvider, callModel });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0].contact).toBeNull();
    expect(result.warnings.some((warning) => warning.includes("cleared to null"))).toBe(true);
  });
});
