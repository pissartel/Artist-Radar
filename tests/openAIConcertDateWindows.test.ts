import { describe, expect, it } from "vitest";
import {
  buildDateWindows,
  classifyStatusFromDate,
  isValidEventDate,
  isWithinWindow
} from "../src/providers/openaiConcerts/dateWindows.js";

describe("buildDateWindows", () => {
  it("computes past window as [now - pastMonths, yesterday] and upcoming as [today, now + upcomingMonths]", () => {
    const now = new Date("2026-07-24T12:00:00Z");
    const windows = buildDateWindows(now, 18, 12);

    expect(windows.upcomingStart).toBe("2026-07-24");
    expect(windows.upcomingEnd).toBe("2027-07-24");
    expect(windows.pastEnd).toBe("2026-07-23");
    expect(windows.pastStart).toBe("2025-01-24");
  });
});

describe("classifyStatusFromDate", () => {
  const now = new Date("2026-07-24T00:00:00Z");

  it("classifies a future date as upcoming regardless of model status", () => {
    expect(classifyStatusFromDate("2026-08-01", "unknown", now)).toBe("upcoming");
  });

  it("classifies a past date as past regardless of model status", () => {
    expect(classifyStatusFromDate("2026-01-01", "upcoming", now)).toBe("past");
  });

  it("preserves a cancelled model status even for a future date", () => {
    expect(classifyStatusFromDate("2026-08-01", "cancelled", now)).toBe("cancelled");
  });

  it("preserves a postponed model status", () => {
    expect(classifyStatusFromDate("2026-01-01", "postponed", now)).toBe("postponed");
  });

  it("returns unknown for an unparsable date", () => {
    expect(classifyStatusFromDate("not-a-date", "upcoming", now)).toBe("unknown");
  });
});

describe("isValidEventDate", () => {
  it("accepts a valid ISO date", () => {
    expect(isValidEventDate("2026-08-01")).toBe(true);
  });

  it("rejects an unparsable string", () => {
    expect(isValidEventDate("sometime next year")).toBe(false);
  });
});

describe("isWithinWindow", () => {
  it("accepts a date inside the window (inclusive bounds)", () => {
    expect(isWithinWindow("2026-08-01", "2026-07-24", "2027-07-24")).toBe(true);
    expect(isWithinWindow("2026-07-24", "2026-07-24", "2027-07-24")).toBe(true);
    expect(isWithinWindow("2027-07-24", "2026-07-24", "2027-07-24")).toBe(true);
  });

  it("rejects a date outside the window", () => {
    expect(isWithinWindow("2027-08-01", "2026-07-24", "2027-07-24")).toBe(false);
    expect(isWithinWindow("2026-07-23", "2026-07-24", "2027-07-24")).toBe(false);
  });

  it("rejects an unparsable date", () => {
    expect(isWithinWindow("garbage", "2026-07-24", "2027-07-24")).toBe(false);
  });
});
