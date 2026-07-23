import { describe, expect, it } from "vitest";
import { assessArtistIdentity, normalizeArtistName } from "../src/providers/openaiConcerts/identity.js";
import type { OpenAIConcertDiscoveryResult } from "../src/providers/openaiConcerts/types.js";

function baseResult(overrides: Partial<OpenAIConcertDiscoveryResult["artist"]> = {}): OpenAIConcertDiscoveryResult {
  return {
    artist: {
      requestedName: "allsinners",
      resolvedName: "allsinners",
      identityConfidence: 0.9,
      identityNotes: null,
      ...overrides
    },
    pastConcerts: [],
    upcomingConcerts: [],
    searchSummary: { pastConcertsFound: 0, upcomingConcertsFound: 0, noUpcomingConcertsFoundInCheckedSources: true, notes: null }
  };
}

describe("normalizeArtistName", () => {
  it("normalizes case, punctuation and a leading 'The'", () => {
    expect(normalizeArtistName("allsinners")).toBe("allsinners");
    expect(normalizeArtistName("All Sinners")).toBe("allsinners");
    expect(normalizeArtistName("All-Sinners")).toBe("allsinners");
    expect(normalizeArtistName("ALL SINNERS")).toBe("allsinners");
  });

  it("strips a leading 'The'", () => {
    expect(normalizeArtistName("The Slugz")).toBe("slugz");
    expect(normalizeArtistName("Slugz")).toBe("slugz");
  });

  it("strips accents", () => {
    expect(normalizeArtistName("Bérurier Noir")).toBe("beruriernoir");
  });
});

describe("assessArtistIdentity", () => {
  it("resolves an exact normalized name match even if the model is only moderately confident", () => {
    const result = baseResult({ resolvedName: "All Sinners", identityConfidence: 0.6 });
    const assessment = assessArtistIdentity("allsinners", result);

    expect(assessment.exactNameMatch).toBe(true);
    expect(assessment.status).toBe("resolved");
  });

  it("rejects a homonymous artist with low confidence and no exact match", () => {
    const result = baseResult({ resolvedName: "Avril Lavigne (tribute act)", identityConfidence: 0.2 });
    const assessment = assessArtistIdentity("Avril Lavigne", result);

    expect(assessment.exactNameMatch).toBe(false);
    expect(assessment.status).toBe("rejected");
  });

  it("marks a non-exact match with mid-range model confidence as ambiguous, not resolved or rejected", () => {
    const result = baseResult({ resolvedName: "All Sinners Tribute", identityConfidence: 0.35 });
    const assessment = assessArtistIdentity("All Sinners", result);

    expect(assessment.exactNameMatch).toBe(false);
    expect(assessment.status).toBe("ambiguous");
  });

  it("still resolves an exact name match even with a low model-reported confidence", () => {
    const result = baseResult({ resolvedName: "allsinners", identityConfidence: 0.1 });
    const assessment = assessArtistIdentity("allsinners", result);

    expect(assessment.exactNameMatch).toBe(true);
    expect(assessment.status).toBe("resolved");
  });

  it("uses official Spotify/website-informed high confidence to resolve identity", () => {
    const result = baseResult({ resolvedName: "Weezer", identityConfidence: 0.95 });
    const assessment = assessArtistIdentity("Weezer", result);

    expect(assessment.status).toBe("resolved");
    expect(assessment.confidence).toBeGreaterThanOrEqual(0.75);
  });
});
