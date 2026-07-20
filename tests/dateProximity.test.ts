import { describe, expect, it } from "vitest";
import { scoreDateProximity } from "../src/booking/dateProximity.js";

const REFERENCE_DATE = new Date("2026-07-20T00:00:00Z");

describe("scoreDateProximity", () => {
  it("penalizes a past event", () => {
    const result = scoreDateProximity("2026-07-01", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBeLessThan(0);
    expect(result.factor?.impact).toBe("negative");
  });

  it("strongly penalizes a same-day event", () => {
    const result = scoreDateProximity("2026-07-20", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(-20);
    expect(result.factor?.impact).toBe("negative");
  });

  it("strongly penalizes an event 3 days away", () => {
    const result = scoreDateProximity("2026-07-23", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(-20);
  });

  it("meaningfully penalizes an event 10 days away", () => {
    const result = scoreDateProximity("2026-07-30", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(-10);
    expect(result.factor?.detail).toContain("10 days");
  });

  it("lightly penalizes an event 20 days away", () => {
    const result = scoreDateProximity("2026-08-09", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(-4);
  });

  it("does not penalize an event 45 days away", () => {
    const result = scoreDateProximity("2026-09-03", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(0);
    expect(result.factor?.impact).toBe("positive");
  });

  it("does not penalize and returns no factor for a missing date", () => {
    const result = scoreDateProximity(null, REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(0);
    expect(result.factor).toBeNull();
  });

  it("does not penalize and returns no factor for an invalid date", () => {
    const result = scoreDateProximity("not-a-date", REFERENCE_DATE);
    expect(result.scoreAdjustment).toBe(0);
    expect(result.factor).toBeNull();
  });

  it("is deterministic against a fixed reference date, not the real current date", () => {
    const first = scoreDateProximity("2026-07-23", REFERENCE_DATE);
    const second = scoreDateProximity("2026-07-23", REFERENCE_DATE);
    expect(first).toEqual(second);
  });
});
