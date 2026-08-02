import { describe, expect, it } from "vitest";
import { calculateGrowthPercent, mapToCandidateMetrics } from "../src/features/artist-enrichment/chartmetric/chartmetric.mapper.js";
import type { ChartmetricAudienceMetrics, ChartmetricHistoryPoint } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

const BASE_METRICS: ChartmetricAudienceMetrics = {
  chartmetricArtistId: "1",
  spotifyMonthlyListeners: 1000,
  fetchedAt: "2026-01-01T00:00:00.000Z",
  matchConfidence: "exact",
  source: "chartmetric"
};

describe("mapToCandidateMetrics", () => {
  it("leaves every additional field undefined (never 0) when nothing extra was reported", () => {
    const metrics = mapToCandidateMetrics(BASE_METRICS, null, null, {});
    expect(metrics.chartmetricArtistScore).toBeUndefined();
    expect(metrics.socialAudience).toBeUndefined();
    expect(metrics.playlistReachScore).toBeUndefined();
    expect(metrics.neighbouringArtistScore).toBeUndefined();
    expect(metrics.spotifyMonthlyListeners).toBe(1000);
  });

  it("merges score, social, playlist and growth data when reported", () => {
    const metrics = mapToCandidateMetrics(
      BASE_METRICS,
      { chartmetricArtistScore: 65, instagramFollowers: 3000 },
      { playlistReachScore: 40, totalCurrentPlaylists: 8 },
      { listenerGrowthPercent: 12.5, followerGrowthPercent: -3.1 },
      0.92
    );

    expect(metrics.chartmetricArtistScore).toBe(65);
    expect(metrics.socialAudience).toEqual({ instagramFollowers: 3000 });
    expect(metrics.playlistReachScore).toBe(40);
    expect(metrics.totalCurrentPlaylists).toBe(8);
    expect(metrics.listenerGrowthPercent).toBe(12.5);
    expect(metrics.followerGrowthPercent).toBe(-3.1);
    expect(metrics.neighbouringArtistScore).toBe(0.92);
  });

  it("omits socialAudience entirely when no social fields were reported", () => {
    const metrics = mapToCandidateMetrics(BASE_METRICS, { chartmetricArtistScore: 10 }, null, {});
    expect(metrics.socialAudience).toBeUndefined();
  });
});

describe("calculateGrowthPercent", () => {
  it("is undefined (not 0) with fewer than two usable points", () => {
    const history: ChartmetricHistoryPoint[] = [{ date: "2026-01-01", spotifyMonthlyListeners: 1000 }];
    expect(calculateGrowthPercent(history, "spotifyMonthlyListeners")).toBeUndefined();
    expect(calculateGrowthPercent([], "spotifyMonthlyListeners")).toBeUndefined();
  });

  it("computes positive growth between the first and last usable point", () => {
    const history: ChartmetricHistoryPoint[] = [
      { date: "2026-01-01", spotifyMonthlyListeners: 1000 },
      { date: "2026-01-15", spotifyMonthlyListeners: 1100 },
      { date: "2026-01-28", spotifyMonthlyListeners: 1200 }
    ];
    expect(calculateGrowthPercent(history, "spotifyMonthlyListeners")).toBe(20);
  });

  it("computes negative growth", () => {
    const history: ChartmetricHistoryPoint[] = [
      { date: "2026-01-01", spotifyFollowers: 2000 },
      { date: "2026-01-28", spotifyFollowers: 1800 }
    ];
    expect(calculateGrowthPercent(history, "spotifyFollowers")).toBe(-10);
  });

  it("ignores points missing the requested field", () => {
    const history: ChartmetricHistoryPoint[] = [
      { date: "2026-01-01", spotifyFollowers: 100 },
      { date: "2026-01-15" },
      { date: "2026-01-28", spotifyFollowers: 150 }
    ];
    expect(calculateGrowthPercent(history, "spotifyFollowers")).toBe(50);
  });
});
