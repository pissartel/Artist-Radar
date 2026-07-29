import { describe, expect, it } from "vitest";
import { hasUsableMetrics, mapToAudienceMetrics, mapToHistoryPoints } from "../src/features/artist-enrichment/chartmetric/chartmetric.mapper.js";

describe("mapToAudienceMetrics", () => {
  it("never converts a missing metric to 0", () => {
    const metrics = mapToAudienceMetrics("1", "spotify1", { latest: null, history: [] }, "exact", "2026-01-01T00:00:00.000Z");
    expect(metrics.spotifyMonthlyListeners).toBeUndefined();
    expect(metrics.spotifyFollowers).toBeUndefined();
    expect(hasUsableMetrics(metrics)).toBe(false);
  });

  it("populates whichever metrics are actually present", () => {
    const metrics = mapToAudienceMetrics(
      "1",
      "spotify1",
      { latest: { date: "2026-01-01", spotifyMonthlyListeners: 1200 }, history: [] },
      "exact",
      "2026-01-02T00:00:00.000Z"
    );
    expect(metrics.spotifyMonthlyListeners).toBe(1200);
    expect(metrics.spotifyFollowers).toBeUndefined();
    expect(metrics.measuredAt).toBe("2026-01-01");
    expect(hasUsableMetrics(metrics)).toBe(true);
  });

  it("preserves a real 0 value (distinct from unavailable)", () => {
    const metrics = mapToAudienceMetrics(
      "1",
      null,
      { latest: { date: "2026-01-01", spotifyFollowers: 0 }, history: [] },
      "high"
    );
    expect(metrics.spotifyFollowers).toBe(0);
    expect(hasUsableMetrics(metrics)).toBe(true);
  });
});

describe("mapToHistoryPoints", () => {
  it("filters out points older than the requested window", () => {
    const now = Date.now();
    const recent = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

    const points = mapToHistoryPoints(
      { latest: null, history: [{ date: old, spotifyFollowers: 10 }, { date: recent, spotifyFollowers: 20 }] },
      30
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.date).toBe(recent);
  });
});
