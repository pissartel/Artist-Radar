import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real backendPipeline.ts imports compiled backend output from outside
// this package (../../../../dist/*.js) and reads the repo-root .env at
// import time — neither is available/desired in a unit test. Mock it so
// route.ts can be tested in isolation without a real pipeline run, real
// network calls, or a prior `npm run build` at the repo root.
const runOpportunitySearch = vi.fn();
const warnLog = vi.fn();
const readPersistedAnalysis = vi.fn();
const persistAnalysis = vi.fn();

vi.mock("@/lib/server/backendPipeline", () => ({
  runOpportunitySearch: (...args: unknown[]) => runOpportunitySearch(...args),
  warnLog: (...args: unknown[]) => warnLog(...args),
  ArtistInputSchema: {
    parse: (raw: unknown) => raw,
  },
}));

vi.mock("@/lib/server/analysisPersistence", () => ({
  readPersistedAnalysis: (...args: unknown[]) => readPersistedAnalysis(...args),
  persistAnalysis: (...args: unknown[]) => persistAnalysis(...args),
}));

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/artist-radar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  artistName: "Tuesday Fall",
  genre: "pop punk",
  location: "Bordeaux",
  referenceCountry: "France",
  enableBooking: true,
};

describe("POST /api/artist-radar", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    runOpportunitySearch.mockReset();
    warnLog.mockReset();
    readPersistedAnalysis.mockReset().mockResolvedValue(null);
    persistAnalysis.mockReset().mockResolvedValue(undefined);
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("rejects a malformed JSON body with a structured 400", async () => {
    const { POST } = await import("@/app/api/artist-radar/route");
    const request = new Request("http://localhost/api/artist-radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: { code: "INVALID_JSON", message: expect.any(String) },
    });
  });

  it("rejects a request missing required fields with a structured 400", async () => {
    const { POST } = await import("@/app/api/artist-radar/route");
    const response = await POST(jsonRequest({ artistName: "Tuesday Fall" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(runOpportunitySearch).not.toHaveBeenCalled();
  });

  it("fails fast with a structured error when a required server variable is missing, without leaking the variable name to the client", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      success: false,
      error: { code: "MISSING_REQUIRED_CONFIG", message: expect.any(String) },
    });
    expect(payload.error.message).not.toMatch(/OPENAI_API_KEY/);
    expect(runOpportunitySearch).not.toHaveBeenCalled();
    // The specific missing variable is still recorded server-side for diagnosis.
    expect(warnLog).toHaveBeenCalledWith(
      "artist-radar-api",
      expect.any(String),
      expect.objectContaining({ missing: ["OPENAI_API_KEY"] }),
    );
  });

  it("returns a structured error (no stack trace/internal detail) when the pipeline throws, and still logs the real exception server-side", async () => {
    const realError = new Error("provider exploded: sk-REDACTED-should-not-leak");
    runOpportunitySearch.mockRejectedValueOnce(realError);
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest(VALID_BODY));
    const payload = await response.json();
    const rawText = JSON.stringify(payload);

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      success: false,
      error: { code: "ARTIST_ANALYSIS_FAILED", message: expect.any(String) },
    });
    expect(rawText).not.toMatch(/sk-REDACTED/);
    expect(rawText).not.toMatch(/provider exploded/);
    expect(warnLog).toHaveBeenCalledWith(
      "pipeline",
      expect.any(String),
      expect.objectContaining({ error: realError }),
    );
  });

  it("accepts the expected POST body and returns 200 on a successful pipeline run", async () => {
    runOpportunitySearch.mockResolvedValueOnce({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Bordeaux",
        country: "France",
        genres: ["pop punk"],
        socialLinks: {},
        platformStats: {},
      },
      similarArtists: {},
      opportunities: [],
    });
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest(VALID_BODY));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.artist.name).toBe("Tuesday Fall");
    expect(runOpportunitySearch).toHaveBeenCalledOnce();
    expect(persistAnalysis).toHaveBeenCalledWith(VALID_BODY, payload);
  });

  it("returns a matching persisted analysis without rerunning the pipeline", async () => {
    const persisted = { artist: { name: "Tuesday Fall" }, bookingOpportunities: [] };
    readPersistedAnalysis.mockResolvedValueOnce(persisted);
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(persisted);
    expect(runOpportunitySearch).not.toHaveBeenCalled();
    expect(persistAnalysis).not.toHaveBeenCalled();
  });

  it("passes a provided executionId through to the pipeline so its status can be polled", async () => {
    runOpportunitySearch.mockResolvedValueOnce({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Bordeaux",
        country: "France",
        genres: ["pop punk"],
        socialLinks: {},
        platformStats: {},
      },
      similarArtists: {},
      opportunities: [],
    });
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest({ ...VALID_BODY, executionId: "client-exec-1" }));

    expect(response.status).toBe(200);
    expect(runOpportunitySearch).toHaveBeenCalledWith(
      expect.anything(),
      { executionId: "client-exec-1" },
    );
  });

  it("omits execution tracking options when no executionId is provided", async () => {
    runOpportunitySearch.mockResolvedValueOnce({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Bordeaux",
        country: "France",
        genres: ["pop punk"],
        socialLinks: {},
        platformStats: {},
      },
      similarArtists: {},
      opportunities: [],
    });
    const { POST } = await import("@/app/api/artist-radar/route");

    await POST(jsonRequest(VALID_BODY));

    expect(runOpportunitySearch).toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it("forwards a valid features.chartmetricArtistEnrichment toggle to the pipeline (issue #142)", async () => {
    runOpportunitySearch.mockResolvedValueOnce({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Bordeaux",
        country: "France",
        genres: ["pop punk"],
        socialLinks: {},
        platformStats: {},
      },
      similarArtists: {},
      opportunities: [],
    });
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest({ ...VALID_BODY, features: { chartmetricArtistEnrichment: true } }));

    expect(response.status).toBe(200);
    expect(runOpportunitySearch).toHaveBeenCalledWith(
      expect.anything(),
      { features: { chartmetricArtistEnrichment: true } },
    );
  });

  it("rejects a request with a malformed features field with a structured 400", async () => {
    const { POST } = await import("@/app/api/artist-radar/route");

    const response = await POST(jsonRequest({ ...VALID_BODY, features: { chartmetricArtistEnrichment: "yes" } }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("INVALID_REQUEST");
    expect(runOpportunitySearch).not.toHaveBeenCalled();
  });
});
