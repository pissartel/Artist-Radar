import { describe, expect, it } from "vitest";
import {
  LAST_PIPELINE_STAGE_INDEX,
  PIPELINE_STAGES,
  fallbackStageIndexForElapsed,
  pipelineStageIndex,
} from "@/lib/pipelineStages";

describe("PIPELINE_STAGES", () => {
  it("weights sum to 100, matching the fallback weighting suggested in issue #135", () => {
    const total = PIPELINE_STAGES.reduce((sum, config) => sum + config.weight, 0);
    expect(total).toBe(100);
  });

  it("gives the last two stages more fallback pacing time than any earlier stage", () => {
    const durations = PIPELINE_STAGES.map((config) => config.fallbackDurationMs);
    const [, , , thirdStage, fourthStage, fifthStage] = durations;
    expect(fourthStage).toBeGreaterThan(thirdStage);
    expect(fifthStage).toBeGreaterThan(thirdStage);
  });
});

describe("pipelineStageIndex", () => {
  it("maps each real stage to its position in PIPELINE_STAGES", () => {
    expect(pipelineStageIndex("VALIDATING_ARTIST")).toBe(0);
    expect(pipelineStageIndex("PREPARING_OVERVIEW")).toBe(LAST_PIPELINE_STAGE_INDEX);
  });

  it("maps COMPLETED one past the last real stage, distinguishing it from being merely on the last stage", () => {
    expect(pipelineStageIndex("COMPLETED")).toBe(PIPELINE_STAGES.length);
    expect(pipelineStageIndex("COMPLETED")).toBeGreaterThan(LAST_PIPELINE_STAGE_INDEX);
  });
});

describe("fallbackStageIndexForElapsed", () => {
  it("starts on the first stage", () => {
    expect(fallbackStageIndexForElapsed(0)).toBe(0);
  });

  it("advances to the next stage once the current stage's duration has elapsed", () => {
    const firstDuration = PIPELINE_STAGES[0].fallbackDurationMs;
    expect(fallbackStageIndexForElapsed(firstDuration - 1)).toBe(0);
    expect(fallbackStageIndexForElapsed(firstDuration)).toBe(1);
  });

  it("never advances past the last stage, so a slow pipeline holds instead of reaching a false 100%", () => {
    const totalDuration = PIPELINE_STAGES.reduce((sum, config) => sum + config.fallbackDurationMs, 0);
    expect(fallbackStageIndexForElapsed(totalDuration + 60_000)).toBe(LAST_PIPELINE_STAGE_INDEX);
  });
});
