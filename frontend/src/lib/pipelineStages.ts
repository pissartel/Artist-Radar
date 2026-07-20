import type { BackendPipelineStage } from "@/lib/server/backendTypes";

export interface PipelineStageConfig {
  stage: BackendPipelineStage;
  label: string;
  // Suggested percentage weight from issue #135 — the share of the overall
  // pipeline this stage represents. Informational; real progress comes from
  // the backend's own percentage (see backendTypes.ts), this is only used to
  // reason about fallback pacing below.
  weight: number;
  // Simulated pacing duration (ms), used only when no real backend progress
  // has been observed yet (see usePipelineProgress). Deliberately not
  // proportional to `weight`: the last two stages get more simulated time
  // than their weight alone would imply, since they cover the slowest,
  // least predictable backend work (LLM scoring + final aggregation) and we
  // don't want the simulated checklist to race ahead of it.
  fallbackDurationMs: number;
}

// Mirrors the six non-terminal stages backend/src/pipelineExecutionState.ts
// tracks. COMPLETED is the seventh/terminal backend stage and has no UI step
// of its own: the checklist's own "everything done" state is instead driven
// by the overview payload actually arriving (see usePipelineProgress),
// never by the backend stage alone.
export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { stage: "VALIDATING_ARTIST", label: "Validating artist", weight: 8, fallbackDurationMs: 1200 },
  { stage: "FETCHING_ARTIST_DATA", label: "Fetching artist data", weight: 17, fallbackDurationMs: 2500 },
  { stage: "FINDING_SIMILAR_ARTISTS", label: "Finding similar artists", weight: 20, fallbackDurationMs: 3000 },
  { stage: "SEARCHING_OPPORTUNITIES", label: "Searching opportunities", weight: 25, fallbackDurationMs: 3800 },
  { stage: "SCORING_RESULTS", label: "Scoring results", weight: 15, fallbackDurationMs: 4500 },
  { stage: "PREPARING_OVERVIEW", label: "Preparing overview", weight: 15, fallbackDurationMs: 5000 },
];

export const LAST_PIPELINE_STAGE_INDEX = PIPELINE_STAGES.length - 1;

// Index of `stage` within PIPELINE_STAGES. COMPLETED maps to
// PIPELINE_STAGES.length (one past the last real step) so callers can tell
// "backend finished" apart from "on the last real step" and decide for
// themselves whether it's safe to show that (see usePipelineProgress, which
// clamps this until the overview payload has actually arrived).
export function pipelineStageIndex(stage: BackendPipelineStage): number {
  if (stage === "COMPLETED") {
    return PIPELINE_STAGES.length;
  }
  return PIPELINE_STAGES.findIndex((config) => config.stage === stage);
}

// Which stage the fallback simulation should be on after `elapsedMs` of
// running with no real backend progress available. Walks the weighted
// durations above and never advances past the last stage, so a slow
// pipeline holds on "Preparing overview" instead of racing to a false 100%.
export function fallbackStageIndexForElapsed(elapsedMs: number): number {
  let cumulative = 0;
  for (let index = 0; index < PIPELINE_STAGES.length; index += 1) {
    cumulative += PIPELINE_STAGES[index].fallbackDurationMs;
    if (elapsedMs < cumulative) {
      return index;
    }
  }
  return LAST_PIPELINE_STAGE_INDEX;
}
