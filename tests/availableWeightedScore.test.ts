import { describe, expect, it } from "vitest";
import { calculateAvailableWeightedScore } from "../src/scoring/availableWeightedScore.js";

describe("calculateAvailableWeightedScore", () => {
  it("excludes unavailable dimensions and renormalizes remaining weights", () => {
    expect(calculateAvailableWeightedScore([
      { score: 90, weight: 0.6 },
      { score: null, weight: 0.3 },
      { score: 60, weight: 0.1 }
    ])).toBe(86);
  });

  it("returns zero only when no evidence is available", () => {
    expect(calculateAvailableWeightedScore([{ score: null, weight: 1 }])).toBe(0);
  });
});
