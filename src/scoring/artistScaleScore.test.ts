import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_COMPONENT_SHARE,
  scoreArtistScale,
  type ArtistScaleScoreInput
} from "./artistScaleScore.js";

const NOW = new Date("2026-08-03T00:00:00.000Z");
const RECENT = "2026-07-20T00:00:00.000Z";

describe("scoreArtistScale", () => {
  it("scores a small/emerging artist low with full data coverage", () => {
    const input: ArtistScaleScoreInput = {
      chartmetricArtistScore: 15,
      spotifyMonthlyListeners: 1_200,
      spotifyFollowers: 900,
      instagramFollowers: 800,
      tiktokFollowers: 300,
      youtubeSubscribers: 150,
      youtubeViews: 5_000,
      deezerFans: 60,
      totalCurrentPlaylists: 5,
      listenerGrowthPercent: 3,
      followerGrowthPercent: 2,
      recentShowCount: 4,
      distinctCitiesRecent: 2,
      measuredAt: RECENT,
      matchConfidence: "exact"
    };

    const result = scoreArtistScale(input, { now: NOW });

    expect(result.artistScaleScore).toBeGreaterThan(20);
    expect(result.artistScaleScore).toBeLessThan(45);
    expect(result.scaleBand).toBe("developing");
    expect(result.confidence).toBe("high");
    expect(result.coverage).toBeCloseTo(1, 5);
    expect(result.components.streaming).not.toBeNull();
    expect(result.components.social).not.toBeNull();
    expect(result.components.growth).not.toBeNull();
    expect(result.components.liveActivity).not.toBeNull();
  });

  it("scores a medium/developing artist in the middle band", () => {
    const input: ArtistScaleScoreInput = {
      chartmetricArtistScore: 45,
      spotifyMonthlyListeners: 150_000,
      spotifyFollowers: 90_000,
      instagramFollowers: 60_000,
      tiktokFollowers: 40_000,
      youtubeSubscribers: 20_000,
      youtubeViews: 4_000_000,
      deezerFans: 8_000,
      totalCurrentPlaylists: 120,
      listenerGrowthPercent: 8,
      followerGrowthPercent: 6,
      recentShowCount: 12,
      distinctCitiesRecent: 6,
      measuredAt: RECENT,
      matchConfidence: "high"
    };

    const result = scoreArtistScale(input, { now: NOW });

    expect(result.artistScaleScore).toBeGreaterThanOrEqual(45);
    expect(result.artistScaleScore).toBeLessThan(75);
    expect(["established_local", "regional"]).toContain(result.scaleBand);
    expect(result.confidence).toBe("high");
  });

  it("scores a large/major artist high across every component", () => {
    const input: ArtistScaleScoreInput = {
      chartmetricArtistScore: 95,
      spotifyMonthlyListeners: 40_000_000,
      spotifyFollowers: 25_000_000,
      instagramFollowers: 30_000_000,
      tiktokFollowers: 20_000_000,
      youtubeSubscribers: 15_000_000,
      youtubeViews: 3_000_000_000,
      deezerFans: 5_000_000,
      totalCurrentPlaylists: 1_500,
      listenerGrowthPercent: 5,
      followerGrowthPercent: 4,
      recentShowCount: 35,
      distinctCitiesRecent: 18,
      measuredAt: RECENT,
      matchConfidence: "exact"
    };

    const result = scoreArtistScale(input, { now: NOW });

    expect(result.artistScaleScore).toBeGreaterThan(85);
    expect(result.scaleBand).toBe("major");
    expect(result.confidence).toBe("high");
  });

  it("dampens a viral spike instead of letting one platform dominate the result", () => {
    // A single viral track inflates monthly listeners massively while every
    // other signal (followers, chartmetric score, socials, live activity)
    // stays small — the kind of distortion the issue explicitly calls out.
    const viral: ArtistScaleScoreInput = {
      chartmetricArtistScore: 20,
      spotifyMonthlyListeners: 35_000_000,
      spotifyFollowers: 4_000,
      instagramFollowers: 3_000,
      tiktokFollowers: 2_000,
      recentShowCount: 1,
      measuredAt: RECENT,
      matchConfidence: "medium"
    };

    const result = scoreArtistScale(viral, { now: NOW });

    // Streaming alone would score very high from listeners, but it must not
    // push the overall result into "national"/"major" territory given how
    // small every corroborating signal is.
    expect(result.artistScaleScore).toBeLessThan(70);
    expect(["national", "major"]).not.toContain(result.scaleBand);
  });

  it("scores an inactive artist's liveActivity as a real 0, not missing, when a 0 count is explicitly reported", () => {
    const input: ArtistScaleScoreInput = {
      chartmetricArtistScore: 30,
      spotifyMonthlyListeners: 20_000,
      spotifyFollowers: 15_000,
      recentShowCount: 0,
      distinctCitiesRecent: 0,
      measuredAt: RECENT
    };

    const result = scoreArtistScale(input, { now: NOW });

    expect(result.components.liveActivity).toBe(0);
    expect(result.missingSignals).not.toContain("recentShowCount");
  });

  it("supports incomplete-data artists: only two components present still produces a bounded, non-fabricated result", () => {
    const input: ArtistScaleScoreInput = {
      spotifyMonthlyListeners: 50_000,
      spotifyFollowers: 40_000
    };

    const result = scoreArtistScale(input, { now: NOW });

    expect(result.components.streaming).not.toBeNull();
    expect(result.components.social).toBeNull();
    expect(result.components.growth).toBeNull();
    expect(result.components.liveActivity).toBeNull();
    expect(result.coverage).toBeCloseTo(0.4, 5);
    expect(result.confidence).toBe("low");
    expect(result.artistScaleScore).toBeGreaterThan(0);
    expect(result.artistScaleScore).toBeLessThanOrEqual(100);
  });

  it("returns an unavailable confidence and zero score when no signal is provided at all", () => {
    const result = scoreArtistScale({}, { now: NOW });

    expect(result.artistScaleScore).toBe(0);
    expect(result.confidence).toBe("unavailable");
    expect(result.coverage).toBe(0);
    expect(result.components).toEqual({ streaming: null, social: null, growth: null, liveActivity: null });
  });

  it("never fabricates a growth score or component when no historical baseline is supplied", () => {
    const result = scoreArtistScale(
      { spotifyMonthlyListeners: 100_000, spotifyFollowers: 80_000 },
      { now: NOW }
    );

    expect(result.components.growth).toBeNull();
    expect(result.explanation).toContain("no historical baseline available");
    expect(result.explanation).not.toMatch(/Growth: \d/);
  });

  it("is deterministic for identical inputs", () => {
    const input: ArtistScaleScoreInput = {
      chartmetricArtistScore: 60,
      spotifyMonthlyListeners: 2_000_000,
      spotifyFollowers: 1_200_000,
      instagramFollowers: 900_000,
      recentShowCount: 10,
      measuredAt: RECENT
    };

    const first = scoreArtistScale(input, { now: NOW });
    const second = scoreArtistScale(input, { now: NOW });

    expect(second).toEqual(first);
  });

  it("caps a single fully-present component's weight at the configured maximum", () => {
    const streamingOnly: ArtistScaleScoreInput = {
      chartmetricArtistScore: 100,
      spotifyMonthlyListeners: 50_000_000,
      spotifyFollowers: 30_000_000,
      deezerFans: 10_000_000,
      totalCurrentPlaylists: 2_000,
      engagementScore: 100
    };

    const result = scoreArtistScale(streamingOnly, { now: NOW });

    expect(result.componentWeights.streaming).toBeLessThanOrEqual(DEFAULT_MAX_COMPONENT_SHARE + 1e-9);
    // With only one (maxed-out) component present, the uncapped weight would
    // put the score near 100 — the dominance cap must pull it below that.
    expect(result.artistScaleScore).toBeLessThan(70);
  });

  it("downgrades confidence when the underlying data is stale, without changing the score", () => {
    const input: ArtistScaleScoreInput = {
      chartmetricArtistScore: 70,
      spotifyMonthlyListeners: 3_000_000,
      spotifyFollowers: 2_000_000,
      instagramFollowers: 1_500_000,
      recentShowCount: 15,
      measuredAt: "2024-01-01T00:00:00.000Z"
    };

    const fresh = scoreArtistScale({ ...input, measuredAt: RECENT }, { now: NOW });
    const stale = scoreArtistScale(input, { now: NOW });

    expect(stale.artistScaleScore).toBe(fresh.artistScaleScore);
    expect(stale.confidence).not.toBe(fresh.confidence);
  });

  it("caps confidence at low when the underlying identity match confidence is low", () => {
    const result = scoreArtistScale(
      {
        chartmetricArtistScore: 80,
        spotifyMonthlyListeners: 5_000_000,
        spotifyFollowers: 3_000_000,
        instagramFollowers: 2_000_000,
        recentShowCount: 20,
        measuredAt: RECENT,
        matchConfidence: "low"
      },
      { now: NOW }
    );

    expect(result.confidence).toBe("low");
  });
});
