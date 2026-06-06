import { describe, expect, it } from "vitest";
import {
  ArtistInputSchema,
  ArtistProfileSchema,
  ConfidenceScoreSchema,
  OpportunitySchema,
  SimilarArtistSchema
} from "../src/schemas.js";

describe("schemas", () => {
  it("validates and normalizes artist input", () => {
    const input = ArtistInputSchema.parse({
      mode: "booking",
      artist: "Fake Band",
      city: "Lyon",
      genre: "metalcore",
      links: ["https://example.com"],
      limit: "5"
    });

    expect(input.limit).toBe(5);
    expect(input.target).toBeNull();
  });

  it("keeps legacy promo input valid without social URL flags", () => {
    const input = ArtistInputSchema.parse({
      mode: "promo",
      artist: "Fake Band",
      city: "Lyon",
      genre: "metalcore",
      links: [],
      limit: 10
    });

    expect(input.mode).toBe("promo");
    expect(input.spotifyUrl).toBeUndefined();
    expect(input.youtubeUrl).toBeUndefined();
    expect(input.instagramUrl).toBeUndefined();
  });

  it("rejects invalid contacts instead of accepting empty uncertain values", () => {
    expect(() =>
      OpportunitySchema.parse({
        name: "Venue",
        type: "venue",
        city: "Lyon",
        country: "France",
        source_url: null,
        contact: "",
        reason: "Relevant local venue.",
        score: 75,
        suggested_message: "Hello, I would like to introduce my project."
      })
    ).toThrow();
  });

  it("allows null contact when uncertain", () => {
    const opportunity = OpportunitySchema.parse({
      name: "Venue",
      type: "venue",
      city: "Lyon",
      country: "France",
      source_url: null,
      contact: null,
      reason: "Relevant local venue.",
      score: 75,
      suggested_message: "Hello, I would like to introduce my project."
    });

    expect(opportunity.contact).toBeNull();
  });

  it("rejects invalid input links and out-of-range limits", () => {
    expect(() =>
      ArtistInputSchema.parse({
        mode: "promo",
        artist: "Fake Band",
        city: "Lyon",
        genre: "metalcore",
        links: ["not-a-url"],
        limit: 10
      })
    ).toThrow();

    expect(() =>
      ArtistInputSchema.parse({
        mode: "promo",
        artist: "Fake Band",
        city: "Lyon",
        genre: "metalcore",
        links: [],
        limit: 51
      })
    ).toThrow();
  });

  it("validates opportunity source URLs and score range", () => {
    const baseOpportunity = {
      name: "Venue",
      type: "venue",
      city: "Lyon",
      country: "France",
      contact: null,
      reason: "Relevant local venue.",
      suggested_message: "Hello, I would like to introduce my project."
    };

    expect(() =>
      OpportunitySchema.parse({
        ...baseOpportunity,
        source_url: "not-a-url",
        score: 75
      })
    ).toThrow();

    expect(() =>
      OpportunitySchema.parse({
        ...baseOpportunity,
        source_url: null,
        score: 101
      })
    ).toThrow();
  });

  it("validates similar artists with nullable URLs", () => {
    const similarArtist = SimilarArtistSchema.parse({
      name: "Local Band",
      url: null,
      source: "mock",
      reason: "Shares genre and city with the artist profile.",
      confidence: 0.7,
      genres: ["pop punk"],
      city: "Paris",
      country: "France",
      artistTier: "small",
      estimatedFollowers: 1000,
      estimatedPopularity: 18,
      relevanceToUserArtist: "Shares genre and city with the artist profile.",
      possibleUse: "co_bill",
      estimatedLevel: "emerging"
    });

    expect(similarArtist.url).toBeNull();
  });

  it("rejects invalid similar artist URLs", () => {
    expect(() =>
      SimilarArtistSchema.parse({
        name: "Local Band",
        url: "site officiel",
        source: "mock",
        reason: "Shares genre and city with the artist profile.",
        confidence: 0.7,
        genres: ["pop punk"],
        city: "Paris",
        country: "France",
        artistTier: "unknown",
        estimatedFollowers: null,
        estimatedPopularity: null,
        relevanceToUserArtist: "Shares genre and city with the artist profile.",
        possibleUse: "unknown",
        estimatedLevel: null
      })
    ).toThrow();
  });

  it("validates artist profiles with platform stats and confidence", () => {
    const profile = ArtistProfileSchema.parse({
      artistName: "Fake Band",
      city: "Lyon",
      country: "France",
      genres: ["metalcore"],
      socialLinks: {
        spotifyUrl: "https://open.spotify.com/artist/example",
        youtubeUrl: null,
        instagramUrl: null
      },
      platformStats: {
        spotifyFollowers: 1200,
        spotifyPopularity: 20,
        youtubeSubscribers: null,
        youtubeTotalViews: null,
        instagramFollowers: null
      },
      estimatedLevel: "emerging",
      confidence: 0.7,
      notes: ["Validated profile."]
    });

    expect(profile.estimatedLevel).toBe("emerging");
  });

  it("rejects confidence outside 0 to 1", () => {
    expect(() => ConfidenceScoreSchema.parse(1.1)).toThrow();
    expect(() => ConfidenceScoreSchema.parse(-0.1)).toThrow();
  });
});
