import { describe, expect, it, vi } from "vitest";
import { ChartmetricArtistEnrichmentProvider } from "../src/features/artist-enrichment/chartmetric/chartmetric.service.js";
import { ChartmetricApiError, type ChartmetricClient } from "../src/features/artist-enrichment/chartmetric/chartmetric.client.js";
import {
  createChartmetricHistoryCache,
  createChartmetricIdentityCache,
  createChartmetricMetricsCache
} from "../src/features/artist-enrichment/chartmetric/chartmetric.cache.js";
import { ChartmetricAnalysisCallBudget, ChartmetricCreditBudget } from "../src/features/artist-enrichment/chartmetric/chartmetric.usage-guard.js";
import type { ArtistEnrichmentInput } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

const BASE_ENV = { CHARTMETRIC_REFRESH_TOKEN: "token", VERCEL_ENV: "production" };
const BASE_INPUT: ArtistEnrichmentInput = { artistName: "Broad Peak", spotifyArtistId: "spotify123" };

function fakeClient(overrides: Partial<ChartmetricClient> = {}): ChartmetricClient {
  return {
    getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: { id: 42, name: "Broad Peak" }, retryCount: 0, durationMs: 5 }),
    searchArtistsByName: vi.fn().mockResolvedValue({ data: [], retryCount: 0, durationMs: 5 }),
    getArtistStats: vi
      .fn()
      .mockResolvedValue({ data: { latest: { date: "2026-01-01", spotifyMonthlyListeners: 500, spotifyFollowers: 300 }, history: [] }, retryCount: 0, durationMs: 5 }),
    ...overrides
  } as unknown as ChartmetricClient;
}

function buildProvider(options: {
  client?: ChartmetricClient;
  env?: Record<string, string>;
  requestToggleEnabled?: boolean;
  callBudget?: ChartmetricAnalysisCallBudget;
  creditBudget?: ChartmetricCreditBudget;
} = {}): ChartmetricArtistEnrichmentProvider {
  return new ChartmetricArtistEnrichmentProvider({
    env: { ...BASE_ENV, ...options.env },
    requestToggleEnabled: options.requestToggleEnabled,
    client: options.client ?? fakeClient(),
    identityCache: createChartmetricIdentityCache(),
    metricsCache: createChartmetricMetricsCache(),
    historyCache: createChartmetricHistoryCache(),
    callBudget: options.callBudget ?? new ChartmetricAnalysisCallBudget(5),
    creditBudget: options.creditBudget ?? new ChartmetricCreditBudget(null, null)
  });
}

describe("ChartmetricArtistEnrichmentProvider.enrichArtist", () => {
  it("succeeds on an exact Spotify ID match, returning monthly listeners and followers", async () => {
    const provider = buildProvider();
    const result = await provider.enrichArtist(BASE_INPUT);

    expect(result.status).toBe("success");
    expect(result.matchMethod).toBe("spotify_id");
    expect(result.matchConfidence).toBe("exact");
    expect(result.metrics?.spotifyMonthlyListeners).toBe(500);
    expect(result.metrics?.spotifyFollowers).toBe(300);
    expect(result.metrics?.source).toBe("chartmetric");
  });

  it("returns partial (never 0) when the matched artist has no usable metrics", async () => {
    const client = fakeClient({
      getArtistStats: vi.fn().mockResolvedValue({ data: { latest: null, history: [] }, retryCount: 0, durationMs: 5 })
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("partial");
    expect(result.metrics?.spotifyMonthlyListeners).toBeUndefined();
    expect(result.metrics?.spotifyFollowers).toBeUndefined();
  });

  it("is skipped when the preview/dev request toggle is off", async () => {
    const provider = buildProvider({ env: { VERCEL_ENV: "development" }, requestToggleEnabled: false });
    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result).toEqual({ provider: "chartmetric", status: "skipped", reason: "feature_disabled" });
  });

  it("is skipped when the server-side flag is disabled", async () => {
    const provider = buildProvider({ env: { CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED: "false" } });
    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result).toEqual({ provider: "chartmetric", status: "skipped", reason: "feature_disabled" });
  });

  it("is skipped when the remote feature-flag service is unavailable (fail closed)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"));
    const provider = new ChartmetricArtistEnrichmentProvider({
      env: { ...BASE_ENV, CHARTMETRIC_FLAG_SERVICE_URL: "https://flags.example/unique-1" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      client: fakeClient(),
      identityCache: createChartmetricIdentityCache(),
      metricsCache: createChartmetricMetricsCache(),
      historyCache: createChartmetricHistoryCache(),
      callBudget: new ChartmetricAnalysisCallBudget(5),
      creditBudget: new ChartmetricCreditBudget(null, null)
    });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("remote_flag_unavailable");
  });

  it("is skipped with missing_credentials when no refresh token is configured", async () => {
    const provider = buildProvider({ env: { CHARTMETRIC_REFRESH_TOKEN: "" } });
    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result).toEqual({ provider: "chartmetric", status: "skipped", reason: "missing_credentials" });
  });

  it("returns not_found when the artist can't be resolved at all", async () => {
    const client = fakeClient({ getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 5 }) });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist({ artistName: "Nonexistent Band 9182" });
    expect(result.status).toBe("not_found");
  });

  it("rejects an ambiguous match safely instead of guessing", async () => {
    const client = fakeClient({
      getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 5 }),
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [{ id: 1, name: "Sunset" }, { id: 2, name: "Sunset" }],
        retryCount: 0,
        durationMs: 5
      })
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist({ artistName: "Sunset" });
    expect(result.status).toBe("ambiguous");
    expect(result.reason).toBe("ambiguous_candidates");
    expect(result.metrics).toBeUndefined();
  });

  it("rejects a low-confidence name-only match rather than merging it automatically", async () => {
    const client = fakeClient({
      getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 5 }),
      searchArtistsByName: vi.fn().mockResolvedValue({ data: [{ id: 5, name: "Broad Peak" }], retryCount: 0, durationMs: 5 })
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist({ artistName: "Broad Peak" });
    expect(result.status).toBe("ambiguous");
    expect(result.reason).toBe("low_confidence_match");
    expect(result.metrics).toBeUndefined();
  });

  it("maps a timeout from the client to status timeout", async () => {
    const client = fakeClient({
      getArtistStats: vi.fn().mockRejectedValue(new ChartmetricApiError("timed out", "timeout"))
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("timeout");
  });

  it("maps an authentication error to status error without exposing internals", async () => {
    const client = fakeClient({
      getArtistStats: vi.fn().mockRejectedValue(new ChartmetricApiError("bad token", "auth"))
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("error");
    expect(result.reason).toBe("authentication_error");
  });

  it("maps a rate-limit error to status rate_limited", async () => {
    const client = fakeClient({
      getArtistStats: vi.fn().mockRejectedValue(new ChartmetricApiError("too many requests", "rate_limited"))
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("rate_limited");
  });

  it("maps a malformed response to status error", async () => {
    const client = fakeClient({
      getArtistStats: vi.fn().mockRejectedValue(new ChartmetricApiError("bad json", "malformed"))
    });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("error");
    expect(result.reason).toBe("malformed_response");
  });

  it("serves a second lookup for the same artist from cache (cache hit, no duplicate request)", async () => {
    const getArtistStats = vi
      .fn()
      .mockResolvedValue({ data: { latest: { date: "2026-01-01", spotifyFollowers: 300 }, history: [] }, retryCount: 0, durationMs: 5 });
    const client = fakeClient({ getArtistStats });
    const identityCache = createChartmetricIdentityCache();
    const metricsCache = createChartmetricMetricsCache();

    const providerA = new ChartmetricArtistEnrichmentProvider({
      env: BASE_ENV,
      client,
      identityCache,
      metricsCache,
      historyCache: createChartmetricHistoryCache(),
      callBudget: new ChartmetricAnalysisCallBudget(5),
      creditBudget: new ChartmetricCreditBudget(null, null)
    });
    await providerA.enrichArtist(BASE_INPUT);

    const providerB = new ChartmetricArtistEnrichmentProvider({
      env: BASE_ENV,
      client,
      identityCache,
      metricsCache,
      historyCache: createChartmetricHistoryCache(),
      callBudget: new ChartmetricAnalysisCallBudget(5),
      creditBudget: new ChartmetricCreditBudget(null, null)
    });
    const second = await providerB.enrichArtist(BASE_INPUT);

    expect(second.status).toBe("success");
    expect(client.getArtistStats).toHaveBeenCalledTimes(1);
  });

  it("de-dupes concurrent calls for the same artist within one execution (duplicate request prevention)", async () => {
    const client = fakeClient();
    const identityCache = createChartmetricIdentityCache();
    const metricsCache = createChartmetricMetricsCache();
    const provider = new ChartmetricArtistEnrichmentProvider({
      env: BASE_ENV,
      client,
      identityCache,
      metricsCache,
      historyCache: createChartmetricHistoryCache(),
      callBudget: new ChartmetricAnalysisCallBudget(5),
      creditBudget: new ChartmetricCreditBudget(null, null)
    });

    await Promise.all([provider.enrichArtist(BASE_INPUT), provider.enrichArtist(BASE_INPUT)]);
    expect(client.getArtistBySpotifyId).toHaveBeenCalledTimes(1);
    expect(client.getArtistStats).toHaveBeenCalledTimes(1);
  });

  it("is budget_limited once the per-analysis call cap is reached", async () => {
    const callBudget = new ChartmetricAnalysisCallBudget(1);
    const provider = buildProvider({ callBudget });
    await provider.enrichArtist(BASE_INPUT);

    const second = await provider.enrichArtist(BASE_INPUT);
    expect(second).toEqual({ provider: "chartmetric", status: "budget_limited", reason: "max_calls_per_analysis_reached" });
  });

  it("is budget_limited once the daily credit limit is reached", async () => {
    const creditBudget = new ChartmetricCreditBudget(0, null);
    const provider = buildProvider({ creditBudget });
    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result).toEqual({ provider: "chartmetric", status: "budget_limited", reason: "daily_credit_limit_reached" });
  });

  it("is budget_limited once the monthly credit limit is reached", async () => {
    const creditBudget = new ChartmetricCreditBudget(null, 0);
    const provider = buildProvider({ creditBudget });
    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result).toEqual({ provider: "chartmetric", status: "budget_limited", reason: "monthly_credit_limit_reached" });
  });

  it("never throws even if the underlying client rejects with a non-ChartmetricApiError", async () => {
    const client = fakeClient({ getArtistStats: vi.fn().mockRejectedValue(new Error("boom")) });
    const provider = buildProvider({ client });

    const result = await provider.enrichArtist(BASE_INPUT);
    expect(result.status).toBe("error");
    expect(result.reason).toBe("unexpected_error");
  });
});
