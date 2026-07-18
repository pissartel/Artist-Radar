import { describe, expect, it } from "vitest";
import { OrganizationChunkSchema, parseOrganizationChunk } from "../../src/sources/rag/organizationChunk.schema.js";

const validChunk = {
  id: "org-1:https://booker.example.com-0-abcdef1234567890",
  organizationId: "org-1",
  organizationName: "Le Sonic Booking",
  opportunityType: "BOOKER" as const,
  country: "France",
  city: "Lyon",
  genres: ["metalcore", "hardcore"],
  sourceDomain: "booker.example.com",
  sourceUrl: "https://booker.example.com/about",
  lastVerifiedAt: "2026-07-17T00:00:00.000Z",
  confidenceScore: 0.8,
  text: "Le Sonic Booking represents metalcore and hardcore acts across France.",
  embedding: [0.1, 0.2, 0.3],
  createdAt: "2026-07-17T00:00:00.000Z"
};

describe("OrganizationChunkSchema", () => {
  it("validates a well-formed organization chunk", () => {
    expect(parseOrganizationChunk(validChunk)).toEqual(validChunk);
  });

  it("accepts a chunk without an embedding", () => {
    const { embedding: _embedding, ...withoutEmbedding } = validChunk;
    const parsed = parseOrganizationChunk(withoutEmbedding);
    expect(parsed.embedding).toBeUndefined();
  });

  it("accepts null city and country to represent uncertainty", () => {
    const parsed = parseOrganizationChunk({ ...validChunk, city: null, country: null });
    expect(parsed.city).toBeNull();
    expect(parsed.country).toBeNull();
  });

  it("rejects an invalid opportunityType", () => {
    expect(() => parseOrganizationChunk({ ...validChunk, opportunityType: "UNKNOWN" })).toThrow();
  });

  it("rejects a non-URL sourceUrl", () => {
    expect(() => parseOrganizationChunk({ ...validChunk, sourceUrl: "not-a-url" })).toThrow();
  });

  it("rejects a confidenceScore outside [0, 1]", () => {
    expect(() => parseOrganizationChunk({ ...validChunk, confidenceScore: 1.5 })).toThrow();
  });

  it("rejects an empty text field", () => {
    expect(() => parseOrganizationChunk({ ...validChunk, text: "" })).toThrow();
  });

  it("rejects a missing required field", () => {
    const { sourceUrl: _sourceUrl, ...missingSourceUrl } = validChunk;
    const result = OrganizationChunkSchema.safeParse(missingSourceUrl);
    expect(result.success).toBe(false);
  });
});
