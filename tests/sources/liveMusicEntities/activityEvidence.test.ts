import { describe, expect, it } from "vitest";
import { hasQualifyingActivityEvidence, qualifyLiveMusicEntityCandidates } from "../../../src/sources/liveMusicEntities/activityEvidence.js";
import type { ActivityEvidence } from "../../../src/sources/liveMusicEntities/types.js";

function evidence(overrides: Partial<ActivityEvidence>): ActivityEvidence {
  return {
    kind: "recent_event",
    description: "Played a show last month.",
    sourceUrl: "https://example.com/events/1",
    observedAt: null,
    collectedAt: "2026-07-01T00:00:00.000Z",
    confidence: 0.7,
    ...overrides
  };
}

describe("hasQualifyingActivityEvidence", () => {
  it("rejects a candidate with no evidence at all (directory listing only)", () => {
    expect(hasQualifyingActivityEvidence([])).toBe(false);
  });

  it("qualifies on a single recent event", () => {
    expect(hasQualifyingActivityEvidence([evidence({ kind: "recent_event" })])).toBe(true);
  });

  it("qualifies on a single current programme page", () => {
    expect(hasQualifyingActivityEvidence([evidence({ kind: "current_programme_page" })])).toBe(true);
  });

  it("qualifies on explicit live-music activity from an official source", () => {
    expect(hasQualifyingActivityEvidence([evidence({ kind: "explicit_live_music_activity" })])).toBe(true);
  });

  it("qualifies on organizer confirmation that the structure runs concerts", () => {
    expect(hasQualifyingActivityEvidence([evidence({ kind: "organizes_concerts_confirmation" })])).toBe(true);
  });

  it("does NOT qualify on a single historical music event", () => {
    expect(hasQualifyingActivityEvidence([evidence({ kind: "historical_music_event" })])).toBe(false);
  });

  it("qualifies once multiple historical music events accumulate", () => {
    expect(
      hasQualifyingActivityEvidence([
        evidence({ kind: "historical_music_event", sourceUrl: "https://example.com/events/1" }),
        evidence({ kind: "historical_music_event", sourceUrl: "https://example.com/events/2" })
      ])
    ).toBe(true);
  });
});

describe("qualifyLiveMusicEntityCandidates", () => {
  it("splits candidates into qualified and rejected based on their evidence", () => {
    const qualified = { activityEvidence: [evidence({ kind: "recent_event" })] };
    const rejected = { activityEvidence: [] };

    const result = qualifyLiveMusicEntityCandidates([qualified, rejected]);
    expect(result.qualified).toEqual([qualified]);
    expect(result.rejected).toEqual([rejected]);
  });
});
