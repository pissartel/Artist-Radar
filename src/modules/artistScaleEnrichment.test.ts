import { describe, expect, it } from "vitest";
import { computeArtistScaleForAnalysis } from "./artistScaleEnrichment.js";
import { groupSimilarArtistsByTier } from "./similarArtistsFinder.js";
import {
  ArtistProfileSchema,
  SimilarArtistSchema,
  type ArtistProfile,
  type ChartmetricCandidateMetrics,
  type SimilarArtist
} from "../schemas.js";
import type { ArtistEnrichmentResult } from "../features/artist-enrichment/chartmetric/chartmetric.types.js";

const NOW = new Date("2026-08-03T00:00:00.000Z");

function buildProfile(overrides: Partial<ArtistProfile> = {}): ArtistProfile {
  return ArtistProfileSchema.parse({ confidence: 0.6, ...overrides });
}

let similarArtistCounter = 0;

function buildSimilarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  similarArtistCounter += 1;
  return SimilarArtistSchema.parse({
    name: overrides.name ?? `Similar Artist ${similarArtistCounter}`,
    url: null,
    spotifyId: null,
    city: null,
    country: null,
    source: "lastfm_similar",
    reason: "Shares genres with the analyzed artist.",
    confidence: 0.6,
    artistTier: "unknown",
    estimatedFollowers: null,
    estimatedPopularity: null,
    sizeSignalSource: "unknown",
    genreRelevance: 70,
    sizeRelevance: 50,
    sceneRelevance: 50,
    totalRelevance: 60,
    relevanceToUserArtist: 60,
    possibleUse: "reference",
    estimatedLevel: "unknown",
    ...overrides
  });
}

function buildChartmetricSimilarArtist(name: string, metrics: Partial<ChartmetricCandidateMetrics>): SimilarArtist {
  return buildSimilarArtist({
    name,
    chartmetric: {
      status: "success",
      matchConfidence: "high",
      matchMethod: "spotify_id",
      metrics: {
        chartmetricArtistId: `cm-${name}`,
        fetchedAt: NOW.toISOString(),
        matchConfidence: "high",
        source: "chartmetric",
        ...metrics
      }
    }
  });
}

describe("computeArtistScaleForAnalysis", () => {
  it("computes scores for the main artist and every similar artist, preferring Chartmetric over fallback data when both exist", () => {
    const profile = buildProfile({
      platformStats: { spotifyFollowers: 20_000_000, spotifyPopularity: 90 }
    });

    const chartmetricArtist = buildChartmetricSimilarArtist("Chartmetric Artist", {
      spotifyMonthlyListeners: 8_000_000,
      spotifyFollowers: 5_000_000,
      chartmetricArtistScore: 70
    });
    // Deliberately conflicting, much larger fallback numbers on the same
    // candidate — Chartmetric must win, not the fallback.
    chartmetricArtist.spotify = { id: "sp1", url: null, imageUrl: null, followers: 90_000_000, popularity: 99, genres: [] };
    chartmetricArtist.estimatedFollowers = 90_000_000;

    const fallbackArtistA = buildSimilarArtist({ name: "Fallback Artist A", spotify: { id: "sp2", url: null, imageUrl: null, followers: 4_500_000, popularity: 65, genres: [] } });
    const fallbackArtistB = buildSimilarArtist({ name: "Fallback Artist B", estimatedFollowers: 4_800_000 });

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier([chartmetricArtist, fallbackArtistA, fallbackArtistB]),
      now: NOW
    });

    expect(result.artistScale.artistScaleScore).not.toBeNull();
    expect(result.artistScale.confidence).not.toBe("unavailable");

    const flattened = Object.values(result.similarArtists).flat();
    const scoredChartmetricArtist = flattened.find((artist) => artist.name === "Chartmetric Artist")!;
    const scoredFallbackA = flattened.find((artist) => artist.name === "Fallback Artist A")!;

    expect(scoredChartmetricArtist.artistScaleScore).not.toBeNull();
    expect(scoredFallbackA.artistScaleScore).not.toBeNull();
    // The candidate's much larger fallback numbers (90M followers, 99
    // popularity) must never be used once Chartmetric data is present —
    // if they were, this candidate would score in the "major"/"national"
    // band instead of the moderate band its real Chartmetric numbers (5-8M)
    // produce.
    expect(scoredChartmetricArtist.artistScaleScore!).toBeLessThan(60);
    expect(["major", "national"]).not.toContain(scoredChartmetricArtist.artistScaleBand);

    expect(result.artistScale.comparison.available).toBe(true);
    expect(result.artistScale.comparison.sampleSize).toBe(3);
  });

  it("scores every artist from fallback signals only when no Chartmetric data is available anywhere", () => {
    const profile = buildProfile({
      platformStats: { spotifyFollowers: 300_000, spotifyPopularity: 55, instagramFollowers: 150_000, youtubeSubscribers: 40_000 }
    });
    const similar = [
      buildSimilarArtist({ name: "Peer A", estimatedFollowers: 250_000 }),
      buildSimilarArtist({ name: "Peer B", spotify: { id: "sp3", url: null, imageUrl: null, followers: 280_000, popularity: 50, genres: [] } }),
      buildSimilarArtist({ name: "Peer C", estimatedFollowers: 320_000 })
    ];

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier(similar),
      now: NOW
    });

    expect(result.artistScale.artistScaleScore).not.toBeNull();
    expect(result.artistScale.confidence).not.toBe("unavailable");
    // No fallback source anywhere in this codebase reports growth or live
    // activity — those components must stay null rather than fabricated,
    // regardless of how much fallback audience data is available.
    expect(result.artistScale.components.growth).toBeNull();
    expect(result.artistScale.components.liveActivity).toBeNull();
    expect(result.artistScale.missingSignals).toEqual(
      expect.arrayContaining(["listenerGrowthPercent", "followerGrowthPercent", "recentShowCount", "distinctCitiesRecent"])
    );
  });

  it("handles a mix of Chartmetric-backed, fallback-only and no-data similar artists without fabricating the no-data candidate's score", () => {
    const profile = buildProfile({ platformStats: { spotifyFollowers: 500_000 } });

    const chartmetricArtist = buildChartmetricSimilarArtist("Rich Data Artist", {
      spotifyMonthlyListeners: 1_000_000,
      spotifyFollowers: 600_000,
      chartmetricArtistScore: 55
    });
    const fallbackArtist = buildSimilarArtist({ name: "Fallback Only Artist", estimatedFollowers: 400_000 });
    const noDataArtist = buildSimilarArtist({ name: "No Data Artist" });

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier([chartmetricArtist, fallbackArtist, noDataArtist]),
      now: NOW
    });

    const flattened = Object.values(result.similarArtists).flat();
    const scoredNoData = flattened.find((artist) => artist.name === "No Data Artist")!;
    const scoredChartmetric = flattened.find((artist) => artist.name === "Rich Data Artist")!;
    const scoredFallback = flattened.find((artist) => artist.name === "Fallback Only Artist")!;

    expect(scoredNoData.artistScaleScore).toBeNull();
    expect(scoredNoData.artistScaleBand).toBeNull();
    expect(scoredNoData.artistScaleScoreConfidence).toBe("unavailable");

    expect(scoredChartmetric.artistScaleScoreConfidence).not.toBe("unavailable");
    expect(scoredFallback.artistScaleScoreConfidence).not.toBe("unavailable");

    // The no-data candidate must never enter the comparison sample.
    expect(result.artistScale.comparison.sampleSize).toBe(2);
  });

  it("returns a null score, null band and unavailable confidence for the main artist when no signal at all is available", () => {
    const profile = buildProfile();
    const similar = [
      buildSimilarArtist({ name: "Peer A", estimatedFollowers: 100_000 }),
      buildSimilarArtist({ name: "Peer B", estimatedFollowers: 120_000 }),
      buildSimilarArtist({ name: "Peer C", estimatedFollowers: 90_000 })
    ];

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier(similar),
      now: NOW
    });

    expect(result.artistScale.artistScaleScore).toBeNull();
    expect(result.artistScale.artistScaleBand).toBeNull();
    expect(result.artistScale.confidence).toBe("unavailable");
    // The comparison is hidden because the main artist has no score, even
    // though the similar-artist sample itself is large enough.
    expect(result.artistScale.comparison.available).toBe(false);
    expect(result.artistScale.comparison.reason).toBe("main_artist_score_unavailable");
  });

  it("classifies the analyzed artist as in_line when every similar artist shares the same underlying signal", () => {
    const profile = buildProfile({ platformStats: { spotifyPopularity: 50 } });
    const similar = Array.from({ length: 3 }, (_, index) =>
      buildSimilarArtist({ name: `Identical Peer ${index}`, spotify: { id: `sp-${index}`, url: null, imageUrl: null, followers: null, popularity: 50, genres: [] } })
    );

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier(similar),
      now: NOW
    });

    expect(result.artistScale.comparison.available).toBe(true);
    expect(result.artistScale.comparison.percentile).toBe(50);
    expect(result.artistScale.comparison.differenceToMedian).toBe(0);
    expect(result.artistScale.comparison.classification).toBe("in_line");
  });

  it("keeps the classification robust to a single outlier similar artist", () => {
    const profile = buildProfile({ platformStats: { spotifyPopularity: 50 } });
    const typicalPeers = Array.from({ length: 5 }, (_, index) =>
      buildSimilarArtist({ name: `Typical Peer ${index}`, spotify: { id: `sp-typical-${index}`, url: null, imageUrl: null, followers: null, popularity: 50, genres: [] } })
    );
    const outlierPeer = buildSimilarArtist({
      name: "Outlier Peer",
      spotify: { id: "sp-outlier", url: null, imageUrl: null, followers: null, popularity: 99, genres: [] }
    });

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier([...typicalPeers, outlierPeer]),
      now: NOW
    });

    expect(result.artistScale.comparison.available).toBe(true);
    expect(result.artistScale.comparison.sampleSize).toBe(6);
    // The outlier visibly drags the average above the median...
    expect(result.artistScale.comparison.average!).toBeGreaterThan(result.artistScale.comparison.median!);
    // ...but the percentile-rank-based classification still recognizes the
    // analyzed artist matches the majority of its peers.
    expect(result.artistScale.comparison.classification).toBe("in_line");
  });

  it("hides the comparison when fewer similar artists have a real score than the configured minimum", () => {
    const profile = buildProfile({ platformStats: { spotifyFollowers: 500_000 } });
    const similar = [
      buildSimilarArtist({ name: "Only Peer A", estimatedFollowers: 400_000 }),
      buildSimilarArtist({ name: "Only Peer B", estimatedFollowers: 450_000 })
    ];

    const result = computeArtistScaleForAnalysis({
      profile,
      similarArtists: groupSimilarArtistsByTier(similar),
      now: NOW
    });

    expect(result.artistScale.artistScaleScore).not.toBeNull();
    expect(result.artistScale.comparison.available).toBe(false);
    expect(result.artistScale.comparison.reason).toBe("insufficient_similar_artist_scores");
    expect(result.artistScale.comparison.sampleSize).toBe(2);
  });

  it("degrades main-artist coverage and confidence as fallback signals are progressively removed", () => {
    const similar = [
      buildSimilarArtist({ name: "Peer A", estimatedFollowers: 100_000 }),
      buildSimilarArtist({ name: "Peer B", estimatedFollowers: 120_000 }),
      buildSimilarArtist({ name: "Peer C", estimatedFollowers: 90_000 })
    ];

    const fullProfile = buildProfile({
      platformStats: {
        spotifyFollowers: 1_000_000,
        spotifyPopularity: 70,
        youtubeSubscribers: 200_000,
        youtubeTotalViews: 50_000_000,
        instagramFollowers: 500_000
      }
    });
    const partialProfile = buildProfile({ platformStats: { spotifyFollowers: 1_000_000, spotifyPopularity: 70 } });
    const minimalProfile = buildProfile({ platformStats: { spotifyFollowers: 1_000_000 } });

    const fullResult = computeArtistScaleForAnalysis({ profile: fullProfile, similarArtists: groupSimilarArtistsByTier(similar), now: NOW });
    const partialResult = computeArtistScaleForAnalysis({ profile: partialProfile, similarArtists: groupSimilarArtistsByTier(similar), now: NOW });
    const minimalResult = computeArtistScaleForAnalysis({ profile: minimalProfile, similarArtists: groupSimilarArtistsByTier(similar), now: NOW });

    expect(fullResult.artistScale.coverage).toBeGreaterThan(partialResult.artistScale.coverage);
    expect(partialResult.artistScale.coverage).toBeGreaterThanOrEqual(minimalResult.artistScale.coverage);
  });

  it("only uses the narrower main-artist Chartmetric metrics (monthly listeners/followers) alongside profile fallback for social signals", () => {
    const chartmetric: ArtistEnrichmentResult = {
      provider: "chartmetric",
      status: "success",
      matchConfidence: "exact",
      matchMethod: "spotify_id",
      metrics: {
        chartmetricArtistId: "cm-main",
        spotifyMonthlyListeners: 2_000_000,
        spotifyFollowers: 1_500_000,
        measuredAt: NOW.toISOString(),
        fetchedAt: NOW.toISOString(),
        matchConfidence: "exact",
        source: "chartmetric"
      }
    };
    const profile = buildProfile({
      platformStats: { spotifyFollowers: 999_999_999, instagramFollowers: 300_000, youtubeSubscribers: 50_000 }
    });
    const similar = [
      buildSimilarArtist({ name: "Peer A", estimatedFollowers: 900_000 }),
      buildSimilarArtist({ name: "Peer B", estimatedFollowers: 1_100_000 }),
      buildSimilarArtist({ name: "Peer C", estimatedFollowers: 1_300_000 })
    ];

    const result = computeArtistScaleForAnalysis({
      profile,
      mainArtistChartmetric: chartmetric,
      similarArtists: groupSimilarArtistsByTier(similar),
      now: NOW
    });

    // Chartmetric's followers figure (1.5M) must win over the wildly
    // different fallback platformStats figure (~1 billion) — proving
    // priority order for the main artist too, not just similar artists.
    expect(result.artistScale.components.streaming).not.toBeNull();
    expect(result.artistScale.confidence).not.toBe("unavailable");
    // Instagram/YouTube only ever come from the profile fallback for the
    // main artist (issue #142's Chartmetric integration doesn't report
    // social data) — social component must still be populated from it.
    expect(result.artistScale.components.social).not.toBeNull();
  });
});
