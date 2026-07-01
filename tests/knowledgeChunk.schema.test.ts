import { describe, expect, it } from "vitest";
import { KnowledgeChunkSchema, parseKnowledgeChunk } from "../src/knowledge/knowledgeChunk.schema.js";

const validChunk = {
  id: "doc-1-0-abcdef1234567890",
  documentId: "doc-1",
  domain: "booking",
  sourceName: "Le Sonic",
  sourceType: "venue",
  url: "https://le-sonic.example.com",
  text: "Le Sonic is a concert venue in Lyon booking metalcore and hardcore acts.",
  embedding: [0.1, 0.2, 0.3],
  createdAt: "2026-06-01T10:00:00.000Z"
};

describe("KnowledgeChunkSchema", () => {
  it("validates a well-formed knowledge chunk", () => {
    expect(parseKnowledgeChunk(validChunk)).toEqual(validChunk);
  });

  it("accepts a chunk without an embedding", () => {
    const { embedding: _embedding, ...withoutEmbedding } = validChunk;
    const parsed = parseKnowledgeChunk(withoutEmbedding);
    expect(parsed.embedding).toBeUndefined();
  });

  it("rejects an invalid domain", () => {
    expect(() => parseKnowledgeChunk({ ...validChunk, domain: "unknown-domain" })).toThrow();
  });

  it("rejects a non-URL value for url", () => {
    expect(() => parseKnowledgeChunk({ ...validChunk, url: "not-a-url" })).toThrow();
  });

  it("rejects an empty text field", () => {
    expect(() => parseKnowledgeChunk({ ...validChunk, text: "" })).toThrow();
  });

  it("rejects a missing required field", () => {
    const { documentId: _documentId, ...missingDocumentId } = validChunk;
    const result = KnowledgeChunkSchema.safeParse(missingDocumentId);
    expect(result.success).toBe(false);
  });
});
