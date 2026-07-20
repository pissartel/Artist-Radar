import { describe, expect, it } from "vitest";
import {
  PIPELINE_STAGE_ORDER,
  completePipelineExecution,
  failPipelineExecution,
  getPipelineExecutionState,
  startPipelineExecution,
  updatePipelineStage
} from "../src/pipelineExecutionState.js";

describe("pipelineExecutionState", () => {
  it("defines the seven stable stages from lowest to highest progress, ending in COMPLETED", () => {
    expect(PIPELINE_STAGE_ORDER).toEqual([
      "VALIDATING_ARTIST",
      "FETCHING_ARTIST_DATA",
      "FINDING_SIMILAR_ARTISTS",
      "SEARCHING_OPPORTUNITIES",
      "SCORING_RESULTS",
      "PREPARING_OVERVIEW",
      "COMPLETED"
    ]);
  });

  it("returns null for an unknown execution id", () => {
    expect(getPipelineExecutionState("does-not-exist")).toBeNull();
  });

  it("starts a running execution at VALIDATING_ARTIST with 0% progress", () => {
    const executionId = "exec-start";
    startPipelineExecution(executionId);

    const state = getPipelineExecutionState(executionId);
    expect(state?.stage).toBe("VALIDATING_ARTIST");
    expect(state?.status).toBe("running");
    expect(state?.percentage).toBe(0);
    expect(state?.error).toBeNull();
  });

  it("advances stage and percentage monotonically as the pipeline progresses", () => {
    const executionId = "exec-progress";
    startPipelineExecution(executionId);

    updatePipelineStage(executionId, "FETCHING_ARTIST_DATA");
    expect(getPipelineExecutionState(executionId)?.percentage).toBeGreaterThan(0);

    updatePipelineStage(executionId, "PREPARING_OVERVIEW");
    const preparingState = getPipelineExecutionState(executionId);
    expect(preparingState?.stage).toBe("PREPARING_OVERVIEW");
    expect(preparingState?.status).toBe("running");
    expect(preparingState?.percentage).toBeLessThan(100);
  });

  it("keeps the COMPLETED stage visible and at 100% after completion", () => {
    const executionId = "exec-complete";
    startPipelineExecution(executionId);
    updatePipelineStage(executionId, "PREPARING_OVERVIEW");
    completePipelineExecution(executionId);

    const state = getPipelineExecutionState(executionId);
    expect(state?.stage).toBe("COMPLETED");
    expect(state?.status).toBe("completed");
    expect(state?.percentage).toBe(100);
  });

  it("exposes a recoverable failed state that records the stage where it failed, without leaking the raw error", () => {
    const executionId = "exec-fail";
    startPipelineExecution(executionId);
    updatePipelineStage(executionId, "SEARCHING_OPPORTUNITIES");
    failPipelineExecution(executionId, "SEARCHING_OPPORTUNITIES", new Error("provider exploded: sk-should-not-leak"));

    const state = getPipelineExecutionState(executionId);
    expect(state?.status).toBe("failed");
    expect(state?.stage).toBe("SEARCHING_OPPORTUNITIES");
    expect(state?.error).toEqual({ stage: "SEARCHING_OPPORTUNITIES" });
    expect(state?.message).not.toContain("sk-should-not-leak");
  });

  it("is a no-op when updating/completing/failing an execution id that was never started", () => {
    expect(() => updatePipelineStage("never-started", "COMPLETED")).not.toThrow();
    expect(() => completePipelineExecution("never-started")).not.toThrow();
    expect(() => failPipelineExecution("never-started", "VALIDATING_ARTIST", new Error("x"))).not.toThrow();
    expect(getPipelineExecutionState("never-started")).toBeNull();
  });
});
