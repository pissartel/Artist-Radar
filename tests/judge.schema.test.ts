import { describe, expect, it } from "vitest";
import { AiJudgeResponseSchema, AiJudgeVerdictSchema } from "../src/ai/schemas/judge.schema.js";

const validVerdict = {
  itemName: "Le Sonic",
  relevance: "high",
  realism: "realistic",
  missingEvidence: ["No confirmed date within the next 3 months"],
  risks: ["Contact is a generic booking form"],
  recommendedNextAction: "Reach out with a press kit referencing the pop punk night.",
  explanation: "Strong genre match and recent, official evidence support the deterministic score."
};

describe("AiJudgeVerdictSchema", () => {
  it("validates a well-formed verdict", () => {
    expect(AiJudgeVerdictSchema.safeParse(validVerdict).success).toBe(true);
  });

  it("defaults missingEvidence and risks to an empty array when omitted", () => {
    const { missingEvidence: _missingEvidence, risks: _risks, ...withoutLists } = validVerdict;
    const result = AiJudgeVerdictSchema.safeParse(withoutLists);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.missingEvidence).toEqual([]);
      expect(result.data.risks).toEqual([]);
    }
  });

  it("rejects an invalid relevance value", () => {
    const result = AiJudgeVerdictSchema.safeParse({ ...validVerdict, relevance: "extreme" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid realism value", () => {
    const result = AiJudgeVerdictSchema.safeParse({ ...validVerdict, realism: "definitely" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing recommendedNextAction", () => {
    const { recommendedNextAction: _recommendedNextAction, ...withoutAction } = validVerdict;
    const result = AiJudgeVerdictSchema.safeParse(withoutAction);
    expect(result.success).toBe(false);
  });

  it("does not require or accept a numeric score field (the judge never scores)", () => {
    const result = AiJudgeVerdictSchema.safeParse({ ...validVerdict, score: 90 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).score).toBeUndefined();
    }
  });
});

describe("AiJudgeResponseSchema", () => {
  it("validates a response with multiple verdicts", () => {
    const result = AiJudgeResponseSchema.safeParse({ verdicts: [validVerdict, { ...validVerdict, itemName: "Another Venue" }] });
    expect(result.success).toBe(true);
  });

  it("validates an empty verdicts array", () => {
    expect(AiJudgeResponseSchema.safeParse({ verdicts: [] }).success).toBe(true);
  });

  it("rejects a response missing the verdicts field", () => {
    expect(AiJudgeResponseSchema.safeParse({}).success).toBe(false);
  });
});
