import { describe, expect, it } from "vitest";
import { scoreVenueCompatibility, type VenueCompatibilityScoreInput } from "./venueCompatibilityScore.js";

describe("scoreVenueCompatibility", () => {
  it("scores a well-evidenced, close-match venue highly", () => {
    const input: VenueCompatibilityScoreInput = {
      comparableArtistCount: 4,
      relevantEventCount: 6,
      genreFitScore: 95,
      targetArtistScaleScore: 45,
      venueArtistScaleMedian: 48,
      sameCity: true,
      sameCountry: true,
      latestEventDaysAgo: 30,
      estimatedCapacity: 400,
      sourceConfidenceAverage: 0.85,
      independentSourceCount: 3,
      conflictingSources: false
    };

    const result = scoreVenueCompatibility(input);

    expect(result.venueCompatibilityScore).toBeGreaterThan(75);
    expect(result.confidence).toBe("high");
    expect(result.missingSignals).toHaveLength(0);
  });

  it("leaves components null instead of fabricating them when evidence is missing", () => {
    const input: VenueCompatibilityScoreInput = {
      comparableArtistCount: 1,
      relevantEventCount: 1
    };

    const result = scoreVenueCompatibility(input);

    expect(result.components.genreFit).toBeNull();
    expect(result.components.artistScaleFit).toBeNull();
    expect(result.components.geographicFit).toBeNull();
    expect(result.components.recentProgrammingActivity).toBeNull();
    expect(result.components.venueCapacityFit).toBeNull();
    expect(result.components.sourceConfidence).toBeNull();
    expect(result.missingSignals).toContain("genreFit");
    expect(result.coverage).toBeLessThan(1);
  });

  it("scores zero when there is no comparable-artist history at all", () => {
    const result = scoreVenueCompatibility({ comparableArtistCount: 0, relevantEventCount: 0 });
    expect(result.components.comparableArtistHistory).toBeNull();
  });

  it("decays recentProgrammingActivity for stale history while keeping it above the floor", () => {
    const recent = scoreVenueCompatibility({
      comparableArtistCount: 2,
      relevantEventCount: 2,
      latestEventDaysAgo: 10
    });
    const stale = scoreVenueCompatibility({
      comparableArtistCount: 2,
      relevantEventCount: 2,
      latestEventDaysAgo: 900
    });

    expect(recent.components.recentProgrammingActivity).toBeGreaterThan(stale.components.recentProgrammingActivity!);
    expect(stale.components.recentProgrammingActivity).toBeGreaterThan(0);
  });

  it("penalizes conflicting sources instead of rewarding raw source count", () => {
    const agreeing = scoreVenueCompatibility({
      comparableArtistCount: 2,
      relevantEventCount: 2,
      sourceConfidenceAverage: 0.8,
      independentSourceCount: 3,
      conflictingSources: false
    });
    const conflicting = scoreVenueCompatibility({
      comparableArtistCount: 2,
      relevantEventCount: 2,
      sourceConfidenceAverage: 0.8,
      independentSourceCount: 3,
      conflictingSources: true
    });

    expect(conflicting.components.sourceConfidence).toBeLessThan(agreeing.components.sourceConfidence!);
    expect(conflicting.confidence).not.toBe("high");
  });

  it("never lets one component dominate beyond maxComponentShare", () => {
    const result = scoreVenueCompatibility({
      comparableArtistCount: 10,
      relevantEventCount: 20
    });

    expect(Math.max(...Object.values(result.componentWeights))).toBeLessThanOrEqual(0.55 + 1e-6);
  });

  it("scores venue capacity fit near 100 when capacity matches the target artist's expected band", () => {
    const fitting = scoreVenueCompatibility({
      comparableArtistCount: 1,
      relevantEventCount: 1,
      targetArtistScaleScore: 30,
      estimatedCapacity: 200
    });
    const tooLarge = scoreVenueCompatibility({
      comparableArtistCount: 1,
      relevantEventCount: 1,
      targetArtistScaleScore: 30,
      estimatedCapacity: 15000
    });

    expect(fitting.components.venueCapacityFit).toBe(100);
    expect(tooLarge.components.venueCapacityFit).toBeLessThan(fitting.components.venueCapacityFit!);
  });
});
