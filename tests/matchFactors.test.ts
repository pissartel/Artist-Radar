import { describe, expect, it } from "vitest";
import { buildMatchFactors } from "../src/booking/matchFactors.js";
import type { BookingScore, BookingSearchInput, BookingTarget } from "../src/booking/types.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Rennes",
  genre: "punk",
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
    sourceUrl: "https://razibus.net/example.html",
    sourceType: "specialized_scene_agenda",
    genres: ["punk"],
    estimatedCapacity: null,
    contacts: [],
    confidence: 0.6,
    evidence: [],
    ...overrides
  };
}

function buildScore(overrides: Partial<BookingScore> = {}): BookingScore {
  return {
    total: 73,
    confidence: 0.6,
    genreFit: 75,
    genreLevel: "related",
    sizeFit: 50,
    pastProgrammingFit: 50,
    supportSlotPotential: 60,
    locationFit: 55,
    contactability: 20,
    sourceConfidence: 60,
    reason: "",
    warnings: [],
    ...overrides
  };
}

const noDateFactor = { scoreAdjustment: 0, factor: null };

describe("buildMatchFactors", () => {
  it("never surfaces raw component score prose (matches the Razibus regression)", () => {
    const breakdown = buildMatchFactors(input, buildTarget(), buildScore(), noDateFactor, 73);
    const allText = JSON.stringify(breakdown);
    expect(allText).not.toMatch(/Genre fit:/);
    expect(allText).not.toMatch(/Size\/capacity fit:/);
    expect(allText).not.toMatch(/\/100/);
  });

  it("surfaces a positive genre factor for a related match", () => {
    const breakdown = buildMatchFactors(input, buildTarget(), buildScore({ genreLevel: "related" }), noDateFactor, 73);
    expect(breakdown.positiveFactors.some((f) => f.code === "genre_match")).toBe(true);
  });

  it("surfaces a neutral (not negative) contact factor when no contact is found, since this is unknown information, not a confirmed risk", () => {
    const breakdown = buildMatchFactors(input, buildTarget({ contacts: [] }), buildScore(), noDateFactor, 73);
    expect(breakdown.neutralFactors.some((f) => f.code === "contact_available")).toBe(true);
    expect(breakdown.negativeFactors.some((f) => f.code === "contact_available")).toBe(false);
  });

  it("surfaces a positive contact factor when a contact exists", () => {
    const target = buildTarget({
      contacts: [{ type: "email", value: "booking@example.test", sourceUrl: null, confidence: 0.9 }]
    });
    const breakdown = buildMatchFactors(input, target, buildScore(), noDateFactor, 73);
    expect(breakdown.positiveFactors.some((f) => f.code === "contact_available")).toBe(true);
  });

  it("surfaces an unknown-capacity neutral factor (not negative) when capacity is null", () => {
    const breakdown = buildMatchFactors(input, buildTarget({ estimatedCapacity: null }), buildScore(), noDateFactor, 73);
    expect(breakdown.neutralFactors.some((f) => f.code === "capacity_fit")).toBe(true);
    expect(breakdown.negativeFactors.some((f) => f.code === "capacity_fit")).toBe(false);
  });

  it("surfaces an unknown-location neutral factor (not negative) when neither city nor country is known", () => {
    const breakdown = buildMatchFactors(
      input,
      buildTarget({ city: null, country: null }),
      buildScore({ locationFit: 40 }),
      noDateFactor,
      73
    );
    expect(breakdown.neutralFactors.some((f) => f.code === "location_match")).toBe(true);
    expect(breakdown.negativeFactors.some((f) => f.code === "location_match")).toBe(false);
  });

  it("still surfaces a negative location factor when the location is known but outside the target area", () => {
    const breakdown = buildMatchFactors(input, buildTarget(), buildScore({ locationFit: 40 }), noDateFactor, 73);
    expect(breakdown.negativeFactors.some((f) => f.code === "location_match")).toBe(true);
  });

  it("surfaces a neutral (not negative) support-slot factor when no signal either way is found", () => {
    const target = buildTarget({ description: null, lineup: [] });
    const breakdown = buildMatchFactors(input, target, buildScore(), noDateFactor, 73);
    expect(breakdown.neutralFactors.some((f) => f.code === "support_slot_signal")).toBe(true);
    expect(breakdown.negativeFactors.some((f) => f.code === "support_slot_signal")).toBe(false);
  });

  it("includes the date-proximity factor from the injected result", () => {
    const positiveDate = {
      scoreAdjustment: 0,
      factor: { code: "date_lead_time" as const, label: "Enough time to contact the organizer", impact: "positive" as const }
    };
    const breakdown = buildMatchFactors(input, buildTarget(), buildScore(), positiveDate, 73);
    expect(breakdown.positiveFactors).toContainEqual(positiveDate.factor);
  });

  it("flags a likely-complete lineup when several performers are explicitly listed", () => {
    const target = buildTarget({ lineup: ["Band A", "Band B", "Band C"] });
    const breakdown = buildMatchFactors(input, target, buildScore(), noDateFactor, 73);
    expect(breakdown.negativeFactors.some((f) => f.code === "lineup_availability")).toBe(true);
  });

  it("flags a likely-complete lineup when the source text says the lineup is finalized", () => {
    const target = buildTarget({ description: "Line-up complet annoncé pour la soirée" });
    const breakdown = buildMatchFactors(input, target, buildScore(), noDateFactor, 73);
    expect(breakdown.negativeFactors.some((f) => f.code === "lineup_availability")).toBe(true);
  });

  it("does not flag a full lineup when evidence is insufficient", () => {
    const target = buildTarget({ lineup: [], description: null });
    const breakdown = buildMatchFactors(input, target, buildScore(), noDateFactor, 73);
    expect(breakdown.negativeFactors.some((f) => f.code === "lineup_availability")).toBe(false);
  });

  it("surfaces a positive support-slot factor when the source signals an open slot", () => {
    const target = buildTarget({ description: "support tba", lineup: [] });
    const breakdown = buildMatchFactors(input, target, buildScore(), noDateFactor, 73);
    expect(breakdown.positiveFactors.some((f) => f.code === "support_slot_signal")).toBe(true);
  });

  it("surfaces a positive similar-artist factor only when evidence exists", () => {
    const withEvidence = buildTarget({
      derivedFromSimilarArtist: { name: "Reference Band", popularityComparison: "same_tier", matchedGenres: [], sourceUrl: null }
    });
    const withoutEvidence = buildTarget();
    expect(
      buildMatchFactors(input, withEvidence, buildScore(), noDateFactor, 73).positiveFactors.some(
        (f) => f.code === "similar_artist_signal"
      )
    ).toBe(true);
    expect(
      buildMatchFactors(input, withoutEvidence, buildScore(), noDateFactor, 73).positiveFactors.some(
        (f) => f.code === "similar_artist_signal"
      )
    ).toBe(false);
  });
});
