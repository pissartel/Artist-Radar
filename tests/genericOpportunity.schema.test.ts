import { describe, expect, it } from "vitest";
import { OpportunityCategorySchema, OpportunitySchema, GenericOpportunitySchema } from "../src/schemas.js";
import type { GenericOpportunity } from "../src/schemas.js";

const baseSource = {
  name: "Official website",
  url: "https://example.com",
  retrievedAt: "2026-07-01",
  confidence: 0.8
};

function baseFor(opportunityType: string, overrides: Partial<GenericOpportunity> = {}): GenericOpportunity {
  return GenericOpportunitySchema.parse({
    id: `${opportunityType}-1`,
    name: `Example ${opportunityType}`,
    opportunityType,
    city: "Lyon",
    country: "France",
    geographicScope: "regional",
    sources: [baseSource],
    confidenceScore: 0.7,
    ...overrides
  });
}

describe("GenericOpportunitySchema", () => {
  it("represents at least one example for every planned opportunity category", () => {
    for (const opportunityType of OpportunityCategorySchema.options) {
      expect(() => baseFor(opportunityType)).not.toThrow();
    }
  });

  it("stores concert-specific details without requiring them for other types", () => {
    const concert = baseFor("concert", {
      concert: {
        eventDate: "2026-09-12",
        dateRange: null,
        doorsTime: "19:00",
        venueName: "Le Sonic",
        headliners: ["Fake Band"],
        lineup: ["Fake Band", "Support Act"],
        ticketUrl: "https://example.com/tickets",
        applicationDeadline: null
      }
    });

    expect(concert.concert?.venueName).toBe("Le Sonic");
    expect(concert.label).toBeUndefined();
  });

  it("stores label-specific details without leaking into other types", () => {
    const label = baseFor("label", {
      label: {
        signedArtists: ["Fake Band"],
        labelGenres: ["metalcore"],
        territory: "Europe",
        acceptsDemos: true,
        demoSubmissionUrl: "https://example.com/demos",
        distributor: "Believe"
      }
    });

    expect(label.label?.acceptsDemos).toBe(true);
    expect(label.concert).toBeUndefined();
  });

  it("stores playlist-specific details", () => {
    const playlist = baseFor("playlist", {
      playlist: {
        platform: "Spotify",
        playlistUrl: "https://open.spotify.com/playlist/example",
        curatorName: "Indie Curator",
        followerCount: 12000,
        submissionPlatform: "SubmitHub",
        submissionUrl: "https://example.com/submit",
        submissionType: "free",
        estimatedGenreFit: 0.65
      }
    });

    expect(playlist.playlist?.followerCount).toBe(12000);
  });

  it("stores producer/studio details for every eligible category", () => {
    const producerDetails = {
      services: ["mixing", "mastering"],
      recordingLocation: "Lyon, France",
      remoteWorkAvailable: true,
      previousArtists: ["Fake Band"],
      genres: ["metalcore"],
      credits: ["Fake Band - Fake Album"],
      portfolioUrl: "https://example.com/portfolio",
      pricingIndication: "Starting at 300 EUR/day"
    };

    for (const opportunityType of [
      "producer",
      "recording_studio",
      "sound_engineer",
      "mixing_engineer",
      "mastering_engineer"
    ]) {
      expect(() => baseFor(opportunityType, { producerOrStudio: producerDetails })).not.toThrow();
    }
  });

  it("allows a generic typeSpecific payload for categories without a dedicated group", () => {
    const manager = baseFor("manager", {
      typeSpecific: {
        rosterArtists: ["Fake Band"],
        acceptsUnsolicitedSubmissions: false
      }
    });

    expect(manager.typeSpecific?.rosterArtists).toEqual(["Fake Band"]);
  });

  it("rejects a type-specific detail group that does not match the opportunity type", () => {
    expect(() =>
      baseFor("venue", {
        label: {
          signedArtists: [],
          labelGenres: [],
          territory: null,
          acceptsDemos: null,
          demoSubmissionUrl: null,
          distributor: null
        }
      })
    ).toThrow();

    expect(() =>
      baseFor("playlist", {
        producerOrStudio: {
          services: [],
          recordingLocation: null,
          remoteWorkAvailable: null,
          previousArtists: [],
          genres: [],
          credits: [],
          portfolioUrl: null,
          pricingIndication: null
        }
      })
    ).toThrow();
  });

  it("requires at least one source reference and a confidence score", () => {
    expect(() =>
      GenericOpportunitySchema.parse({
        id: "no-source-1",
        name: "No source opportunity",
        opportunityType: "venue",
        sources: [],
        confidenceScore: 0.5
      })
    ).toThrow();

    expect(() =>
      GenericOpportunitySchema.parse({
        id: "no-confidence-1",
        name: "No confidence opportunity",
        opportunityType: "venue",
        sources: [baseSource]
      })
    ).toThrow();
  });

  it("never fabricates contact information: uncertain contacts must be null, not invented", () => {
    const opportunity = baseFor("booker", {
      publicEmail: null,
      contactPageUrl: null,
      applicationUrl: null
    });

    expect(opportunity.publicEmail).toBeNull();
    expect(opportunity.contactPageUrl).toBeNull();
    expect(opportunity.applicationUrl).toBeNull();

    expect(() => baseFor("booker", { publicEmail: "not-an-email" })).toThrow();
  });

  it("keeps existing concert Opportunity records representable under the shared model", () => {
    const legacyOpportunity = OpportunitySchema.parse({
      name: "Le Sonic",
      type: "venue",
      city: "Lyon",
      country: "France",
      source_url: "https://example.com",
      contact: null,
      reason: "Relevant local venue for genre and city.",
      score: 80,
      suggested_message: "Hello, I would like to introduce my project.",
      date: "2026-09-12"
    });

    const unified = baseFor("concert", {
      name: legacyOpportunity.name,
      city: legacyOpportunity.city,
      country: legacyOpportunity.country,
      sourceUrl: legacyOpportunity.source_url,
      compatibilityScore: legacyOpportunity.score,
      compatibilityExplanation: legacyOpportunity.reason,
      concert: {
        eventDate: legacyOpportunity.date ?? null,
        dateRange: null,
        doorsTime: null,
        venueName: legacyOpportunity.name,
        headliners: [],
        lineup: [],
        ticketUrl: null,
        applicationDeadline: null
      }
    });

    expect(unified.concert?.eventDate).toBe("2026-09-12");
    expect(unified.compatibilityScore).toBe(80);
  });
});
