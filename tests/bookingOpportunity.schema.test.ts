import { describe, expect, it } from "vitest";
import { AiBookingOpportunitySchema } from "../src/ai/schemas/bookingOpportunity.schema.js";

const validOpportunity = {
  name: "Le Sonic",
  type: "venue",
  city: "Lyon",
  relevanceScore: 78,
  genreCompatibility: 85,
  reason: "Books metalcore and hardcore acts matching the artist's genre.",
  evidence: [
    {
      source: "Le Sonic official programming page",
      sourceUrl: "https://le-sonic.example.com/programming",
      snippet: "Upcoming metalcore night on July 12."
    }
  ],
  contact: "booking@le-sonic.example.com",
  risks: ["No confirmed open date within the next 3 months"]
};

describe("AiBookingOpportunitySchema", () => {
  it("validates a well-formed booking opportunity", () => {
    const result = AiBookingOpportunitySchema.safeParse(validOpportunity);
    expect(result.success).toBe(true);
  });

  it("accepts null city and contact", () => {
    const result = AiBookingOpportunitySchema.safeParse({
      ...validOpportunity,
      city: null,
      contact: null
    });
    expect(result.success).toBe(true);
  });

  it("defaults risks to an empty array when omitted", () => {
    const { risks: _risks, ...withoutRisks } = validOpportunity;
    const result = AiBookingOpportunitySchema.safeParse(withoutRisks);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.risks).toEqual([]);
    }
  });

  it("rejects an opportunity with no evidence", () => {
    const result = AiBookingOpportunitySchema.safeParse({ ...validOpportunity, evidence: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an opportunity missing the evidence field entirely", () => {
    const { evidence: _evidence, ...missingEvidence } = validOpportunity;
    const result = AiBookingOpportunitySchema.safeParse(missingEvidence);
    expect(result.success).toBe(false);
  });

  it("rejects a relevanceScore out of range", () => {
    const result = AiBookingOpportunitySchema.safeParse({ ...validOpportunity, relevanceScore: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing reason", () => {
    const { reason: _reason, ...missingReason } = validOpportunity;
    const result = AiBookingOpportunitySchema.safeParse(missingReason);
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = AiBookingOpportunitySchema.safeParse({ ...validOpportunity, name: "" });
    expect(result.success).toBe(false);
  });
});
