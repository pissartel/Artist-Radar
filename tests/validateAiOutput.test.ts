import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseAndValidateAiJson,
  validateAiOutput,
  validateAiOutputList
} from "../src/ai/validation/validateAiOutput.js";
import { AiBookingOpportunitySchema } from "../src/ai/schemas/bookingOpportunity.schema.js";

const TestSchema = z.object({
  name: z.string().trim().min(1),
  score: z.number().min(0).max(100)
});

const validOpportunity = {
  name: "Le Sonic",
  type: "venue",
  city: "Lyon",
  relevanceScore: 78,
  genreCompatibility: 85,
  reason: "Books matching genres.",
  evidence: [{ source: "official page", sourceUrl: "https://le-sonic.example.com" }],
  contact: null,
  risks: []
};

describe("validateAiOutput", () => {
  it("returns success and parsed data for a valid output", () => {
    const result = validateAiOutput(TestSchema, { name: "Test", score: 50 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Test", score: 50 });
    expect(result.warnings).toEqual([]);
    expect(result.lowConfidence).toBe(false);
  });

  it("returns a clear warning and marks low confidence for an invalid output", () => {
    const result = validateAiOutput(TestSchema, { name: "", score: 500 }, { label: "test output" });
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.lowConfidence).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("test output failed validation");
  });

  it("marks a booking opportunity missing evidence as low confidence", () => {
    const { evidence: _evidence, ...missingEvidence } = validOpportunity;
    const result = validateAiOutput(AiBookingOpportunitySchema, missingEvidence, {
      label: "booking opportunity"
    });
    expect(result.success).toBe(false);
    expect(result.lowConfidence).toBe(true);
  });
});

describe("validateAiOutputList", () => {
  it("keeps only valid items and produces warnings for invalid ones", () => {
    const items = [
      { name: "Valid", score: 10 },
      { name: "", score: 10 },
      { name: "Also valid", score: 20 },
      { name: "Out of range", score: 999 }
    ];

    const result = validateAiOutputList(TestSchema, items, { label: "item" });

    expect(result.valid).toEqual([
      { name: "Valid", score: 10 },
      { name: "Also valid", score: 20 }
    ]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("item #2 rejected");
    expect(result.warnings[1]).toContain("item #4 rejected");
  });

  it("returns no warnings when all items are valid", () => {
    const result = validateAiOutputList(TestSchema, [{ name: "A", score: 1 }]);
    expect(result.warnings).toEqual([]);
    expect(result.valid).toHaveLength(1);
  });
});

describe("parseAndValidateAiJson", () => {
  it("parses and validates well-formed JSON", () => {
    const result = parseAndValidateAiJson(TestSchema, JSON.stringify({ name: "Test", score: 10 }));
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Test", score: 10 });
  });

  it("returns a warning and low confidence for malformed JSON", () => {
    const result = parseAndValidateAiJson(TestSchema, "{not valid json", { label: "AI response" });
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.lowConfidence).toBe(true);
    expect(result.warnings[0]).toContain("AI response was not valid JSON");
  });

  it("returns a warning when JSON is valid but fails schema validation", () => {
    const result = parseAndValidateAiJson(TestSchema, JSON.stringify({ name: "Test", score: 500 }));
    expect(result.success).toBe(false);
    expect(result.lowConfidence).toBe(true);
  });
});
