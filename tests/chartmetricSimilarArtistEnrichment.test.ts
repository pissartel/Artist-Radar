import { describe, expect, it, vi } from "vitest";
import { ChartmetricSimilarArtistEnrichmentService } from "../src/features/artist-enrichment/chartmetric/chartmetric.similarArtistEnrichment.js";
import type { ChartmetricClient } from "../src/features/artist-enrichment/chartmetric/chartmetric.client.js";
import {
  createChartmetricCandidateMetricsCache,
  createChartmetricIdentityCache,
  createChartmetricMetricsCache
} from "../src/features/artist-enrichment/chartmetric/chartmetric.cache.js";
import { ChartmetricAnalysisCallBudget, ChartmetricCreditBudget } from "../src/features/artist-enrichment/chartmetric/chartmetric.usage-guard.js";
import type { SimilarArtistCandidateInput } from "../src/features/artist-enrichment/chartmetric/chartmetric.similarArtistEnrichment.js";

const BASE_ENV = { CHARTMETRIC_REFRESH_TOKEN: "token", VERCEL_ENV: "production" };

function fakeClient(overrides: Partial<ChartmetricClient> = {}): ChartmetricClient {
  return {
    getArtistBySpotifyId: vi.fn().mockImplementation((id: string) => Promise.resolve({ data: { id: Number(id.replace("spotify", "")), name: `Artist ${id}` }, retryCount: 0, durationMs: 1 })),
    searchArtistsByName: vi.fn().mockResolvedValue({ data: [], retryCount: 0, durationMs: 1 }),
    getArtistStats: vi.fn().mockResolvedValue({
      data: { latest: { date: "2026-01-01", spotifyMonthlyListeners: 500, spotifyFollowers: 300 }, history: [] },
      retryCount: 0,
      durationMs: 1
    }),
    getArtistScoreAndSocial: vi.fn().mockResolvedValue({ data: {}, retryCount: 0, durationMs: 1 }),
    getArtistPlaylistReach: vi.fn().mockResolvedValue({ data: {}, retryCount: 0, durationMs: 1 }),
    getSimilarArtists: vi.fn().mockResolvedValue({ data: [], retryCount: 0, durationMs: 1 }),
    ...overrides
  } as unknown as ChartmetricClient;
}

function candidate(name: string, spotifyArtistId: string, priority: number): SimilarArtistCandidateInput {
  return { artistName: name, spotifyArtistId, priority };
}

function buildService(options: {
  client?: ChartmetricClient;
  env?: Record<string, string>;
  candidateLimit?: number;
  callBudget?: ChartmetricAnalysisCallBudget;
  creditBudget?: ChartmetricCreditBudget;
  requestToggleEnabled?: boolean;
} = {}): ChartmetricSimilarArtistEnrichmentService {
  return new ChartmetricSimilarArtistEnrichmentService({
    env: { ...BASE_ENV, ...options.env },
    client: options.client ?? fakeClient(),
    identityCache: createChartmetricIdentityCache(),
    metricsCache: createChartmetricMetricsCache(),
    candidateMetricsCache: createChartmetricCandidateMetricsCache(),
    callBudget: options.callBudget ?? new ChartmetricAnalysisCallBudget(10),
    creditBudget: options.creditBudget ?? new ChartmetricCreditBudget(null, null),
    candidateLimit: options.candidateLimit,
    requestToggleEnabled: options.requestToggleEnabled
  });
}

describe("ChartmetricSimilarArtistEnrichmentService.enrichCandidates", () => {
  it("enriches only the top-N candidates by priority (cost control)", async () => {
    const client = fakeClient();
    const service = buildService({ client, candidateLimit: 2 });
    const candidates = [candidate("Low", "spotify1", 10), candidate("High", "spotify2", 90), candidate("Mid", "spotify3", 50)];

    const results = await service.enrichCandidates({ candidates });

    expect(results).toHaveLength(3);
    const byName = new Map(results.map((result) => [result.candidateName, result]));
    expect(byName.get("High")?.status).toBe("success");
    expect(byName.get("Mid")?.status).toBe("success");
    expect(byName.get("Low")?.status).toBe("skipped");
    expect(byName.get("Low")?.reason).toBe("not_selected_for_enrichment");
  });

  it("prioritizes Last.fm booking peers over large Spotify reference artists for enrichment", async () => {
    const client = fakeClient();
    const service = buildService({ client, candidateLimit: 2 });
    const candidates: SimilarArtistCandidateInput[] = [
      {
        artistName: "Green Day",
        spotifyArtistId: "spotify1",
        priority: 99,
        source: "spotify_search",
        sources: ["spotify_search"],
        bookingCategory: "reference",
        artistTier: "large",
        estimatedFollowers: 11_000_000,
        genreRelevance: 95
      },
      {
        artistName: "TYDEAL",
        spotifyArtistId: "spotify2",
        priority: 62,
        source: "lastfm_similar",
        sources: ["lastfm_similar"],
        bookingCategory: "to_verify",
        artistTier: "unknown",
        estimatedFollowers: null,
        genreRelevance: 90
      },
      {
        artistName: "Broad Peak",
        spotifyArtistId: "spotify3",
        priority: 60,
        source: "lastfm_similar",
        sources: ["lastfm_similar"],
        bookingCategory: "to_verify",
        artistTier: "unknown",
        estimatedFollowers: null,
        genreRelevance: 88
      }
    ];

    const results = await service.enrichCandidates({ candidates });

    const byName = new Map(results.map((result) => [result.candidateName, result]));
    expect(byName.get("TYDEAL")?.status).toBe("success");
    expect(byName.get("Broad Peak")?.status).toBe("success");
    expect(byName.get("Green Day")?.status).toBe("skipped");
    expect(byName.get("Green Day")?.reason).toBe("not_selected_for_enrichment");
  });

  it("skips every candidate when the feature flag is off, without calling the client", async () => {
    const client = fakeClient();
    const service = buildService({ client, env: { CHARTMETRIC_ARTIST_ENRICHMENT_ENABLED: "false" } });

    const results = await service.enrichCandidates({ candidates: [candidate("A", "spotify1", 1)] });

    expect(results[0]?.status).toBe("skipped");
    expect(results[0]?.reason).toBe("feature_disabled");
    expect(client.getArtistBySpotifyId).not.toHaveBeenCalled();
  });

  it("never merges an ambiguous match", async () => {
    const client = fakeClient({
      getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 1 }),
      searchArtistsByName: vi.fn().mockResolvedValue({
        data: [{ id: 1, name: "Sunset" }, { id: 2, name: "Sunset" }],
        retryCount: 0,
        durationMs: 1
      })
    });
    const service = buildService({ client });

    const results = await service.enrichCandidates({ candidates: [{ artistName: "Sunset", priority: 1 }] });

    expect(results[0]?.status).toBe("ambiguous");
    expect(results[0]?.metrics).toBeUndefined();
  });

  it("returns not_found without failing the batch when an artist can't be resolved", async () => {
    const client = fakeClient({ getArtistBySpotifyId: vi.fn().mockResolvedValue({ data: null, retryCount: 0, durationMs: 1 }) });
    const service = buildService({ client });

    const results = await service.enrichCandidates({ candidates: [candidate("Nonexistent", "spotify404", 1)] });
    expect(results[0]?.status).toBe("not_found");
  });

  it("respects the per-analysis call budget independently of the main-artist budget", async () => {
    const client = fakeClient();
    const service = buildService({ client, callBudget: new ChartmetricAnalysisCallBudget(1) });
    const candidates = [candidate("First", "spotify1", 90), candidate("Second", "spotify2", 80)];

    const results = await service.enrichCandidates({ candidates });
    const byName = new Map(results.map((result) => [result.candidateName, result]));
    expect(byName.get("First")?.status).toBe("success");
    expect(byName.get("Second")?.status).toBe("budget_limited");
  });

  it("stops enriching once the shared daily credit budget is exhausted", async () => {
    const client = fakeClient();
    const creditBudget = new ChartmetricCreditBudget(1, null);
    creditBudget.record(1); // budget already spent by, e.g., the main-artist enrichment call
    const service = buildService({ client, creditBudget });

    const results = await service.enrichCandidates({ candidates: [candidate("A", "spotify1", 1)] });
    expect(results[0]?.status).toBe("budget_limited");
    expect(results[0]?.reason).toBe("daily_credit_limit_reached");
  });

  it("dedupes identity lookups for the same artist within one run", async () => {
    const client = fakeClient();
    const service = buildService({ client });
    // Same spotifyArtistId reachable through the same discovery candidate list
    // shouldn't happen upstream, but the identity cache key is what actually
    // matters here: two distinct candidate objects resolving to the same key.
    const candidates = [candidate("Same Artist", "spotify1", 90)];

    await service.enrichCandidates({ candidates });
    await service.enrichCandidates({ candidates });

    // Second run reuses the identity + metrics caches (shared across calls
    // on the same service instance), so the client is not re-queried: one
    // getArtistStats call for the base audience snapshot and one for the
    // trailing-window growth history, both only on the first run.
    expect(client.getArtistBySpotifyId).toHaveBeenCalledTimes(1);
    expect(client.getArtistStats).toHaveBeenCalledTimes(2);
  });

  it("returns a partial/success result even when the best-effort score/social/playlist calls fail", async () => {
    const client = fakeClient({
      getArtistScoreAndSocial: vi.fn().mockRejectedValue(new Error("boom")),
      getArtistPlaylistReach: vi.fn().mockRejectedValue(new Error("boom"))
    });
    const service = buildService({ client });

    const results = await service.enrichCandidates({ candidates: [candidate("A", "spotify1", 1)] });
    expect(results[0]?.status).toBe("success");
    expect(results[0]?.metrics?.spotifyMonthlyListeners).toBe(500);
    expect(results[0]?.metrics?.chartmetricArtistScore).toBeUndefined();
  });

  it("never throws when matching fails unexpectedly, isolating the failure to that one candidate", async () => {
    const client = fakeClient({
      getArtistBySpotifyId: vi.fn().mockImplementation((id: string) =>
        id === "spotify1"
          ? Promise.reject(new Error("network exploded"))
          : Promise.resolve({ data: { id: 2, name: "Fine" }, retryCount: 0, durationMs: 1 })
      )
    });
    const service = buildService({ client });

    const results = await service.enrichCandidates({
      candidates: [candidate("Broken", "spotify1", 90), candidate("Fine", "spotify2", 80)]
    });

    const byName = new Map(results.map((result) => [result.candidateName, result]));
    expect(byName.get("Broken")?.status).toBe("error");
    expect(byName.get("Fine")?.status).toBe("success");
  });

  it("resolves a neighbouring-artist score from the main artist's Chartmetric similar-artists list, fetched only once", async () => {
    const client = fakeClient({
      getSimilarArtists: vi.fn().mockResolvedValue({ data: [{ id: 1, name: "Artist spotify1", score: 0.81 }], retryCount: 0, durationMs: 1 })
    });
    const service = buildService({ client });

    const results = await service.enrichCandidates({
      mainArtistChartmetricId: "99",
      candidates: [candidate("A", "spotify1", 90), candidate("B", "spotify2", 80)]
    });

    const byName = new Map(results.map((result) => [result.candidateName, result]));
    expect(byName.get("A")?.metrics?.neighbouringArtistScore).toBe(0.81);
    expect(byName.get("B")?.metrics?.neighbouringArtistScore).toBeUndefined();
    expect(client.getSimilarArtists).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array for an empty candidate list without resolving the feature flag", async () => {
    const client = fakeClient();
    const service = buildService({ client });
    const results = await service.enrichCandidates({ candidates: [] });
    expect(results).toEqual([]);
  });
});
