import { describe, expect, it } from "vitest";
import { analyzeSupportSlotPotential } from "../src/booking/supportSlotPotential.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Rennes",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 5
};

function buildTarget(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Soirée Punk",
    category: "event",
    city: "Rennes",
    country: "France",
    description: null,
    sourceUrl: "https://example.test/show",
    sourceType: "specialized_scene_agenda",
    genres: ["pop punk"],
    estimatedCapacity: null,
    contacts: [],
    confidence: 0.6,
    evidence: [],
    lineup: [],
    ...overrides
  };
}

describe("analyzeSupportSlotPotential", () => {
  it("returns null for opportunity types this analysis does not apply to", () => {
    expect(analyzeSupportSlotPotential(buildTarget({ category: "festival" }))).toBeNull();
    expect(analyzeSupportSlotPotential(buildTarget({ category: "venue" }))).toBeNull();
    expect(analyzeSupportSlotPotential(buildTarget({ category: "promoter" }))).toBeNull();
  });

  it("returns 'likely' with a strong confidence when the source explicitly looks for a support act", () => {
    const target = buildTarget({ description: "Concert pop punk, support TBA.", lineup: ["Headline Band"] });
    const result = analyzeSupportSlotPotential(target, input);

    expect(result).not.toBeNull();
    expect(result?.status).toBe("likely");
    expect(result?.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(result?.reasons.length).toBeGreaterThan(0);
    expect(result?.reasons.join(" ")).not.toMatch(/slot is available/i);
  });

  it("returns 'likely' for French première partie à venir wording", () => {
    const target = buildTarget({ description: "Concert pop punk, première partie à venir." });
    const result = analyzeSupportSlotPotential(target, input);
    expect(result?.status).toBe("likely");
  });

  it("returns 'possible' with a moderate positive signal when no support act is announced but the bill isn't confirmed complete", () => {
    const target = buildTarget({ lineup: ["Headline Band"] });
    const result = analyzeSupportSlotPotential(target, input);

    expect(result?.status).toBe("possible");
    expect(result?.confidenceScore).toBeGreaterThan(30);
    expect(result?.confidenceScore).toBeLessThan(70);
    expect(result?.reasons.some((reason) => /does not confirm/i.test(reason))).toBe(true);
  });

  it("returns 'unlikely' with no bonus when the source says the lineup is complete", () => {
    const target = buildTarget({ description: "Line-up complet annoncé pour la soirée." });
    const result = analyzeSupportSlotPotential(target, input);

    expect(result?.status).toBe("unlikely");
    expect(result?.confidenceScore).toBeLessThan(30);
  });

  it("returns 'unlikely' when several support acts are already announced", () => {
    const target = buildTarget({ lineup: ["Headliner", "Support One", "Support Two"] });
    const result = analyzeSupportSlotPotential(target, input);

    expect(result?.status).toBe("unlikely");
  });

  it("returns 'unknown' (not a negative conclusion) when lineup and evidence are both missing", () => {
    const target = buildTarget({ description: null, lineup: [], evidence: [] });
    const result = analyzeSupportSlotPotential(target, input);

    expect(result?.status).toBe("unknown");
    expect(result?.confidenceScore).toBeGreaterThan(0);
    expect(result?.reasons.join(" ")).not.toMatch(/no support slot|not available/i);
  });

  it("never states that a slot is confirmed available without explicit evidence", () => {
    const cases = [
      buildTarget({ lineup: ["Headline Band"] }),
      buildTarget({ description: null, lineup: [] }),
      buildTarget({ description: "Line-up complet annoncé." })
    ];

    for (const target of cases) {
      const result = analyzeSupportSlotPotential(target, input);
      const text = result?.reasons.join(" ") ?? "";
      expect(text).not.toMatch(/(?<!does not confirm a )slot is available|support slot confirmed/i);
    }
  });
});
