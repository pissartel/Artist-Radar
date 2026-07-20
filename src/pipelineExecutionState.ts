import { PipelineStageSchema, type PipelineExecutionStatus, type PipelineStage } from "./schemas.js";
import { warnLog } from "./utils/logger.js";

// Ordered stages define both the polling contract and how percentage is
// derived (index in this list / (length - 1) * 100). Keep in sync with
// PipelineStageSchema.
export const PIPELINE_STAGE_ORDER: PipelineStage[] = PipelineStageSchema.options;

const DEFAULT_STAGE_MESSAGES: Record<PipelineStage, string> = {
  VALIDATING_ARTIST: "Validating artist information...",
  FETCHING_ARTIST_DATA: "Fetching artist data...",
  FINDING_SIMILAR_ARTISTS: "Finding similar artists...",
  SEARCHING_OPPORTUNITIES: "Searching booking opportunities...",
  SCORING_RESULTS: "Scoring results...",
  PREPARING_OVERVIEW: "Preparing overview...",
  COMPLETED: "Analysis complete."
};

// Deliberately does not carry the underlying error message: this state is
// serialized straight to the client-facing status endpoint, and raw
// exception text (provider errors, stack fragments) must stay server-side.
// See failPipelineExecution, which logs the real error via warnLog.
export interface PipelineExecutionError {
  stage: PipelineStage;
}

export interface PipelineExecutionState {
  executionId: string;
  stage: PipelineStage;
  status: PipelineExecutionStatus;
  percentage: number;
  message: string;
  error: PipelineExecutionError | null;
  updatedAt: string;
}

// In-memory only, by design: this is the "minimal infrastructure cost"
// mechanism called for by issue #134, as an alternative to a durable job
// queue. It does not survive process restarts and is not shared across
// server instances — acceptable for a single-instance MVP deployment, but a
// known limitation if the app later runs on multi-instance serverless.
const executionStates = new Map<string, PipelineExecutionState>();

const EXECUTION_TTL_MS = 30 * 60 * 1000;

function stagePercentage(stage: PipelineStage): number {
  const index = PIPELINE_STAGE_ORDER.indexOf(stage);
  if (index < 0) {
    return 0;
  }
  return Math.round((index / (PIPELINE_STAGE_ORDER.length - 1)) * 100);
}

function sweepExpiredExecutions(now: number): void {
  for (const [executionId, state] of executionStates) {
    if (now - Date.parse(state.updatedAt) > EXECUTION_TTL_MS) {
      executionStates.delete(executionId);
    }
  }
}

export function startPipelineExecution(executionId: string): PipelineExecutionState {
  sweepExpiredExecutions(Date.now());
  const stage: PipelineStage = "VALIDATING_ARTIST";
  const state: PipelineExecutionState = {
    executionId,
    stage,
    status: "running",
    percentage: stagePercentage(stage),
    message: DEFAULT_STAGE_MESSAGES[stage],
    error: null,
    updatedAt: new Date().toISOString()
  };
  executionStates.set(executionId, state);
  return state;
}

export function updatePipelineStage(executionId: string, stage: PipelineStage, message?: string): void {
  const existing = executionStates.get(executionId);
  if (!existing) {
    return;
  }
  executionStates.set(executionId, {
    ...existing,
    stage,
    status: "running",
    percentage: stagePercentage(stage),
    message: message ?? DEFAULT_STAGE_MESSAGES[stage],
    updatedAt: new Date().toISOString()
  });
}

export function completePipelineExecution(executionId: string, message?: string): void {
  const existing = executionStates.get(executionId);
  if (!existing) {
    return;
  }
  executionStates.set(executionId, {
    ...existing,
    stage: "COMPLETED",
    status: "completed",
    percentage: 100,
    message: message ?? DEFAULT_STAGE_MESSAGES.COMPLETED,
    updatedAt: new Date().toISOString()
  });
}

export function failPipelineExecution(executionId: string, stage: PipelineStage, error: unknown): void {
  const existing = executionStates.get(executionId);
  if (!existing) {
    return;
  }
  warnLog("pipeline", "Pipeline execution failed", { executionId, stage, error });
  executionStates.set(executionId, {
    ...existing,
    stage,
    status: "failed",
    message: "The artist analysis could not be completed. You can try again.",
    error: { stage },
    updatedAt: new Date().toISOString()
  });
}

export function getPipelineExecutionState(executionId: string): PipelineExecutionState | null {
  sweepExpiredExecutions(Date.now());
  return executionStates.get(executionId) ?? null;
}
