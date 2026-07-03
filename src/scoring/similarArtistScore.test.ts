import { describe, expect, it } from "vitest";
import { scoreSimilarArtistRelevance, type SimilarArtistScoreInput } from "./similarArtistScore.js";

const RECENT_DATE = new Date().toISOString();

function baseInput(overrides: Partial<SimilarArtistScoreInput> = {}): SimilarArtistScoreInput {
  return {
    targetGenre: "pop punk",
    artistCity: "Paris",
    artistTarget: "France",
    candidate: {
      genres: ["pop punk", "easycore"],
      city: "Paris",
      country: "France",
      url: "https://parispoppunk.example.com",
      sizeTier: "small",
      reason: "Plays pop punk and easycore shows around Paris.",
      evidence: [
        {
          sourceUrl: "https://le-sonic.example.com/programming",
          snippet: "Plays pop punk and easycore shows around Paris.",
          confidence: 0.9,
          createdAt: RECENT_DATE,
          sourceType: "venue_official_programming_page"
        }
      ]
    },
    ...overrides
  };
}

describe("scoreSimilarArtistRelevance", () => {
  it("scores a strong, local, well-evidenced, reachable candidate highly", () => {
    const result = scoreSimilarArtistRelevance(baseInput());

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.components.genreCompatibilityScore).toBeGreaterThan(80);
    expect(result.components.geographicRelevanceScore).toBe(95);
    expect(result.components.contactabilityScore).toBe(70);
    expect(result.explanation).toContain("Deterministic relevance score");
  });

  it("exposes all seven required score components", () => {
    const result = scoreSimilarArtistRelevance(baseInput());

    expect(Object.keys(result.components).sort()).toEqual(
      [
        "artistSizeFitScore",
        "contactabilityScore",
        "evidenceQualityScore",
        "genreCompatibilityScore",
        "geographicRelevanceScore",
        "recencyScore",
        "sourceConfidenceScore"
      ].sort()
    );
  });

  it("scores genre-incompatible candidates lower than compatible ones", () => {
    const compatible = scoreSimilarArtistRelevance(baseInput());
    const incompatible = scoreSimilarArtistRelevance(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          genres: ["chanson"],
          reason: "Chanson act playing acoustic sets.",
          evidence: [
            {
              sourceUrl: "https://le-sonic.example.com/programming",
              snippet: "Plays chanson and acoustic sets around Paris.",
              confidence: 0.9,
              createdAt: RECENT_DATE,
              sourceType: "venue_official_programming_page"
            }
          ]
        }
      })
    );

    expect(incompatible.score).toBeLessThan(compatible.score);
  });

  it("scores a candidate with no public URL lower on contactability than one with a URL", () => {
    const withUrl = scoreSimilarArtistRelevance(baseInput());
    const withoutUrl = scoreSimilarArtistRelevance(baseInput({ candidate: { ...baseInput().candidate, url: null } }));

    expect(withoutUrl.components.contactabilityScore).toBeLessThan(withUrl.components.contactabilityScore);
  });

  it("scores a large reference artist lower on size fit than a small/medium peer", () => {
    const small = scoreSimilarArtistRelevance(baseInput({ candidate: { ...baseInput().candidate, sizeTier: "small" } }));
    const large = scoreSimilarArtistRelevance(baseInput({ candidate: { ...baseInput().candidate, sizeTier: "large" } }));

    expect(large.components.artistSizeFitScore).toBeLessThan(small.components.artistSizeFitScore);
  });

  it("scores a candidate outside the artist's city/target lower on geographic relevance", () => {
    const local = scoreSimilarArtistRelevance(baseInput());
    const distant = scoreSimilarArtistRelevance(
      baseInput({ candidate: { ...baseInput().candidate, city: "Berlin", country: "Germany" } })
    );

    expect(distant.components.geographicRelevanceScore).toBeLessThan(local.components.geographicRelevanceScore);
  });

  it("is deterministic across repeated calls with identical input", () => {
    const input = baseInput();
    const first = scoreSimilarArtistRelevance(input);
    const second = scoreSimilarArtistRelevance(input);

    expect(second).toEqual(first);
  });

  it("keeps the total score within 0-100", () => {
    const result = scoreSimilarArtistRelevance(
      baseInput({
        candidate: { genres: [], city: null, country: null, url: null, sizeTier: "unknown", reason: "", evidence: [] }
      })
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
