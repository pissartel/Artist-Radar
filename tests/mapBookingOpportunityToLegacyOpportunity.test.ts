import { describe, expect, it } from "vitest";
import { mapBookingOpportunityToLegacyOpportunity } from "../src/pipeline.js";
import type { BookingOpportunity, BookingTarget } from "../src/booking/types.js";

function buildTarget(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Monster's Art",
    category: "venue",
    city: "Marseille",
    country: "France",
    sourceUrl: "https://songkick.com/artists/mina-warren/calendar",
    sourceType: "similar_artist_live_history",
    genres: ["pop punk"],
    contacts: [],
    confidence: 0.7,
    evidence: [],
    ...overrides
  };
}

function buildOpportunity(overrides: Partial<BookingOpportunity> = {}): BookingOpportunity {
  return {
    name: "Monster's Art",
    rawTitle: "Monster's Art",
    displayTitle: "Monster's Art",
    summary: "Venue discovered via similar artist live history.",
    type: "venue",
    category: "venue",
    city: "Marseille",
    country: "France",
    sourceUrl: "https://songkick.com/artists/mina-warren/calendar",
    sourceType: "similar_artist_live_history",
    sourceProvider: "similar_artist_event_history",
    contact: null,
    contactType: "unknown",
    imageUrl: null,
    ticketUrl: null,
    score: 70,
    confidence: 0.7,
    reason: "Similar artists played this venue.",
    warnings: [],
    fitSummary: "Good genre fit.",
    evidence: [],
    suggestedAction: "research",
    eventDate: null,
    dateRange: null,
    isFutureEvent: null,
    isPastEvent: null,
    dateConfidence: "unclear",
    opportunityKind: "historical_signal",
    ageMonths: null,
    derivedFromSimilarArtist: null,
    target: buildTarget(),
    bookingScore: {
      total: 70,
      confidence: 0.7,
      genreFit: 70,
      genreLevel: "exact",
      sizeFit: 50,
      pastProgrammingFit: 50,
      supportSlotPotential: 0,
      locationFit: 50,
      contactability: 0,
      sourceConfidence: 50,
      reason: "Good genre fit.",
      warnings: []
    },
    matchBreakdown: {
      overallScore: 70,
      positiveFactors: [],
      negativeFactors: [],
      neutralFactors: []
    },
    internalReview: {
      needsReview: false,
      missingFields: [],
      confidence: 0.7
    },
    supportSlotPotential: null,
    ...overrides
  };
}

describe("mapBookingOpportunityToLegacyOpportunity (issue #213 review feedback)", () => {
  it("lists every similar artist confirmed at the venue, not only the single most recent one", () => {
    const opportunity = buildOpportunity({
      target: buildTarget({
        venueArtistEvidence: [
          {
            venueId: "monsters-art:marseille:france",
            similarArtistId: "mina-warren",
            similarArtistName: "Mina Warren",
            eventDate: "2026-03-01",
            sourceUrl: "https://songkick.com/artists/mina-warren/calendar",
            collectedAt: "2026-08-01T00:00:00.000Z",
            sourceProvider: "songkick",
            confidence: 0.7
          },
          {
            venueId: "monsters-art:marseille:france",
            similarArtistId: "neon-riot",
            similarArtistName: "Neon Riot",
            eventDate: "2026-01-15",
            sourceUrl: "https://bandsintown.com/e/neon-riot-monsters-art",
            collectedAt: "2026-08-01T00:00:00.000Z",
            sourceProvider: "bandsintown",
            confidence: 0.65
          }
        ]
      })
    });

    const mapped = mapBookingOpportunityToLegacyOpportunity(opportunity);

    expect(mapped.venueArtistEvidence).toEqual([
      {
        similarArtistName: "Mina Warren",
        sourceUrl: "https://songkick.com/artists/mina-warren/calendar",
        eventDate: "2026-03-01",
        eventName: null
      },
      {
        similarArtistName: "Neon Riot",
        sourceUrl: "https://bandsintown.com/e/neon-riot-monsters-art",
        eventDate: "2026-01-15",
        eventName: null
      }
    ]);
  });

  it("returns an empty list when the target has no venue-artist evidence", () => {
    const mapped = mapBookingOpportunityToLegacyOpportunity(buildOpportunity());
    expect(mapped.venueArtistEvidence).toEqual([]);
  });

  it("preserves the internal venue opportunity id for linked concert opportunities", () => {
    const mapped = mapBookingOpportunityToLegacyOpportunity(
      buildOpportunity({
        type: "event",
        category: "event",
        target: buildTarget({
          category: "event",
          venueName: "Glazart",
          venueOpportunityId: "venue-glazart-paris-france"
        }),
        venueOpportunityId: "venue-glazart-paris-france"
      })
    );

    expect(mapped.venueOpportunityId).toBe("venue-glazart-paris-france");
  });
});
