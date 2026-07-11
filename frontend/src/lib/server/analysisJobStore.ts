import { deriveAnalysisSteps } from "@/lib/analysisSteps";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type {
  AnalysisJobState,
  AnalysisJobStatus,
  AnalysisStep,
  ArtistRadarRequest,
  ArtistRadarResponse,
} from "@/types/artistRadar";

// Persistent analysis job store backed by Supabase/PostgreSQL (see the
// `analysis_jobs` migration). This replaces the previous in-memory Map,
// which did not survive across Vercel serverless instances or restarts.
// Job execution itself happens out-of-process, in the Inngest function
// (see lib/server/inngest/functions.ts) — this module only reads/writes rows.

const TABLE = "analysis_jobs";

interface AnalysisJobRow {
  id: string;
  status: AnalysisJobState;
  current_step: AnalysisStep | null;
  request_payload: ArtistRadarRequest;
  result_payload: ArtistRadarResponse | null;
  error: string | null;
}

/** Job data needed by the Inngest function to execute the pipeline. */
export interface AnalysisJobForExecution {
  jobId: string;
  status: AnalysisJobState;
  requestPayload: ArtistRadarRequest;
}

function logJobEvent(jobId: string | undefined, event: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ scope: "analysis-job", jobId, event, ...extra }));
}

export async function createAnalysisJob(request: ArtistRadarRequest): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert({ status: "queued", current_step: "preparing", request_payload: request })
    .select("id")
    .single();

  if (error || !data) {
    logJobEvent(undefined, "create-failed", { error: error?.message });
    throw new Error("Failed to create analysis job.");
  }

  logJobEvent(data.id as string, "created");
  return data.id as string;
}

export async function getAnalysisJobStatus(jobId: string): Promise<AnalysisJobStatus | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, status, current_step, error")
    .eq("id", jobId)
    .maybeSingle<Pick<AnalysisJobRow, "id" | "status" | "current_step" | "error">>();

  if (error || !data) {
    return null;
  }

  return {
    jobId: data.id,
    status: data.status,
    currentStep: data.current_step ?? undefined,
    steps: deriveAnalysisSteps(data.status),
    error: data.error ?? undefined,
  };
}

export async function getAnalysisJobResult(jobId: string): Promise<ArtistRadarResponse | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("status, result_payload")
    .eq("id", jobId)
    .maybeSingle<Pick<AnalysisJobRow, "status" | "result_payload">>();

  if (error || !data || data.status !== "completed" || !data.result_payload) {
    return null;
  }

  return data.result_payload;
}

/** Reads the job for execution by the Inngest function, including its request payload. */
export async function loadAnalysisJobForExecution(jobId: string): Promise<AnalysisJobForExecution | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, status, request_payload")
    .eq("id", jobId)
    .maybeSingle<Pick<AnalysisJobRow, "id" | "status" | "request_payload">>();

  if (error || !data) {
    return null;
  }

  return { jobId: data.id, status: data.status, requestPayload: data.request_payload };
}

/** Transitions a job from queued to running. No-op (idempotent) if it already left the queued state. */
export async function markAnalysisJobRunning(jobId: string): Promise<void> {
  await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "running", current_step: "running_pipeline", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "queued");

  logJobEvent(jobId, "running");
}

export async function completeAnalysisJob(jobId: string, result: ArtistRadarResponse): Promise<void> {
  const now = new Date().toISOString();
  await getSupabaseAdmin()
    .from(TABLE)
    .update({
      status: "completed",
      current_step: null,
      result_payload: result,
      error: null,
      updated_at: now,
      completed_at: now,
    })
    .eq("id", jobId);

  logJobEvent(jobId, "completed");
}

export async function failAnalysisJob(jobId: string, message: string): Promise<void> {
  const now = new Date().toISOString();
  await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "failed", error: message, updated_at: now, completed_at: now })
    .eq("id", jobId);

  logJobEvent(jobId, "failed", { error: message });
}
