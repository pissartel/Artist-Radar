import { describe, expect, it } from "vitest";
import { isGenericCtaTitle, normalizeOpportunityTitle } from "../src/booking/titleNormalization.js";

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

  it("decodes HTML entities before displaying the title", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Soir&eacute;e Punk &amp; Chill",
      category: "event",
      city: "Rennes",
      eventDate: null
    });

    expect(result.displayTitle).toBe("Soirée Punk & Chill");
  });

  it("rejects a generic CTA title (the Razibus regression) and falls back to genre + city", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Voir la page de l'&eacute;v&egrave;nement",
      category: "event",
      city: "Rennes",
      eventDate: "2026-07-31",
      genres: ["punk"]
    });

    expect(result.displayTitle).not.toMatch(/voir la page/i);
    expect(result.displayTitle).toBe("Punk concert in Rennes");
    expect(result.wasRewritten).toBe(true);
  });

  it("rejects known English/French generic CTA variants", () => {
    for (const rawTitle of ["View event", "Event details", "Learn more", "More information", "Cliquez ici", "En savoir plus"]) {
      const result = normalizeOpportunityTitle({ rawTitle, category: "event", city: null, eventDate: null });
      expect(result.displayTitle.toLowerCase()).not.toBe(rawTitle.toLowerCase());
    }
  });

  it("falls back to venue + event type when a venue is known but the title is generic", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Voir la page de l'évènement",
      category: "event",
      city: "Rennes",
      eventDate: null,
      venueName: "Ferme de Quincé"
    });

    expect(result.displayTitle).toBe("Concert at Ferme de Quincé in Rennes");
  });
});

describe("isGenericCtaTitle", () => {
  it("detects generic CTA text even when HTML-entity-encoded", () => {
    expect(isGenericCtaTitle("Voir la page de l'&eacute;v&egrave;nement")).toBe(true);
    expect(isGenericCtaTitle("Voir la page de l'évènement")).toBe(true);
    expect(isGenericCtaTitle("View event")).toBe(true);
  });

  it("does not flag a real title", () => {
    expect(isGenericCtaTitle("Soirée Punk - Ferme de Quincé")).toBe(false);
  });
});

// Issue #201 follow-up (real regression, found in live production output):
// SEO/listing-page titles were passing through this final normalization
// step verbatim, since normalizeOpportunityTitle's own isUsable check only
// ever covered generic CTA text ("View event"), bare URLs, and site-suffix
// stripping — never SEO-listing/article-style titles.
describe("normalizeOpportunityTitle rejects SEO/listing/article titles (issue #201 follow-up)", () => {
  it("falls back to a structured title instead of a raw genre/city listing title", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Poppunk Gigs in Paris | DICE",
      category: "venue",
      city: "Paris",
      eventDate: null
    });
    expect(result.displayTitle).not.toContain("Gigs in Paris");
    expect(result.wasRewritten).toBe(true);
  });

  it("falls back to a structured title instead of a raw SEO listing title with a year range", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Emo / Hardcore / Punk Concerts in Paris 2026-2027",
      category: "event",
      city: "Paris",
      eventDate: "2026-11-30"
    });
    expect(result.displayTitle).not.toContain("Concerts in Paris");
  });

  it("falls back to a structured title instead of a raw article/blog headline", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Femmes à l'honneur, rap… Ce qu'il faut retenir de la programmation de Bonjour Minuit à Saint-Brieuc",
      category: "venue",
      city: null,
      eventDate: null
    });
    expect(result.displayTitle).not.toContain("Ce qu'il faut retenir");
  });

  it("falls back to a structured title instead of a 'Top N places' listicle headline", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Top 5 Places to Listen to Live Music in Paris",
      category: "venue",
      city: "Paris",
      eventDate: null
    });
    expect(result.displayTitle).not.toMatch(/top\s+5/i);
  });

  it("falls back to a structured title instead of a magazine-style article headline", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Oi! la la: meet the new wave of French punks making noise",
      category: "venue",
      city: null,
      eventDate: null
    });
    expect(result.displayTitle).not.toMatch(/meet the new wave/i);
  });

  it("strips a trailing 'Mood' ticketing-platform suffix from an otherwise-good title", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "Punk Paradise Paris | Next: Emerson Dias, 4 Jul | Mood",
      category: "venue",
      city: "Paris",
      eventDate: null
    });
    expect(result.displayTitle).toBe("Punk Paradise Paris | Next: Emerson Dias, 4 Jul");
  });

  it("keeps a real, specific razibus-style event title untouched", () => {
    const result = normalizeOpportunityTitle({
      rawTitle: "The Tensions + KarKass | Guinguette de L'Eau de Là le 19 août 2026 à Bourgnac (24)",
      category: "event",
      city: null,
      eventDate: "2026-08-19"
    });
    expect(result.displayTitle).toBe("The Tensions + KarKass | Guinguette de L'Eau de Là le 19 août 2026 à Bourgnac (24)");
    expect(result.wasRewritten).toBe(false);
  });
});
