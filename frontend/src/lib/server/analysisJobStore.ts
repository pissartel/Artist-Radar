import { randomUUID } from "node:crypto";
import { DEFAULT_ANALYSIS_STEPS } from "@/lib/analysisSteps";
import { mapPipelineResultToArtistRadarResponse } from "@/lib/server/artistRadarMapper";
import { ArtistInputSchema, runOpportunitySearch } from "@/lib/server/backendPipeline";
import type {
  AnalysisJobStatus,
  AnalysisStep,
  ArtistRadarRequest,
  ArtistRadarResponse,
  StepStatus,
} from "@/types/artistRadar";

// In-memory job tracking for the local MVP (see issue #101). This only works
// within a single Next.js server process — acceptable for local dev, but it
// will need a persistent store once this runs behind multiple instances.

const STEP_SIMULATION_INTERVAL_MS = 1200;

interface StoredAnalysisJob {
  jobId: string;
  status: AnalysisJobStatus["status"];
  currentStep?: AnalysisStep;
  steps: { id: AnalysisStep; label: string; status: StepStatus }[];
  error?: string;
  result?: ArtistRadarResponse;
}

const jobs = new Map<string, StoredAnalysisJob>();

export type AnalysisExecutor = (request: ArtistRadarRequest) => Promise<ArtistRadarResponse>;

async function defaultExecutor(request: ArtistRadarRequest): Promise<ArtistRadarResponse> {
  const input = ArtistInputSchema.parse({
    mode: "booking",
    artist: request.artistName,
    city: request.location,
    genre: request.genre,
    spotifyUrl: request.spotifyUrl,
  });
  const result = await runOpportunitySearch(input);
  return mapPipelineResultToArtistRadarResponse(result, request);
}

/**
 * Runs the real pipeline via `executor` in the background. Only the final
 * step's completion is gated by the executor actually resolving; the steps in
 * between are advanced on a timer since `runOpportunitySearch` is a single
 * opaque call today and doesn't expose per-step hooks.
 */
async function runAnalysisJob(jobId: string, request: ArtistRadarRequest, executor: AnalysisExecutor): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  job.status = "running";
  const progressSteps = job.steps.slice(0, -1);
  let progressIndex = 0;
  progressSteps[0].status = "running";
  job.currentStep = progressSteps[0].id;

  const timer = setInterval(() => {
    if (progressIndex >= progressSteps.length - 1) {
      clearInterval(timer);
      return;
    }
    progressSteps[progressIndex].status = "completed";
    progressIndex += 1;
    progressSteps[progressIndex].status = "running";
    job.currentStep = progressSteps[progressIndex].id;
  }, STEP_SIMULATION_INTERVAL_MS);

  try {
    const result = await executor(request);
    clearInterval(timer);
    for (const step of progressSteps) {
      step.status = "completed";
    }
    job.steps[job.steps.length - 1].status = "completed";
    job.currentStep = undefined;
    job.result = result;
    job.status = "completed";
  } catch (error) {
    clearInterval(timer);
    const failingStep = job.steps.find((step) => step.status === "running") ?? job.steps[job.steps.length - 1];
    failingStep.status = "failed";
    job.currentStep = failingStep.id;
    job.error = error instanceof Error ? error.message : "Analysis failed. Please try again.";
    job.status = "failed";
  }
}

export function createAnalysisJob(request: ArtistRadarRequest, executor: AnalysisExecutor = defaultExecutor): string {
  const jobId = randomUUID();
  jobs.set(jobId, {
    jobId,
    status: "queued",
    steps: DEFAULT_ANALYSIS_STEPS.map((step) => ({ ...step })),
  });

  void runAnalysisJob(jobId, request, executor);

  return jobId;
}

export function getAnalysisJobStatus(jobId: string): AnalysisJobStatus | null {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }

  return {
    jobId: job.jobId,
    status: job.status,
    currentStep: job.currentStep,
    steps: job.steps.map((step) => ({ ...step })),
    error: job.error,
  };
}

export function getAnalysisJobResult(jobId: string): ArtistRadarResponse | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== "completed" || !job.result) {
    return null;
  }
  return job.result;
}
