import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMERCIAL_TIER_THRESHOLDS,
  classifySimilarArtistCommercialTier,
  scoreSimilarArtistCommercialCompatibility,
  type MainArtistAudienceContext,
  type SimilarArtistCandidateForCommercialScore
} from "../src/scoring/similarArtistCommercialScore.js";
import type { ChartmetricCandidateMetrics } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

const MAIN_ARTIST: MainArtistAudienceContext = {
  chartmetricSpotifyMonthlyListeners: 10_000,
  estimatedLevel: "developing"
};

function baseCandidate(overrides: Partial<SimilarArtistCandidateForCommercialScore> = {}): SimilarArtistCandidateForCommercialScore {
  return {
    genreRelevance: 80,
    sceneRelevance: 50,
    artistTier: "medium",
    estimatedFollowers: 9_500,
    evidenceSignalCount: 2,
    ...overrides
  };
}

function candidateMetrics(overrides: Partial<ChartmetricCandidateMetrics> = {}): ChartmetricCandidateMetrics {
  return {
    chartmetricArtistId: "1",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    matchConfidence: "exact",
    source: "chartmetric",
    ...overrides
  };
}

describe("scoreSimilarArtistCommercialCompatibility", () => {
  it("scores a near-identical audience size close to 100 on audienceSimilarity", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate(),
      chartmetricMetrics: candidateMetrics({ spotifyMonthlyListeners: 10_500 })
    });
    expect(result.components.audienceSimilarity).toBeGreaterThan(90);
    expect(result.audienceDataAvailable).toBe(true);
  });

  it("falls back to a neutral audienceSimilarity and marks data unavailable when no audience signal exists on either side", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: baseCandidate({ estimatedFollowers: null })
    });
    expect(result.components.audienceSimilarity).toBe(50);
    expect(result.audienceDataAvailable).toBe(false);
  });

  it("never coerces missing Chartmetric metrics into a 0 score component — falls back to existing signals instead", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate({ estimatedFollowers: 9_800 })
    });
    // No chartmetricMetrics passed at all; estimatedFollowers fallback keeps
    // audienceSimilarity meaningful rather than defaulting to a bare 0/50 mismatch.
    expect(result.components.audienceSimilarity).toBeGreaterThan(80);
  });

  it("scores identical career stage (both developing) at the maximum", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate({ artistTier: "medium" })
    });
    expect(result.components.careerStageSimilarity).toBe(100);
  });

  it("penalizes career stage distance between a small candidate and an established main artist", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "established" },
      candidate: baseCandidate({ artistTier: "small" })
    });
    expect(result.components.careerStageSimilarity).toBeLessThan(50);
  });

  it("scores recent activity above neutral for positive growth and below for decline", () => {
    const growing = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate(),
      chartmetricMetrics: candidateMetrics({ listenerGrowthPercent: 20, followerGrowthPercent: 20 })
    });
    const declining = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate(),
      chartmetricMetrics: candidateMetrics({ listenerGrowthPercent: -20, followerGrowthPercent: -20 })
    });
    expect(growing.components.recentActivity).toBeGreaterThan(50);
    expect(declining.components.recentActivity).toBeLessThan(50);
  });

  it("keeps genreCompatibility and geographicRelevance as direct passthroughs of the existing discovery signals", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate({ genreRelevance: 91, sceneRelevance: 33 })
    });
    expect(result.components.genreCompatibility).toBe(91);
    expect(result.components.geographicRelevance).toBe(33);
  });
});

describe("classifySimilarArtistCommercialTier", () => {
  it("classifies a near-1x ratio as same_level", () => {
    expect(classifySimilarArtistCommercialTier(1.1, 40)).toBe("same_level");
    expect(classifySimilarArtistCommercialTier(0.7, 40)).toBe("same_level");
  });

  it("classifies increasing ratios through slightly_larger, aspirational and major_reference", () => {
    expect(classifySimilarArtistCommercialTier(2, 40)).toBe("slightly_larger");
    expect(classifySimilarArtistCommercialTier(6, 40)).toBe("aspirational");
    expect(classifySimilarArtistCommercialTier(50, 40)).toBe("major_reference");
  });

  it("classifies a much smaller candidate as same_level rather than inventing a sixth tier", () => {
    expect(classifySimilarArtistCommercialTier(0.05, 40)).toBe("same_level");
  });

  it("does not rely only on Spotify monthly listeners: strong geographic relevance overrides scale into local_compatible_artist", () => {
    const tier = classifySimilarArtistCommercialTier(4, 90, DEFAULT_COMMERCIAL_TIER_THRESHOLDS);
    expect(tier).toBe("local_compatible_artist");
  });

  it("does not classify local_compatible_artist when geographic relevance is high but the size gap is too extreme", () => {
    const tier = classifySimilarArtistCommercialTier(50, 90, DEFAULT_COMMERCIAL_TIER_THRESHOLDS);
    expect(tier).toBe("major_reference");
  });

  it("defaults to the least-overclaiming tier when no ratio is available", () => {
    expect(classifySimilarArtistCommercialTier(null, 40)).toBe("same_level");
    expect(classifySimilarArtistCommercialTier(null, 90)).toBe("local_compatible_artist");
  });

  it("respects custom configurable thresholds", () => {
    const tight = { ...DEFAULT_COMMERCIAL_TIER_THRESHOLDS, sameLevelMaxRatio: 1.05 };
    expect(classifySimilarArtistCommercialTier(1.2, 40, tight)).toBe("slightly_larger");
  });
});
