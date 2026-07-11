import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";
import { createFakeSupabaseClient, type FakeRow } from "./helpers/fakeSupabase";

let fakeClient: ReturnType<typeof createFakeSupabaseClient>;

vi.mock("@/lib/server/supabaseAdmin", () => ({
  getSupabaseAdmin: () => fakeClient,
}));

const {
  createAnalysisJob,
  markAnalysisJobRunning,
  completeAnalysisJob,
  failAnalysisJob,
  getAnalysisJobStatus,
  getAnalysisJobResult,
} = await import("@/lib/server/analysisJobStore");

const request: ArtistRadarRequest = {
  artistName: "Tuesday Fall",
  genre: "pop punk",
  location: "Paris",
};

function buildResponse(): ArtistRadarResponse {
  return {
    artist: {
      id: "tuesday-fall",
      name: "Tuesday Fall",
      genres: ["pop punk"],
      location: "Paris",
      city: "Paris",
      country: "France",
      monthlyListeners: 0,
      growthPercent: 0,
    },
    kpis: [],
    similarArtists: [],
    bookingOpportunities: [],
    topCities: [],
    sources: [],
    warnings: [],
  };
}

describe("analysisJobStore", () => {
  let rows: FakeRow[];

  beforeEach(() => {
    rows = [];
    fakeClient = createFakeSupabaseClient(rows);
  });

  it("creates a job in PostgreSQL with status queued", async () => {
    const jobId = await createAnalysisJob(request);
    expect(rows).toHaveLength(1);
    expect(rows[0].request_payload).toEqual(request);

    const status = await getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("queued");
    expect(status?.steps.find((step) => step.id === "preparing")?.status).toBe("running");
  });

  it("transitions a queued job to running", async () => {
    const jobId = await createAnalysisJob(request);
    await markAnalysisJobRunning(jobId);

    const status = await getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("running");
    expect(status?.steps.find((step) => step.id === "running_pipeline")?.status).toBe("running");
  });

  it("does not transition a job back to running once it left the queued state", async () => {
    const jobId = await createAnalysisJob(request);
    await markAnalysisJobRunning(jobId);
    await completeAnalysisJob(jobId, buildResponse());

    await markAnalysisJobRunning(jobId);

    const status = await getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("completed");
  });

  it("marks the job completed and persists the result", async () => {
    const response = buildResponse();
    const jobId = await createAnalysisJob(request);
    await markAnalysisJobRunning(jobId);
    await completeAnalysisJob(jobId, response);

    const status = await getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("completed");
    expect(status?.steps.every((step) => step.status === "completed")).toBe(true);
    expect(await getAnalysisJobResult(jobId)).toEqual(response);
  });

  it("marks the job failed with an error message", async () => {
    const jobId = await createAnalysisJob(request);
    await markAnalysisJobRunning(jobId);
    await failAnalysisJob(jobId, "Pipeline exploded");

    const status = await getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("failed");
    expect(status?.error).toBe("Pipeline exploded");
    expect(status?.steps.find((step) => step.id === "running_pipeline")?.status).toBe("failed");
    expect(await getAnalysisJobResult(jobId)).toBeNull();
  });

  it("returns null for an unknown job id", async () => {
    expect(await getAnalysisJobStatus("does-not-exist")).toBeNull();
    expect(await getAnalysisJobResult("does-not-exist")).toBeNull();
  });

  it("does not return a result while the job is still running", async () => {
    const jobId = await createAnalysisJob(request);
    await markAnalysisJobRunning(jobId);

    expect(await getAnalysisJobResult(jobId)).toBeNull();
  });
});
