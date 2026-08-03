import { describe, expect, it } from "vitest";
import { compareArtistScaleToSimilarArtists } from "./artistScaleComparison.js";

describe("compareArtistScaleToSimilarArtists", () => {
  it("classifies the analyzed artist as in_line when its score sits at the sample median", () => {
    const result = compareArtistScaleToSimilarArtists(50, [40, 50, 60]);

    expect(result.available).toBe(true);
    expect(result.sampleSize).toBe(3);
    expect(result.median).toBe(50);
    expect(result.average).toBe(50);
    expect(result.minimum).toBe(40);
    expect(result.maximum).toBe(60);
    expect(result.percentile).toBe(50);
    expect(result.differenceToMedian).toBe(0);
    expect(result.differenceToAverage).toBe(0);
    expect(result.classification).toBe("in_line");
  });

  it("classifies well_below when the analyzed artist ranks under every similar artist", () => {
    const result = compareArtistScaleToSimilarArtists(20, [40, 50, 60]);

    expect(result.percentile).toBe(0);
    expect(result.differenceToMedian).toBe(-30);
    expect(result.classification).toBe("well_below");
  });

  it("classifies slightly_below for a moderate below-median rank", () => {
    const result = compareArtistScaleToSimilarArtists(45, [40, 50, 60]);

    expect(result.percentile).toBe(33);
    expect(result.classification).toBe("slightly_below");
  });

  it("classifies slightly_above for a moderate above-median rank", () => {
    const result = compareArtistScaleToSimilarArtists(55, [40, 50, 60]);

    expect(result.percentile).toBe(67);
    expect(result.classification).toBe("slightly_above");
  });

  it("classifies well_above when the analyzed artist ranks over every similar artist", () => {
    const result = compareArtistScaleToSimilarArtists(65, [40, 50, 60]);

    expect(result.percentile).toBe(100);
    expect(result.classification).toBe("well_above");
  });

  it("treats an analyzed artist matching an identical similar-artist cluster as in_line", () => {
    const result = compareArtistScaleToSimilarArtists(50, [50, 50, 50, 50]);

    expect(result.available).toBe(true);
    expect(result.median).toBe(50);
    expect(result.average).toBe(50);
    expect(result.percentile).toBe(50);
    expect(result.differenceToMedian).toBe(0);
    expect(result.classification).toBe("in_line");
  });

  it("ranks an analyzed artist above an identical similar-artist cluster as well_above", () => {
    const result = compareArtistScaleToSimilarArtists(70, [50, 50, 50]);

    expect(result.percentile).toBe(100);
    expect(result.classification).toBe("well_above");
  });

  it("keeps the percentile-based classification robust to a single outlier while the average is visibly skewed", () => {
    // 1000 is an outlier relative to the rest of the sample. The rank-based
    // percentile/classification must not be dragged toward it, while
    // differenceToAverage (which does depend on magnitude) is expected to
    // diverge sharply from differenceToMedian — demonstrating exactly why
    // classification is percentile-based rather than average-based.
    const result = compareArtistScaleToSimilarArtists(25, [10, 20, 30, 1000]);

    expect(result.median).toBe(25);
    expect(result.average).toBe(265);
    expect(result.percentile).toBe(50);
    expect(result.classification).toBe("in_line");
    expect(result.differenceToMedian).toBe(0);
    expect(result.differenceToAverage).toBe(-240);
  });

  it("is available at exactly the minimum similar-artist sample size", () => {
    const result = compareArtistScaleToSimilarArtists(55, [50, 55, 60]);

    expect(result.sampleSize).toBe(3);
    expect(result.available).toBe(true);
  });

  it("hides the comparison when fewer similar artists have a real score than the configured minimum", () => {
    const result = compareArtistScaleToSimilarArtists(55, [50, 60]);

    expect(result.available).toBe(false);
    expect(result.reason).toBe("insufficient_similar_artist_scores");
    expect(result.sampleSize).toBe(2);
    // Descriptive stats are still real, unfabricated numbers computed from
    // the (small) sample that does exist — only the percentile-based
    // comparison/classification is withheld.
    expect(result.median).toBe(55);
    expect(result.average).toBe(55);
    expect(result.percentile).toBeNull();
    expect(result.classification).toBeNull();
  });

  it("hides the comparison entirely when no similar artist has a real score", () => {
    const result = compareArtistScaleToSimilarArtists(55, []);

    expect(result.available).toBe(false);
    expect(result.reason).toBe("insufficient_similar_artist_scores");
    expect(result.sampleSize).toBe(0);
    expect(result.median).toBeNull();
    expect(result.average).toBeNull();
    expect(result.minimum).toBeNull();
    expect(result.maximum).toBeNull();
  });

  it("hides the comparison when the analyzed artist itself has no score, without fabricating a percentile", () => {
    const result = compareArtistScaleToSimilarArtists(null, [40, 50, 60]);

    expect(result.available).toBe(false);
    expect(result.reason).toBe("main_artist_score_unavailable");
    expect(result.sampleSize).toBe(3);
    // Similar-artist descriptive stats don't depend on the main artist's
    // score, so they're still reported.
    expect(result.median).toBe(50);
    expect(result.percentile).toBeNull();
    expect(result.differenceToMedian).toBeNull();
    expect(result.classification).toBeNull();
  });

  it("supports custom thresholds", () => {
    const result = compareArtistScaleToSimilarArtists(55, [40, 50, 60], {
      minSimilarArtistScores: 5,
      inLineMaxPercentileDistance: 10,
      wellBeyondMinPercentileDistance: 25
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe("insufficient_similar_artist_scores");
  });
});
