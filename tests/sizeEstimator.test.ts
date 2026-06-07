import { describe, expect, it } from "vitest";
import { estimateArtistSize } from "../src/modules/sizeEstimator.js";

describe("sizeEstimator", () => {
  it("classifies YouTube small, medium and large thresholds", () => {
    expect(
      estimateArtistSize({
        youtubeSubscribers: 500,
        youtubeTotalViews: 50_000
      }).sizeTier
    ).toBe("small");

    expect(
      estimateArtistSize({
        youtubeSubscribers: 5_000,
        youtubeTotalViews: 400_000
      }).sizeTier
    ).toBe("medium");

    expect(
      estimateArtistSize({
        youtubeSubscribers: 50_000,
        youtubeTotalViews: 3_000_000
      }).sizeTier
    ).toBe("large");
  });

  it("classifies Spotify metrics and top track fallback", () => {
    expect(
      estimateArtistSize({
        spotifyFollowers: 2_000,
        spotifyArtistPopularity: 18
      }).sizeTier
    ).toBe("small");

    expect(
      estimateArtistSize({
        spotifyFollowers: 12_000,
        spotifyArtistPopularity: 31
      }).sizeTier
    ).toBe("medium");

    expect(
      estimateArtistSize({
        spotifyFollowers: 600_000,
        spotifyArtistPopularity: 70
      }).sizeTier
    ).toBe("large");

    expect(
      estimateArtistSize({
        spotifyTopTrackPopularityMax: 66,
        spotifyTopTrackPopularityAvg: 61
      }).sizeTier
    ).toBe("large");
  });

  it("uses the safer/lower tier when sources conflict", () => {
    const estimate = estimateArtistSize({
      spotifyFollowers: 2_000,
      spotifyArtistPopularity: 18,
      youtubeSubscribers: 60_000,
      youtubeTotalViews: 3_000_000
    });

    expect(estimate.sizeTier).toBe("small");
    expect(estimate.sizeSignalSource).toBe("mixed");
    expect(estimate.sizeConfidence).toBeLessThan(0.7);
  });

  it("falls back to manual estimates and unknown when no signals exist", () => {
    expect(
      estimateArtistSize({
        manualEstimatedTier: "medium"
      })
    ).toMatchObject({
      sizeTier: "medium",
      estimatedLevel: "developing",
      sizeSignalSource: "manual"
    });

    expect(estimateArtistSize({})).toMatchObject({
      sizeTier: "unknown",
      estimatedLevel: "unknown",
      sizeSignalSource: "unknown",
      sizeReasons: ["No reliable audience metrics available from configured providers."]
    });
  });
});
