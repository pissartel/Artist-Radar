import { describe, expect, it } from "vitest";
import {
  analyzeLineupSource,
  applyLineupAnalysis,
  getNextLineupRefreshAt,
  processSupportSlotCandidates,
  reconcileLineupSources
} from "../src/booking/supportSlotDiscovery.js";
import type { BookingTarget } from "../src/booking/types.js";

function target(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "SHORELINE",
    category: "event",
    city: "Paris",
    country: "France",
    sourceUrl: "https://venue.test/shoreline",
    sourceType: "venue_official_programming_page",
    genres: ["pop punk"],
    contacts: [],
    confidence: 0.8,
    evidence: [],
    eventDate: "2026-11-09",
    lineup: ["SHORELINE"],
    ...overrides
  };
}

describe("support-slot lineup discovery", () => {
  it.each([
    ["THEA + 1ère partie", "OPENING_ACT_TBA"],
    ["Support: TBA", "OPENING_ACT_TBA"],
    ["Simple Plan + Neck Deep", "OPENING_ACT_CONFIRMED"],
    ["La suite de la programmation arrive très vite", "LINEUP_INCOMPLETE"]
  ] as const)("classifies %s as %s", (text, status) => {
    expect(analyzeLineupSource({ text }).supportStatus).toBe(status);
  });

  it("keeps a headliner-only event as weaker, unverified evidence", () => {
    const result = analyzeLineupSource({ text: "SHORELINE 09 NOV 2026", knownLineup: ["SHORELINE"] });
    const tba = analyzeLineupSource({ text: "SHORELINE + 1ère partie" });
    expect(result.supportStatus).toBe("NO_SUPPORT_ANNOUNCED");
    expect(result.confidence).toBeLessThan(tba.confidence);
  });

  it("does not treat festivals as headline support opportunities", () => {
    expect(analyzeLineupSource({ text: "Summer Festival", isFestival: true }).supportStatus).toBe("NO_SUPPORT_EXPECTED");
  });

  it("uses the more authoritative source when sources conflict", () => {
    const venue = analyzeLineupSource({ text: "Headliner + Named Opener", sourceType: "venue" });
    const ticketing = analyzeLineupSource({ text: "Support TBA", sourceType: "ticketing" });
    expect(reconcileLineupSources([ticketing, venue]).supportStatus).toBe("OPENING_ACT_CONFIRMED");
  });

  it("closes a potential opportunity when a named opener is later found", () => {
    const initial = applyLineupAnalysis(target(), [analyzeLineupSource({ text: "THEA + 1ère partie", sourceType: "venue" })]);
    expect(initial.opportunityKind).not.toBe("monitor");
    const refreshed = applyLineupAnalysis(initial, [analyzeLineupSource({ text: "THEA + Neck Deep", sourceType: "venue" })]);
    expect(refreshed.lineupAnalysis?.supportStatus).toBe("OPENING_ACT_CONFIRMED");
    expect(refreshed.opportunityKind).toBe("monitor");
  });

  it.each(["cancelled", "postponed"] as const)("invalidates a %s event", (eventStatus) => {
    const result = processSupportSlotCandidates([target({ eventStatus })], new Date("2026-09-18T00:00:00Z"));
    expect(result.targets[0]?.opportunityKind).toBe("monitor");
    expect(result.diagnostics.opportunitiesInvalidated).toBe(1);
  });

  it("schedules configurable refresh intervals and stops after the event", () => {
    const checkedAt = new Date("2026-01-01T00:00:00Z");
    expect(getNextLineupRefreshAt("2026-06-01", checkedAt)?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
    expect(getNextLineupRefreshAt("2026-02-15", checkedAt)?.toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(getNextLineupRefreshAt("2026-01-20", checkedAt)?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(getNextLineupRefreshAt("2025-12-01", checkedAt)).toBeNull();
  });

  it("reports deterministic extraction and opportunity counts", () => {
    const result = processSupportSlotCandidates([
      target({ name: "THEA + 1ère partie", lineup: ["THEA"] }),
      target({ name: "Simple Plan + Neck Deep", lineup: ["Simple Plan", "Neck Deep"] })
    ]);
    expect(result.diagnostics.candidateEvents).toBe(2);
    expect(result.diagnostics.statusCounts.OPENING_ACT_TBA).toBe(1);
    expect(result.diagnostics.statusCounts.OPENING_ACT_CONFIRMED).toBe(1);
    expect(result.diagnostics.opportunitiesCreated).toBe(1);
    expect(result.diagnostics.opportunitiesInvalidated).toBe(1);
  });
});
