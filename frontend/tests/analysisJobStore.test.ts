import { describe, expect, it, vi } from "vitest";
import { createAnalysisJob, getAnalysisJobResult, getAnalysisJobStatus } from "@/lib/server/analysisJobStore";
import type { ArtistRadarRequest, ArtistRadarResponse } from "@/types/artistRadar";

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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("analysisJobStore", () => {
  it("marks the job completed and stores the result once the executor resolves", async () => {
    const response = buildResponse();
    const executor = vi.fn().mockResolvedValue(response);

    const jobId = createAnalysisJob(request, executor);
    await flushMicrotasks();

    const status = getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("completed");
    expect(status?.currentStep).toBeUndefined();
    expect(status?.steps.every((step) => step.status === "completed")).toBe(true);
    expect(executor).toHaveBeenCalledWith(request);
    expect(getAnalysisJobResult(jobId)).toEqual(response);
  });

  it("marks the job failed with an error message when the executor rejects", async () => {
    const executor = vi.fn().mockRejectedValue(new Error("Pipeline exploded"));

    const jobId = createAnalysisJob(request, executor);
    await flushMicrotasks();

    const status = getAnalysisJobStatus(jobId);
    expect(status?.status).toBe("failed");
    expect(status?.error).toBe("Pipeline exploded");
    expect(status?.steps.some((step) => step.status === "failed")).toBe(true);
    expect(getAnalysisJobResult(jobId)).toBeNull();
  });

  it("returns null for an unknown job id", () => {
    expect(getAnalysisJobStatus("does-not-exist")).toBeNull();
    expect(getAnalysisJobResult("does-not-exist")).toBeNull();
  });
});
