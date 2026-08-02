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

  it("leaves audienceSimilarity null (never a fabricated 50) and marks data unavailable when no audience signal exists on either side", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: baseCandidate({ estimatedFollowers: null })
    });
    expect(result.components.audienceSimilarity).toBeNull();
    expect(result.audienceDataAvailable).toBe(false);
  });

  it("never coerces missing Chartmetric metrics into a fabricated score — leaves audienceSimilarity null instead of guessing", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate({ estimatedFollowers: 9_800 })
    });
    // No chartmetricMetrics passed at all: the candidate only has a
    // followers-type number (estimatedFollowers) while the main artist only
    // has a monthly-listeners-type number (chartmetricSpotifyMonthlyListeners).
    // These are different metric types and must never be cross-compared.
    expect(result.components.audienceSimilarity).toBeNull();
    expect(result.audienceDataAvailable).toBe(false);
  });

  it("never compares monthly listeners against followers, even when both sides report a number", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      // Main artist only has a monthly-listeners number.
      mainArtist: { chartmetricSpotifyMonthlyListeners: 10_000, estimatedLevel: "developing" },
      // Candidate only has a followers-type number (no Chartmetric metrics).
      candidate: baseCandidate({ estimatedFollowers: 9_800 })
    });
    expect(result.audienceRatio).toBeNull();
    expect(result.components.audienceSimilarity).toBeNull();
  });

  it("computes a real ratio when both sides report the same metric type (followers vs. followers)", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { spotifyFollowers: 10_000, estimatedLevel: "developing" },
      candidate: baseCandidate({ estimatedFollowers: 9_800 }),
      chartmetricMetrics: candidateMetrics({ spotifyFollowers: 9_800 })
    });
    expect(result.audienceRatio).toBeCloseTo(0.98, 2);
    expect(result.components.audienceSimilarity).toBeGreaterThan(90);
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
      candidate: baseCandidate({ artistTier: "small", estimatedFollowers: 2_000 })
    });
    expect(result.components.careerStageSimilarity).toBeLessThan(50);
  });

  it("leaves recentActivity null (never a fabricated 50) when no Chartmetric growth data is available", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: MAIN_ARTIST,
      candidate: baseCandidate()
    });
    expect(result.components.recentActivity).toBeNull();
  });

  it("leaves careerStageSimilarity null when the candidate's absolute scale can't be resolved at all", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: baseCandidate({ artistTier: "unknown", estimatedFollowers: null })
    });
    expect(result.components.careerStageSimilarity).toBeNull();
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

  it("withholds commercialScore (null) when component coverage falls below the configurable minimum, but still reports coverage/confidence/tier", () => {
    // Only genre/geographic/cross-platform are ever available here — no
    // audience, career-stage or growth data at all (the three always-on
    // components: 0.3 + 0.2 + 0.1 = 0.6 coverage, below the 0.65 minimum).
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: {
        genreRelevance: 70,
        sceneRelevance: 0,
        artistTier: "unknown",
        estimatedFollowers: null,
        evidenceSignalCount: 1
      }
    });
    expect(result.score).toBeNull();
    expect(result.coverage).toBeCloseTo(0.6, 5);
    expect(result.confidence).toBe("low");
    expect(result.tier).toBe("scale_unknown");
    expect(result.components).toEqual({
      genreCompatibility: 70,
      audienceSimilarity: null,
      careerStageSimilarity: null,
      geographicRelevance: 0,
      recentActivity: null,
      crossPlatformEvidence: 20
    });
  });

  it("returns a real commercialScore with high confidence when every component is available", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { chartmetricSpotifyMonthlyListeners: 10_000, estimatedLevel: "developing" },
      candidate: baseCandidate(),
      chartmetricMetrics: candidateMetrics({
        spotifyMonthlyListeners: 10_500,
        listenerGrowthPercent: 5,
        followerGrowthPercent: 5,
        socialAudience: { instagramFollowers: 1000 }
      })
    });
    expect(result.score).not.toBeNull();
    expect(result.coverage).toBe(1);
    expect(result.confidence).toBe("high");
  });

  it("classifies a candidate with reliable major-scale Chartmetric evidence as absoluteScale=major and tier=major_reference (blink-182-style case)", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { chartmetricSpotifyMonthlyListeners: 8_000, estimatedLevel: "developing" },
      candidate: baseCandidate({ artistTier: "unknown", estimatedFollowers: null }),
      chartmetricMetrics: candidateMetrics({ spotifyMonthlyListeners: 8_000_000 })
    });
    expect(result.absoluteScale).toBe("major");
    expect(result.tier).toBe("major_reference");
  });

  it("never assigns absoluteScale=major from the discovery pipeline's own small/medium/large tier alone (only from real numeric evidence)", () => {
    const result = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: baseCandidate({ artistTier: "large", estimatedFollowers: null })
    });
    expect(result.absoluteScale).not.toBe("major");
    expect(result.absoluteScale).toBe("established");
  });

  it("multiple unresolved reference candidates with different genre/geographic signals do not collapse onto an identical score", () => {
    const candidateA = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: { genreRelevance: 70, sceneRelevance: 10, artistTier: "unknown", estimatedFollowers: null, evidenceSignalCount: 1 }
    });
    const candidateB = scoreSimilarArtistCommercialCompatibility({
      mainArtist: { estimatedLevel: "unknown" },
      candidate: { genreRelevance: 45, sceneRelevance: 60, artistTier: "unknown", estimatedFollowers: null, evidenceSignalCount: 2 }
    });
    // Both correctly get a withheld score (insufficient coverage) and
    // scale_unknown, but their breakdowns must reflect their own genuinely
    // different genre/geographic evidence rather than converging on one
    // fabricated fallback number.
    expect(candidateA.score).toBeNull();
    expect(candidateB.score).toBeNull();
    expect(candidateA.components.genreCompatibility).not.toBe(candidateB.components.genreCompatibility);
    expect(candidateA.components.geographicRelevance).not.toBe(candidateB.components.geographicRelevance);
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

  it("classifies as scale_unknown (never same_level or local_compatible_artist) when no ratio is available, regardless of geographic relevance", () => {
    expect(classifySimilarArtistCommercialTier(null, 40)).toBe("scale_unknown");
    expect(classifySimilarArtistCommercialTier(null, 90)).toBe("scale_unknown");
  });

  it("respects custom configurable thresholds", () => {
    const tight = { ...DEFAULT_COMMERCIAL_TIER_THRESHOLDS, sameLevelMaxRatio: 1.05 };
    expect(classifySimilarArtistCommercialTier(1.2, 40, tight)).toBe("slightly_larger");
  });
});
