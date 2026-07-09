import { describe, expect, it } from "vitest";
import { normalizeOpportunityTitle } from "../src/booking/titleNormalization.js";

describe("normalizeOpportunityTitle", () => {
  it("strips trailing site suffixes and 'en replay' markers", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "music.box PACA - Mina Warren en replay - France TV",
      category: "event",
      city: "Marseille",
      eventDate: "2026-07-08"
    });

    expect(result.displayTitle).toBe("music.box PACA - Mina Warren");
    expect(result.wasRewritten).toBe(true);
  });

  it("strips chained site suffixes (Songkick, Bandsintown, ...)", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Mina Warren - Esdeveniments / Concerts / Festes - Bandsintown",
      category: "event",
      city: null,
      eventDate: null
    });

    expect(result.displayTitle).toBe("Mina Warren - Esdeveniments / Concerts / Festes");
  });

  it("leaves already-clean titles untouched", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Mock Pop Punk Club",
      category: "venue",
      city: "Paris",
      eventDate: null
    });

    expect(result.displayTitle).toBe("Mock Pop Punk Club");
    expect(result.wasRewritten).toBe(false);
  });

  it("falls back to a structured title when the raw title is a bare URL", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "https://www.france.tv/france-3/paris-ile-de-france/musicbox/8270523-music-box.html",
      category: "event",
      city: "Paris",
      eventDate: null,
      derivedFromSimilarArtist: {
        name: "Mina Warren",
        popularityComparison: "similar",
        matchedGenres: [],
        sourceUrl: null
      }
    });

    expect(result.displayTitle).toBe("Mina Warren — live in Paris");
    expect(result.wasRewritten).toBe(true);
  });

  it("falls back to a category-based title when nothing else is known", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "https://example.test/some/opaque/path",
      category: "festival",
      city: null,
      eventDate: null
    });

    expect(result.displayTitle).toBe("Festival opportunity");
  });

  it("builds a summary including date and city when available", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Mock Pop Punk Club",
      category: "venue",
      city: "Paris",
      eventDate: "2026-07-08"
    });

    expect(result.summary).toBe("Mock Pop Punk Club on 2026-07-08 in Paris.");
  });
});
