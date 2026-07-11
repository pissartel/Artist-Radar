import {
  completeAnalysisJob,
  failAnalysisJob,
  loadAnalysisJobForExecution,
  markAnalysisJobRunning,
} from "@/lib/server/analysisJobStore";
import { mapPipelineResultToArtistRadarResponse } from "@/lib/server/artistRadarMapper";
import { ArtistInputSchema, runOpportunitySearch } from "@/lib/server/backendPipeline";
import { inngest } from "./client";

interface StepLike {
  run(name: string, fn: () => Promise<unknown> | unknown): Promise<unknown>;
}

interface LoggerLike {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/**
 * Core logic for the durable analysis pipeline execution, kept independent
 * of Inngest's function wrapper so it can be unit tested with fake
 * step/logger implementations.
 */
export async function handleAnalysisRequested({
  jobId,
  step,
  logger,
}: {
  jobId: string;
  step: StepLike;
  logger: LoggerLike;
}) {
  const job = (await step.run("load-job", () => loadAnalysisJobForExecution(jobId))) as Awaited<
    ReturnType<typeof loadAnalysisJobForExecution>
  >;

  if (!job) {
    logger.warn("analysis job not found, skipping", { jobId });
    return { skipped: true, reason: "not-found" as const };
  }

  if (job.status === "completed" || job.status === "failed") {
    logger.info("analysis job already terminal, skipping re-execution", { jobId, status: job.status });
    return { skipped: true, reason: job.status };
  }

  await step.run("mark-running", () => markAnalysisJobRunning(jobId));

  try {
    const result = (await step.run("execute-pipeline", async () => {
      const input = ArtistInputSchema.parse({
        mode: "booking",
        artist: job.requestPayload.artistName,
        city: job.requestPayload.location,
        genre: job.requestPayload.genre,
        spotifyUrl: job.requestPayload.spotifyUrl,
      });
      const pipelineResult = await runOpportunitySearch(input);
      return mapPipelineResultToArtistRadarResponse(pipelineResult, job.requestPayload);
    })) as ReturnType<typeof mapPipelineResultToArtistRadarResponse>;

    await step.run("persist-result", () => completeAnalysisJob(jobId, result));
    logger.info("analysis job completed", { jobId });
    return { status: "completed" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed. Please try again.";
    await step.run("mark-failed", () => failAnalysisJob(jobId, message));
    logger.error("analysis job failed", { jobId, error: message });
    return { status: "failed" as const, error: message };
  }
}

/**
 * Durable execution of the artist analysis pipeline. Triggered by
 * `artist-radar/analysis.requested`, which is sent right after the job row
 * is inserted by POST /api/artist-analysis. Runs on Inngest's infrastructure,
 * not inside the original HTTP request, so it survives serverless instance
 * changes and restarts.
 */
export const runAnalysisJob = inngest.createFunction(
  {
    id: "run-analysis-job",
    retries: 3,
    // Dedupe repeated event delivery for the same job within Inngest's
    // dedup window, in addition to the completed/failed guard in
    // handleAnalysisRequested.
    idempotency: "event.data.jobId",
  },
  { event: "artist-radar/analysis.requested" },
  async ({ event, step, logger }) => handleAnalysisRequested({ jobId: event.data.jobId, step, logger })
);
