import { describe, expect, it } from "vitest";
import { AiSimilarArtistSchema } from "../src/ai/schemas/similarArtist.schema.js";

const acceptedArtist = {
  name: "Northlane",
  genres: ["metalcore", "progressive metal"],
  city: "Sydney",
  country: "Australia",
  similarityScore: 82,
  sizeTier: "large" as const,
  genreCompatibility: "strong" as const,
  geographicRelevance: "international" as const,
  category: "musically_similar" as const,
  reason: "Shares progressive metalcore instrumentation and touring circuit.",
  evidence: [
    {
      source: "Last.fm similar artists",
      sourceUrl: "https://last.fm/music/Northlane/+similar",
      confidence: 0.8
    }
  ]
};

const rejectedArtist = {
  name: "Unrelated Pop Act",
  genres: ["pop"],
  similarityScore: null,
  sizeTier: null,
  genreCompatibility: "reject" as const,
  geographicRelevance: null,
  category: "rejected" as const,
  reason: "Genre does not match the target artist's metalcore sound.",
  evidence: [],
  rejectionReason: "Genre mismatch: pop is not compatible with metalcore."
};

describe("AiSimilarArtistSchema", () => {
  it("validates a well-formed accepted artist", () => {
    const result = AiSimilarArtistSchema.safeParse(acceptedArtist);
    expect(result.success).toBe(true);
  });

  it("validates a well-formed rejected artist without similarityScore or evidence", () => {
    const result = AiSimilarArtistSchema.safeParse(rejectedArtist);
    expect(result.success).toBe(true);
  });

  it("accepts an artist without city or country", () => {
    const { city: _city, country: _country, ...withoutLocation } = acceptedArtist;
    const result = AiSimilarArtistSchema.safeParse(withoutLocation);
    expect(result.success).toBe(true);
  });

  it("rejects an accepted artist with no evidence", () => {
    const result = AiSimilarArtistSchema.safeParse({ ...acceptedArtist, evidence: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an accepted artist with a null similarityScore", () => {
    const result = AiSimilarArtistSchema.safeParse({ ...acceptedArtist, similarityScore: null });
    expect(result.success).toBe(false);
  });

  it("rejects an accepted artist with a null sizeTier", () => {
    const result = AiSimilarArtistSchema.safeParse({ ...acceptedArtist, sizeTier: null });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid sizeTier value", () => {
    const result = AiSimilarArtistSchema.safeParse({ ...acceptedArtist, sizeTier: "huge" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const { name: _name, ...missingName } = acceptedArtist;
    const result = AiSimilarArtistSchema.safeParse(missingName);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid genreCompatibility value", () => {
    const result = AiSimilarArtistSchema.safeParse({ ...acceptedArtist, genreCompatibility: "great" });
    expect(result.success).toBe(false);
  });

  it("rejects a genreCompatibility of \"reject\" without a rejectionReason", () => {
    const result = AiSimilarArtistSchema.safeParse({
      ...acceptedArtist,
      genreCompatibility: "reject",
      category: "rejected",
      rejectionReason: undefined
    });
    expect(result.success).toBe(false);
  });

  it("accepts a genreCompatibility of \"reject\" without similarityScore, sizeTier or evidence when rejectionReason is present", () => {
    const result = AiSimilarArtistSchema.safeParse({
      ...acceptedArtist,
      similarityScore: null,
      sizeTier: null,
      evidence: [],
      genreCompatibility: "reject",
      geographicRelevance: null,
      category: "rejected",
      rejectionReason: "Not genre-compatible."
    });
    expect(result.success).toBe(true);
  });

  it("accepts a downgraded weak match that still includes evidence", () => {
    const result = AiSimilarArtistSchema.safeParse({ ...acceptedArtist, genreCompatibility: "weak", category: "scene_adjacent" });
    expect(result.success).toBe(true);
  });
});
