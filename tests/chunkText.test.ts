import { describe, expect, it } from "vitest";
import { buildChunkId, buildKnowledgeChunks, chunkText } from "../src/knowledge/chunkText.js";
import type { KnowledgeDocument } from "../src/knowledge/knowledgeDocument.schema.js";

const document: KnowledgeDocument = {
  id: "doc-1",
  domain: "booking",
  sourceName: "Le Sonic",
  sourceType: "venue",
  url: "https://le-sonic.example.com",
  text: "Le Sonic is a concert venue in Lyon booking metalcore and hardcore acts.",
  fetchedAt: "2026-06-01T10:00:00.000Z"
};

describe("chunkText", () => {
  it("returns a single chunk when text fits within the chunk size", () => {
    const chunks = chunkText("hello world", { chunkSize: 10, chunkOverlap: 2 });
    expect(chunks).toEqual(["hello world"]);
  });

  it("returns an empty array for empty text", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits long text into overlapping chunks", () => {
    const words = Array.from({ length: 25 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(words, { chunkSize: 10, chunkOverlap: 3 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].split(" ")).toHaveLength(10);

    const firstChunkWords = chunks[0].split(" ");
    const secondChunkWords = chunks[1].split(" ");
    expect(secondChunkWords.slice(0, 3)).toEqual(firstChunkWords.slice(-3));
  });

  it("covers every word exactly once when overlap is zero", () => {
    const words = Array.from({ length: 12 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(words, { chunkSize: 5, chunkOverlap: 0 });

    expect(chunks.join(" ").split(" ")).toHaveLength(12);
  });

  it("rejects an invalid chunk size", () => {
    expect(() => chunkText("hello", { chunkSize: 0 })).toThrow();
  });

  it("rejects an overlap greater than or equal to the chunk size", () => {
    expect(() => chunkText("hello", { chunkSize: 5, chunkOverlap: 5 })).toThrow();
  });
});

describe("buildChunkId", () => {
  it("is deterministic for the same document, index and content", () => {
    const first = buildChunkId("doc-1", 0, "some chunk text");
    const second = buildChunkId("doc-1", 0, "some chunk text");
    expect(first).toBe(second);
  });

  it("changes when the chunk content changes", () => {
    const original = buildChunkId("doc-1", 0, "some chunk text");
    const changed = buildChunkId("doc-1", 0, "some other chunk text");
    expect(original).not.toBe(changed);
  });

  it("changes when the chunk index changes", () => {
    const first = buildChunkId("doc-1", 0, "some chunk text");
    const second = buildChunkId("doc-1", 1, "some chunk text");
    expect(first).not.toBe(second);
  });
});

describe("buildKnowledgeChunks", () => {
  it("builds chunks carrying document metadata", () => {
    const chunks = buildKnowledgeChunks(document);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      documentId: document.id,
      domain: document.domain,
      sourceName: document.sourceName,
      sourceType: document.sourceType,
      url: document.url,
      text: document.text
    });
    expect(chunks[0].id).toBe(buildChunkId(document.id, 0, document.text));
    expect(chunks[0].embedding).toBeUndefined();
  });

  it("produces the same chunk ids across runs for unchanged text", () => {
    const first = buildKnowledgeChunks(document);
    const second = buildKnowledgeChunks(document);

    expect(second.map((chunk) => chunk.id)).toEqual(first.map((chunk) => chunk.id));
  });
});
