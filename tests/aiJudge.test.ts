import { describe, expect, it, vi } from "vitest";
import { isAiJudgeEnabled, runAiJudge } from "../src/ai/judge/aiJudge.js";

const baseInput = {
  domain: "booking" as const,
  artistName: "Tuesday Fall",
  genre: "pop punk",
  items: [
    {
      name: "Le Sonic",
      deterministicScore: 82,
      reason: "Books pop punk and easycore nights year-round.",
      evidence: [{ source: "Le Sonic", sourceUrl: "https://le-sonic.example.com/programming", snippet: "Pop punk nights year-round." }]
    }
  ]
};

describe("isAiJudgeEnabled", () => {
  it("is disabled by default when the env flag is missing", () => {
    expect(isAiJudgeEnabled({})).toBe(false);
  });

  it("is disabled for any value other than the literal string 'true'", () => {
    expect(isAiJudgeEnabled({ ENABLE_AI_JUDGE: "false" })).toBe(false);
    expect(isAiJudgeEnabled({ ENABLE_AI_JUDGE: "1" })).toBe(false);
  });

  it("is enabled when set to 'true' (case-insensitive)", () => {
    expect(isAiJudgeEnabled({ ENABLE_AI_JUDGE: "true" })).toBe(true);
    expect(isAiJudgeEnabled({ ENABLE_AI_JUDGE: "TRUE" })).toBe(true);
  });
});

describe("runAiJudge", () => {
  it("does not call the model and returns disabled when the judge is not enabled", async () => {
    const callModel = vi.fn(async () => JSON.stringify({ verdicts: [] }));

    const result = await runAiJudge(baseInput, { enabled: false, callModel });

    expect(result.enabled).toBe(false);
    expect(result.verdictsByItemName.size).toBe(0);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("does not call the model when enabled but there are no items to judge (cost control)", async () => {
    const callModel = vi.fn(async () => JSON.stringify({ verdicts: [] }));

    const result = await runAiJudge({ ...baseInput, items: [] }, { enabled: true, callModel });

    expect(result.enabled).toBe(false);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("returns a verdict keyed by item name when enabled and the model output is valid", async () => {
    const callModel = vi.fn(async () =>
      JSON.stringify({
        verdicts: [
          {
            itemName: "Le Sonic",
            relevance: "high",
            realism: "realistic",
            missingEvidence: [],
            risks: [],
            recommendedNextAction: "Send a booking email referencing the pop punk night.",
            explanation: "Well-evidenced and genre-compatible, consistent with the deterministic score."
          }
        ]
      })
    );

    const result = await runAiJudge(baseInput, { enabled: true, callModel });

    expect(result.enabled).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.verdictsByItemName.get("le sonic")).toMatchObject({ relevance: "high", realism: "realistic" });
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("discards a verdict for an item name that was not given to the judge (no invented sources/items)", async () => {
    const callModel = vi.fn(async () =>
      JSON.stringify({
        verdicts: [
          {
            itemName: "A Venue That Was Never Provided",
            relevance: "high",
            realism: "realistic",
            missingEvidence: [],
            risks: [],
            recommendedNextAction: "Reach out.",
            explanation: "Fabricated verdict for an unknown item."
          }
        ]
      })
    );

    const result = await runAiJudge(baseInput, { enabled: true, callModel });

    expect(result.verdictsByItemName.size).toBe(0);
    expect(result.warnings.some((warning) => warning.includes("unknown item") && warning.includes("discarded"))).toBe(true);
  });

  it("returns empty verdicts with a warning instead of throwing when the model output is not valid JSON", async () => {
    const callModel = vi.fn(async () => "not json");

    const result = await runAiJudge(baseInput, { enabled: true, callModel });

    expect(result.enabled).toBe(true);
    expect(result.verdictsByItemName.size).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns empty verdicts with a warning instead of throwing when the model output fails schema validation", async () => {
    const callModel = vi.fn(async () => JSON.stringify({ verdicts: [{ itemName: "Le Sonic", relevance: "extreme" }] }));

    const result = await runAiJudge(baseInput, { enabled: true, callModel });

    expect(result.enabled).toBe(true);
    expect(result.verdictsByItemName.size).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
