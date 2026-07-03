import { describe, expect, it } from "vitest";
import { AI_PIPELINE_VERSION, createAiRunMetadata } from "../src/ai/metadata/aiRunMetadata.js";

describe("createAiRunMetadata", () => {
  it("builds run metadata with a generated timestamp and preserves the given fields", () => {
    const before = Date.now();
    const metadata = createAiRunMetadata({
      domain: "booking",
      model: "gpt-4.1-mini",
      embeddingModel: "text-embedding-3-small",
      promptVersion: "booking-rag-v1",
      pipelineVersion: AI_PIPELINE_VERSION,
      retrievalQuery: "pop punk venues Lyon",
      retrievedChunkCount: 3,
      sourcesUsed: ["https://le-sonic.example.com/programming"],
      warnings: ["Only 3 context source(s) were found for this search."]
    });
    const after = Date.now();

    expect(metadata).toMatchObject({
      domain: "booking",
      model: "gpt-4.1-mini",
      embeddingModel: "text-embedding-3-small",
      promptVersion: "booking-rag-v1",
      pipelineVersion: AI_PIPELINE_VERSION,
      retrievalQuery: "pop punk venues Lyon",
      retrievedChunkCount: 3,
      sourcesUsed: ["https://le-sonic.example.com/programming"],
      warnings: ["Only 3 context source(s) were found for this search."]
    });

    const generatedAtMs = new Date(metadata.generatedAt).getTime();
    expect(generatedAtMs).toBeGreaterThanOrEqual(before);
    expect(generatedAtMs).toBeLessThanOrEqual(after);
  });

  it("does not require optional retrieval fields", () => {
    const metadata = createAiRunMetadata({
      domain: "similar-artists",
      model: "gpt-4.1-mini",
      promptVersion: "similar-artists-rag-v1",
      pipelineVersion: AI_PIPELINE_VERSION,
      sourcesUsed: [],
      warnings: []
    });

    expect(metadata.embeddingModel).toBeUndefined();
    expect(metadata.retrievalQuery).toBeUndefined();
    expect(metadata.retrievedChunkCount).toBeUndefined();
  });

  it("never includes prompt content, API keys or other secret-shaped fields", () => {
    const metadata = createAiRunMetadata({
      domain: "booking",
      model: "gpt-4.1-mini",
      promptVersion: "booking-rag-v1",
      pipelineVersion: AI_PIPELINE_VERSION,
      sourcesUsed: [],
      warnings: []
    });

    expect(Object.keys(metadata).sort()).toEqual(
      [
        "domain",
        "model",
        "promptVersion",
        "pipelineVersion",
        "sourcesUsed",
        "warnings",
        "generatedAt"
      ].sort()
    );
  });
});
