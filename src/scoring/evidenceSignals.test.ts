import { describe, expect, it } from "vitest";
import { scoreEvidenceQuality, scoreRecency, scoreSourceConfidence } from "./evidenceSignals.js";

describe("scoreEvidenceQuality", () => {
  it("returns 0 for no evidence", () => {
    expect(scoreEvidenceQuality([])).toBe(0);
  });

  it("scores multiple high-confidence, snippet-backed evidence higher than a single low-confidence entry", () => {
    const strong = scoreEvidenceQuality([
      { sourceUrl: "a", snippet: "quote a", confidence: 0.9 },
      { sourceUrl: "b", snippet: "quote b", confidence: 0.85 }
    ]);
    const weak = scoreEvidenceQuality([{ sourceUrl: "a", snippet: null, confidence: 0.2 }]);

    expect(strong).toBeGreaterThan(weak);
  });
});

describe("scoreRecency", () => {
  it("returns a neutral score when no evidence has a known date", () => {
    expect(scoreRecency([{ sourceUrl: "a" }])).toBe(50);
  });

  it("scores a recent date higher than an old date", () => {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const recent = scoreRecency([{ sourceUrl: "a", createdAt: "2026-06-20T00:00:00.000Z" }], now);
    const old = scoreRecency([{ sourceUrl: "a", createdAt: "2015-01-01T00:00:00.000Z" }], now);

    expect(recent).toBeGreaterThan(old);
  });

  it("takes the most recent evidence when multiple dates are given", () => {
    const now = new Date("2026-07-03T00:00:00.000Z");
    const score = scoreRecency(
      [
        { sourceUrl: "a", createdAt: "2015-01-01T00:00:00.000Z" },
        { sourceUrl: "b", createdAt: "2026-06-20T00:00:00.000Z" }
      ],
      now
    );

    expect(score).toBe(100);
  });
});

describe("scoreSourceConfidence", () => {
  it("returns 0 for no evidence", () => {
    expect(scoreSourceConfidence([])).toBe(0);
  });

  it("scores an official source higher than a search-result source", () => {
    const official = scoreSourceConfidence([{ sourceUrl: "a", sourceType: "official_site" }]);
    const searchResult = scoreSourceConfidence([{ sourceUrl: "a", sourceType: "search_result" }]);

    expect(official).toBeGreaterThan(searchResult);
  });

  it("falls back to the evidence confidence value when no source type is known", () => {
    expect(scoreSourceConfidence([{ sourceUrl: "a", confidence: 0.4 }])).toBe(40);
  });
});
