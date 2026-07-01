import { describe, expect, it } from "vitest";
import { KnowledgeDocumentSchema, parseKnowledgeDocument } from "../src/knowledge/knowledgeDocument.schema.js";

const validDocument = {
  id: "doc-1",
  domain: "booking",
  sourceName: "Le Sonic",
  sourceType: "venue",
  url: "https://le-sonic.example.com",
  title: "Le Sonic venue page",
  text: "Le Sonic is a concert venue in Lyon booking metalcore and hardcore acts.",
  city: "Lyon",
  country: "France",
  genres: ["metalcore", "hardcore"],
  fetchedAt: "2026-06-01T10:00:00.000Z"
};

describe("KnowledgeDocumentSchema", () => {
  it("validates a well-formed knowledge document", () => {
    const parsed = parseKnowledgeDocument(validDocument);
    expect(parsed).toEqual(validDocument);
  });

  it("accepts documents without optional metadata", () => {
    const minimal = {
      id: "doc-2",
      domain: "similar-artists",
      sourceName: "Blog Example",
      sourceType: "blog",
      url: "https://blog.example.com/post",
      text: "Some article text about similar artists.",
      fetchedAt: "2026-06-01T10:00:00.000Z"
    };

    const parsed = parseKnowledgeDocument(minimal);
    expect(parsed.city).toBeUndefined();
    expect(parsed.genres).toBeUndefined();
  });

  it("rejects an invalid domain", () => {
    expect(() => parseKnowledgeDocument({ ...validDocument, domain: "unknown-domain" })).toThrow();
  });

  it("rejects an invalid source type", () => {
    expect(() => parseKnowledgeDocument({ ...validDocument, sourceType: "not-a-source" })).toThrow();
  });

  it("rejects a non-URL value for url", () => {
    expect(() => parseKnowledgeDocument({ ...validDocument, url: "not-a-url" })).toThrow();
  });

  it("rejects an empty text field", () => {
    expect(() => parseKnowledgeDocument({ ...validDocument, text: "" })).toThrow();
  });

  it("rejects a missing required field", () => {
    const { sourceName: _sourceName, ...missingSourceName } = validDocument;
    const result = KnowledgeDocumentSchema.safeParse(missingSourceName);
    expect(result.success).toBe(false);
  });
});
