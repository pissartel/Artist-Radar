import type { AnalysisJobState, AnalysisStep, AnalysisStepState } from "@/types/artistRadar";

// Client-safe mirror of the step labels derived from job status in
// lib/server/analysisJobStore.ts. Only three real, coarse phases exist today
// (queued / running / completed / failed) — no fake per-step timer progress.
const STEP_LABELS: { id: AnalysisStep; label: string }[] = [
  { id: "preparing", label: "Preparing analysis" },
  { id: "running_pipeline", label: "Running artist and opportunity search" },
  { id: "building_dashboard", label: "Building dashboard" },
];

export const DEFAULT_ANALYSIS_STEPS: AnalysisStepState[] = deriveAnalysisSteps("queued");

/** Maps a job's coarse status to display state for the three known steps. */
export function deriveAnalysisSteps(status: AnalysisJobState): AnalysisStepState[] {
  const [preparing, runningPipeline, buildingDashboard] = STEP_LABELS;

  switch (status) {
    case "queued":
      return [
        { ...preparing, status: "running" },
        { ...runningPipeline, status: "pending" },
        { ...buildingDashboard, status: "pending" },
      ];
    case "running":
      return [
        { ...preparing, status: "completed" },
        { ...runningPipeline, status: "running" },
        { ...buildingDashboard, status: "pending" },
      ];
    case "completed":
      return [
        { ...preparing, status: "completed" },
        { ...runningPipeline, status: "completed" },
        { ...buildingDashboard, status: "completed" },
      ];
    case "failed":
      return [
        { ...preparing, status: "completed" },
        { ...runningPipeline, status: "failed" },
        { ...buildingDashboard, status: "pending" },
      ];
  }
}
