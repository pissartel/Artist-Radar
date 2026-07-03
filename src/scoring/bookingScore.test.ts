import { describe, expect, it } from "vitest";
import { scoreBookingRelevance, type BookingScoreInput } from "./bookingScore.js";

const RECENT_DATE = new Date().toISOString();
const OLD_DATE = "2015-01-01T00:00:00.000Z";

function baseInput(overrides: Partial<BookingScoreInput> = {}): BookingScoreInput {
  return {
    targetGenre: "pop punk",
    artistCity: "Lyon",
    artistTarget: "France",
    artistLevel: "emerging",
    opportunity: {
      type: "venue",
      city: "Lyon",
      reason: "Books pop punk and easycore nights year-round.",
      contact: "booking@le-sonic.example.com",
      evidence: [
        {
          sourceUrl: "https://le-sonic.example.com/programming",
          snippet: "Le Sonic books pop punk and easycore nights year-round in Lyon.",
          confidence: 0.9,
          createdAt: RECENT_DATE,
          sourceType: "venue_official_programming_page"
        }
      ]
    },
    ...overrides
  };
}

describe("scoreBookingRelevance", () => {
  it("scores a strong, well-evidenced, local, recent, contactable opportunity highly", () => {
    const result = scoreBookingRelevance(baseInput());

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.components.genreCompatibilityScore).toBeGreaterThan(80);
    expect(result.components.locationScore).toBe(95);
    expect(result.components.contactabilityScore).toBe(90);
    expect(result.explanation).toContain("Deterministic relevance score");
  });

  it("exposes all seven required score components", () => {
    const result = scoreBookingRelevance(baseInput());

    expect(Object.keys(result.components).sort()).toEqual(
      [
        "artistSizeFitScore",
        "contactabilityScore",
        "evidenceQualityScore",
        "genreCompatibilityScore",
        "locationScore",
        "recencyScore",
        "sourceConfidenceScore"
      ].sort()
    );
  });

  it("scores genre-incompatible opportunities lower than compatible ones", () => {
    const compatible = scoreBookingRelevance(baseInput());
    const incompatible = scoreBookingRelevance(
      baseInput({
        opportunity: {
          ...baseInput().opportunity,
          reason: "Books mostly chanson and jazz nights.",
          evidence: [
            {
              sourceUrl: "https://le-sonic.example.com/programming",
              snippet: "Chanson and jazz programming only.",
              confidence: 0.9,
              createdAt: RECENT_DATE,
              sourceType: "venue_official_programming_page"
            }
          ]
        }
      })
    );

    expect(incompatible.score).toBeLessThan(compatible.score);
    expect(incompatible.components.genreCompatibilityScore).toBeLessThan(compatible.components.genreCompatibilityScore);
  });

  it("penalizes stale sources with a lower recency score than fresh sources", () => {
    const fresh = scoreBookingRelevance(baseInput());
    const stale = scoreBookingRelevance(
      baseInput({ opportunity: { ...baseInput().opportunity, evidence: [{ ...baseInput().opportunity.evidence[0], createdAt: OLD_DATE }] } })
    );

    expect(stale.components.recencyScore).toBeLessThan(fresh.components.recencyScore);
  });

  it("returns a neutral recency score when no evidence has a known date", () => {
    const result = scoreBookingRelevance(
      baseInput({ opportunity: { ...baseInput().opportunity, evidence: [{ sourceUrl: null, snippet: "no date" }] } })
    );

    expect(result.components.recencyScore).toBe(50);
  });

  it("scores a missing contact lower than a verified email contact", () => {
    const withContact = scoreBookingRelevance(baseInput());
    const withoutContact = scoreBookingRelevance(baseInput({ opportunity: { ...baseInput().opportunity, contact: null } }));

    expect(withoutContact.components.contactabilityScore).toBeLessThan(withContact.components.contactabilityScore);
    expect(withoutContact.score).toBeLessThan(withContact.score);
  });

  it("scores a small venue as a better size fit for an emerging artist than a festival", () => {
    const venue = scoreBookingRelevance(baseInput({ artistLevel: "emerging", opportunity: { ...baseInput().opportunity, type: "bar" } }));
    const festival = scoreBookingRelevance(baseInput({ artistLevel: "emerging", opportunity: { ...baseInput().opportunity, type: "festival" } }));

    expect(venue.components.artistSizeFitScore).toBeGreaterThan(festival.components.artistSizeFitScore);
  });

  it("scores an out-of-town opportunity with no target overlap lower than a local one", () => {
    const local = scoreBookingRelevance(baseInput());
    const distant = scoreBookingRelevance(
      baseInput({ artistCity: "Lyon", artistTarget: "France", opportunity: { ...baseInput().opportunity, city: "Berlin" } })
    );

    expect(distant.components.locationScore).toBeLessThan(local.components.locationScore);
  });

  it("is deterministic across repeated calls with identical input", () => {
    const input = baseInput();
    const first = scoreBookingRelevance(input);
    const second = scoreBookingRelevance(input);

    expect(second).toEqual(first);
  });

  it("keeps the total score within 0-100", () => {
    const result = scoreBookingRelevance(
      baseInput({
        artistLevel: "unknown",
        opportunity: { type: "unknown-type", city: null, reason: "", contact: null, evidence: [] }
      })
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
