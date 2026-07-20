import { describe, expect, it } from "vitest";
import {
  ArtistInputSchema,
  ArtistProfileSchema,
  ConfidenceScoreSchema,
  EventQualityStatusSchema,
  OpportunitySchema,
  SimilarArtistSchema,
  UnifiedOpportunitySchema
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

  it("defaults new by-type display fields (genres, recentEvents) to empty and keeps capacity/relatedArtist unknown", () => {
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

    expect(opportunity.genres).toEqual([]);
    expect(opportunity.venueCapacity).toBeUndefined();
    expect(opportunity.recentEvents).toEqual([]);
    expect(opportunity.lineup).toEqual([]);
    expect(opportunity.ticketUrl).toBeUndefined();
    expect(opportunity.relatedArtist).toBeUndefined();
  });

  it("accepts populated by-type display fields for a venue opportunity", () => {
    const opportunity = OpportunitySchema.parse({
      name: "Le Petit Club",
      type: "venue",
      city: "Paris",
      country: "France",
      source_url: null,
      contact: "booking@example.test",
      reason: "Strong genre match.",
      score: 82,
      suggested_message: "Reach out about an upcoming pop punk night.",
      genres: ["pop punk", "punk rock"],
      venueCapacity: 250,
      recentEvents: ["Neon Riot live", "Local Scene Night"],
      relatedArtist: {
        name: "Neon Riot",
        popularityComparison: "similar_size",
        matchedGenres: ["pop punk"]
      }
    });

    expect(opportunity.genres).toEqual(["pop punk", "punk rock"]);
    expect(opportunity.venueCapacity).toBe(250);
    expect(opportunity.recentEvents).toEqual(["Neon Riot live", "Local Scene Night"]);
    expect(opportunity.relatedArtist?.name).toBe("Neon Riot");
  });

  it("accepts a concert opportunity's lineup and ticket URL when the source reports them (issue #153 review feedback)", () => {
    const opportunity = OpportunitySchema.parse({
      name: "Soirée Punk",
      type: "event",
      city: "Rennes",
      country: "France",
      source_url: "https://razibus.net/example.html",
      contact: null,
      reason: "Strong genre match.",
      score: 82,
      suggested_message: "Reach out.",
      lineup: ["Band A", "Band B"],
      ticketUrl: "https://razibus.net/tickets/example"
    });

    expect(opportunity.lineup).toEqual(["Band A", "Band B"]);
    expect(opportunity.ticketUrl).toBe("https://razibus.net/tickets/example");
  });

  it("rejects a non-URL ticketUrl rather than silently dropping it", () => {
    expect(() =>
      OpportunitySchema.parse({
        name: "Soirée Punk",
        type: "event",
        city: "Rennes",
        country: "France",
        source_url: null,
        contact: null,
        reason: "Strong genre match.",
        score: 82,
        suggested_message: "Reach out.",
        ticketUrl: "not-a-url"
      })
    ).toThrow();
  });

  it("splits matchBreakdown factors into positive/negative/neutral buckets", () => {
    const opportunity = OpportunitySchema.parse({
      name: "Soirée Punk",
      type: "event",
      city: "Rennes",
      country: "France",
      source_url: null,
      contact: null,
      reason: "Strong genre match.",
      score: 73,
      suggested_message: "Reach out.",
      matchBreakdown: {
        overallScore: 73,
        positiveFactors: [{ code: "genre_match", label: "Genre matches the artist", impact: "positive" }],
        negativeFactors: [],
        neutralFactors: [{ code: "capacity_fit", label: "Venue capacity is unknown", impact: "neutral" }]
      }
    });

    expect(opportunity.matchBreakdown?.neutralFactors).toHaveLength(1);
    expect(opportunity.matchBreakdown?.neutralFactors?.[0]?.impact).toBe("neutral");
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
      spotifyId: null,
      source: "mock",
      reason: "Shares genre and city with the artist profile.",
      confidence: 0.7,
      genres: ["pop punk"],
      city: "Paris",
      country: "France",
      artistTier: "small",
      estimatedFollowers: 1000,
      estimatedPopularity: 18,
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "manual",
      genreRelevance: 90,
      sizeRelevance: 80,
      sceneRelevance: 90,
      totalRelevance: 86,
      relevanceToUserArtist: 82,
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
        spotifyId: null,
        source: "mock",
        reason: "Shares genre and city with the artist profile.",
        confidence: 0.7,
        genres: ["pop punk"],
        city: "Paris",
        country: "France",
        artistTier: "unknown",
        estimatedFollowers: null,
        estimatedPopularity: null,
        topTrackPopularityMax: null,
        topTrackPopularityAvg: null,
        topTrackCount: null,
        sizeSignalSource: "unknown",
        genreRelevance: 90,
        sizeRelevance: 35,
        sceneRelevance: 45,
        totalRelevance: 60,
        relevanceToUserArtist: 82,
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
        hiddenSubscriberCount: false,
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

  it("accepts an existing concert-shaped opportunity, preserving compatibility", () => {
    const concert = UnifiedOpportunitySchema.parse({
      id: "concert-1",
      type: "CONCERT",
      name: "Fake Band at The Venue",
      city: "Lyon",
      country: "France",
      sourceUrl: "https://example.com/event",
      eventDate: "2026-09-12",
      venueName: "The Venue",
      headliners: ["Fake Band"],
      lineup: ["Fake Band", "Support Act"],
      ticketUrl: "https://example.com/tickets"
    });

    expect(concert.type).toBe("CONCERT");
    expect(concert.headliners).toEqual(["Fake Band"]);
  });

  it("accepts an existing venue-shaped opportunity, preserving compatibility", () => {
    const venue = UnifiedOpportunitySchema.parse({
      id: "venue-1",
      type: "VENUE",
      name: "The Venue",
      city: "Lyon",
      country: "France",
      contactEmail: null,
      submissionPolicy: "Send a press kit and 2 tour dates.",
      acceptsUnsolicitedSubmissions: true
    });

    expect(venue.type).toBe("VENUE");
    expect(venue.contactEmail).toBeNull();
  });

  it("does not invent contact information when it is uncertain", () => {
    const opportunity = UnifiedOpportunitySchema.parse({
      id: "label-1",
      type: "LABEL",
      name: "Fake Records"
    });

    expect(opportunity.contactEmail).toBeUndefined();
    expect(opportunity.contactFormUrl).toBeUndefined();
  });

  it("rejects event-specific fields on organization opportunity types", () => {
    expect(() =>
      UnifiedOpportunitySchema.parse({
        id: "label-2",
        type: "LABEL",
        name: "Fake Records",
        eventDate: "2026-09-12"
      })
    ).toThrow();
  });

  it("rejects organization-specific fields on event opportunity types", () => {
    expect(() =>
      UnifiedOpportunitySchema.parse({
        id: "concert-2",
        type: "CONCERT",
        name: "Fake Band Live",
        rosterArtists: ["Fake Band"]
      })
    ).toThrow();
  });

  it("rejects an invalid contact email instead of guessing one", () => {
    expect(() =>
      UnifiedOpportunitySchema.parse({
        id: "booker-1",
        type: "BOOKER",
        name: "Fake Booking Agency",
        contactEmail: "not-an-email"
      })
    ).toThrow();
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      UnifiedOpportunitySchema.parse({
        id: "festival-1",
        type: "FESTIVAL",
        name: "Fake Fest",
        latitude: 120,
        longitude: 0
      })
    ).toThrow();
  });

  it("accepts a concert carrying its quality validation status and evidence trail", () => {
    const concert = UnifiedOpportunitySchema.parse({
      id: "concert-3",
      type: "CONCERT",
      name: "Fake Band Live",
      sourceUrl: "https://example.com/event",
      qualityStatus: "PARTIAL",
      qualityIssues: ["missing_venue_name"],
      mergedSourceUrls: ["https://agenda.example.com/event"]
    });

    expect(concert.qualityStatus).toBe("PARTIAL");
    expect(concert.qualityIssues).toEqual(["missing_venue_name"]);
    expect(concert.mergedSourceUrls).toEqual(["https://agenda.example.com/event"]);
  });

  it("rejects an invalid qualityStatus value", () => {
    expect(() => EventQualityStatusSchema.parse("REVIEW")).toThrow();
  });

  it("accepts a concert with a known venue capacity", () => {
    const concert = UnifiedOpportunitySchema.parse({
      id: "concert-4",
      type: "CONCERT",
      name: "Fake Band Live",
      venueCapacity: 300
    });

    expect(concert.venueCapacity).toBe(300);
  });

  it("rejects venue capacity on organization opportunity types", () => {
    expect(() =>
      UnifiedOpportunitySchema.parse({
        id: "label-4",
        type: "LABEL",
        name: "Fake Records",
        venueCapacity: 300
      })
    ).toThrow();
  });

  it("rejects quality validation fields on organization opportunity types", () => {
    expect(() =>
      UnifiedOpportunitySchema.parse({
        id: "label-3",
        type: "LABEL",
        name: "Fake Records",
        qualityStatus: "COMPLETE"
      })
    ).toThrow();
  });
});
