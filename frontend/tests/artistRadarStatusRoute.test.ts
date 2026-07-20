import { beforeEach, describe, expect, it, vi } from "vitest";

// Same rationale as artistRadarRoute.test.ts: backendPipeline.ts pulls in the
// compiled backend output and reads the repo-root .env at import time, so it
// is mocked here to keep this a fast, isolated unit test of the route.
const getPipelineExecutionState = vi.fn();

vi.mock("@/lib/server/backendPipeline", () => ({
  getPipelineExecutionState: (...args: unknown[]) => getPipelineExecutionState(...args),
}));

function paramsFor(executionId: string): { params: Promise<{ executionId: string }> } {
  return { params: Promise.resolve({ executionId }) };
}

describe("GET /api/artist-radar/status/[executionId]", () => {
  beforeEach(() => {
    vi.resetModules();
    getPipelineExecutionState.mockReset();
  });

  it("returns the current execution state for a known executionId", async () => {
    getPipelineExecutionState.mockReturnValueOnce({
      executionId: "exec-1",
      stage: "FINDING_SIMILAR_ARTISTS",
      status: "running",
      percentage: 28,
      message: "Finding similar artists...",
      error: null,
      updatedAt: "2026-07-20T10:00:00.000Z",
    });
    const { GET } = await import("@/app/api/artist-radar/status/[executionId]/route");

    const response = await GET(new Request("http://localhost/api/artist-radar/status/exec-1"), paramsFor("exec-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.stage).toBe("FINDING_SIMILAR_ARTISTS");
    expect(payload.percentage).toBe(28);
    expect(getPipelineExecutionState).toHaveBeenCalledWith("exec-1");
  });

  it("returns a structured 404 when the execution id is unknown or expired", async () => {
    getPipelineExecutionState.mockReturnValueOnce(null);
    const { GET } = await import("@/app/api/artist-radar/status/[executionId]/route");

    const response = await GET(new Request("http://localhost/api/artist-radar/status/missing"), paramsFor("missing"));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      success: false,
      error: { code: "EXECUTION_NOT_FOUND", message: expect.any(String) },
    });
  });

  it("returns a structured 400 for a blank executionId", async () => {
    const { GET } = await import("@/app/api/artist-radar/status/[executionId]/route");

    const response = await GET(new Request("http://localhost/api/artist-radar/status/%20"), paramsFor(" "));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(getPipelineExecutionState).not.toHaveBeenCalled();
  });

  it("surfaces a failed status with a recoverable error shape, no raw error message", async () => {
    getPipelineExecutionState.mockReturnValueOnce({
      executionId: "exec-2",
      stage: "SEARCHING_OPPORTUNITIES",
      status: "failed",
      percentage: 57,
      message: "The artist analysis could not be completed. You can try again.",
      error: { stage: "SEARCHING_OPPORTUNITIES" },
      updatedAt: "2026-07-20T10:05:00.000Z",
    });
    const { GET } = await import("@/app/api/artist-radar/status/[executionId]/route");

    const response = await GET(new Request("http://localhost/api/artist-radar/status/exec-2"), paramsFor("exec-2"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("failed");
    expect(payload.error).toEqual({ stage: "SEARCHING_OPPORTUNITIES" });
  });
});
