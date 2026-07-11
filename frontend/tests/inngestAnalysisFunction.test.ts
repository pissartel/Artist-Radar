import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

const loadAnalysisJobForExecution = vi.fn();
const markAnalysisJobRunning = vi.fn();
const completeAnalysisJob = vi.fn();
const failAnalysisJob = vi.fn();

vi.mock("@/lib/server/analysisJobStore", () => ({
  loadAnalysisJobForExecution: (...args: unknown[]) => loadAnalysisJobForExecution(...args),
  markAnalysisJobRunning: (...args: unknown[]) => markAnalysisJobRunning(...args),
  completeAnalysisJob: (...args: unknown[]) => completeAnalysisJob(...args),
  failAnalysisJob: (...args: unknown[]) => failAnalysisJob(...args),
}));

const runOpportunitySearch = vi.fn();
vi.mock("@/lib/server/backendPipeline", () => ({
  runOpportunitySearch: (...args: unknown[]) => runOpportunitySearch(...args),
  ArtistInputSchema: { parse: (raw: unknown) => raw },
}));

const mapPipelineResultToArtistRadarResponse = vi.fn();
vi.mock("@/lib/server/artistRadarMapper", () => ({
  mapPipelineResultToArtistRadarResponse: (...args: unknown[]) => mapPipelineResultToArtistRadarResponse(...args),
}));

const { handleAnalysisRequested } = await import("@/lib/server/inngest/functions");

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

const fakeStep = {
  run: async <T,>(_name: string, fn: () => Promise<T> | T): Promise<T> => fn(),
};

const fakeLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("handleAnalysisRequested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips execution when the job id is unknown", async () => {
    loadAnalysisJobForExecution.mockResolvedValue(null);

    const outcome = await handleAnalysisRequested({ jobId: "missing", step: fakeStep, logger: fakeLogger });

    expect(outcome).toEqual({ skipped: true, reason: "not-found" });
    expect(markAnalysisJobRunning).not.toHaveBeenCalled();
    expect(runOpportunitySearch).not.toHaveBeenCalled();
  });

  it("does not re-run an already completed job (idempotent, repeated event delivery)", async () => {
    loadAnalysisJobForExecution.mockResolvedValue({ jobId: "job-1", status: "completed", requestPayload: request });

    const outcome = await handleAnalysisRequested({ jobId: "job-1", step: fakeStep, logger: fakeLogger });

    expect(outcome).toEqual({ skipped: true, reason: "completed" });
    expect(markAnalysisJobRunning).not.toHaveBeenCalled();
    expect(runOpportunitySearch).not.toHaveBeenCalled();
  });

  it("does not re-run an already failed job", async () => {
    loadAnalysisJobForExecution.mockResolvedValue({ jobId: "job-1", status: "failed", requestPayload: request });

    const outcome = await handleAnalysisRequested({ jobId: "job-1", step: fakeStep, logger: fakeLogger });

    expect(outcome).toEqual({ skipped: true, reason: "failed" });
    expect(runOpportunitySearch).not.toHaveBeenCalled();
  });

  it("transitions a queued job to running before executing the pipeline", async () => {
    loadAnalysisJobForExecution.mockResolvedValue({ jobId: "job-1", status: "queued", requestPayload: request });
    runOpportunitySearch.mockResolvedValue({});
    const response = buildResponse();
    mapPipelineResultToArtistRadarResponse.mockReturnValue(response);

    await handleAnalysisRequested({ jobId: "job-1", step: fakeStep, logger: fakeLogger });

    expect(markAnalysisJobRunning).toHaveBeenCalledWith("job-1");
    expect(markAnalysisJobRunning.mock.invocationCallOrder[0]).toBeLessThan(
      runOpportunitySearch.mock.invocationCallOrder[0]
    );
  });

  it("executes the pipeline and persists the mapped result on success", async () => {
    loadAnalysisJobForExecution.mockResolvedValue({ jobId: "job-1", status: "queued", requestPayload: request });
    const pipelineResult = { some: "result" };
    runOpportunitySearch.mockResolvedValue(pipelineResult);
    const response = buildResponse();
    mapPipelineResultToArtistRadarResponse.mockReturnValue(response);

    const outcome = await handleAnalysisRequested({ jobId: "job-1", step: fakeStep, logger: fakeLogger });

    expect(mapPipelineResultToArtistRadarResponse).toHaveBeenCalledWith(pipelineResult, request);
    expect(completeAnalysisJob).toHaveBeenCalledWith("job-1", response);
    expect(failAnalysisJob).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "completed" });
  });

  it("marks the job failed when the pipeline throws", async () => {
    loadAnalysisJobForExecution.mockResolvedValue({ jobId: "job-1", status: "queued", requestPayload: request });
    runOpportunitySearch.mockRejectedValue(new Error("Pipeline exploded"));

    const outcome = await handleAnalysisRequested({ jobId: "job-1", step: fakeStep, logger: fakeLogger });

    expect(failAnalysisJob).toHaveBeenCalledWith("job-1", "Pipeline exploded");
    expect(completeAnalysisJob).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: "failed", error: "Pipeline exploded" });
  });
});
