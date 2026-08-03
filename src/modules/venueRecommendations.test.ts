import { describe, expect, it } from "vitest";
import { findVenueRecommendations } from "./venueRecommendations.js";
import type { SimilarArtistConcertsResult } from "./similarArtistConcerts.js";
import type { ArtistConcert } from "../providers/concerts/ArtistConcertProvider.js";
import type { BookingTarget } from "../booking/types.js";
import type { SimilarArtist } from "../schemas.js";
import type { HistoricalArtistEvent } from "../booking/artistEventHistory.js";

const NOW = new Date("2026-08-03T00:00:00.000Z");

function buildSimilarArtist(overrides: Partial<SimilarArtist> & { name: string }): SimilarArtist {
  return {
    url: null,
    spotifyId: null,
    genres: ["pop punk"],
    city: "Paris",
    country: "France",
    source: "seed",
    sources: ["seed"],
    reason: "test fixture",
    confidence: 0.8,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: 5000,
    estimatedPopularity: 20,
    sizeSignalSource: "spotify_artist",
    genreRelevance: 90,
    localRelevance: 80,
    sizeRelevance: 70,
    sceneRelevance: 80,
    totalRelevance: 85,
    relevanceToUserArtist: 85,
    possibleUse: "co_bill",
    estimatedLevel: "developing",
    evidenceNotes: [],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: { estimatedLevel: "small", confidence: 0.6, sizeSignalSource: "spotify", platforms: {} },
    discardedTags: [],
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null,
    ...overrides
  } as SimilarArtist;
}

function buildConcert(overrides: Partial<ArtistConcert> = {}): ArtistConcert {
  return {
    artist: { name: "Comparable Artist" },
    date: "2026-06-01",
    status: "past",
    venue: { name: "Le Krakatoa", city: "Mérignac", country: "France" },
    sources: [{ provider: "bandsintown", url: "https://www.bandsintown.com/e/1" }],
    confidence: 0.7,
    ...overrides
  };
}

function buildConcertResult(
  artist: SimilarArtist,
  pastConcerts: ArtistConcert[],
  upcomingConcerts: ArtistConcert[] = []
): SimilarArtistConcertsResult {
  return { artist, pastConcerts, upcomingConcerts };
}

function buildBookingTarget(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Le Klub",
    category: "venue",
    city: "Paris",
    country: "France",
    sourceUrl: "https://leklub.fr/agenda",
    sourceType: "venue_official_programming_page",
    genres: ["pop punk"],
    contacts: [],
    confidence: 0.7,
    evidence: [],
    ...overrides
  };
}

describe("findVenueRecommendations", () => {
  it("recommends a venue because comparable artists actually played there, with explainable evidence", () => {
    const artist = buildSimilarArtist({ name: "Bad Frequencies" });
    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France", artistScaleScore: 40 },
      concertHistory: [buildConcertResult(artist, [buildConcert()])],
      now: NOW
    });

    expect(result.recommendations).toHaveLength(1);
    const [venue] = result.recommendations;
    expect(venue.name).toBe("Le Krakatoa");
    expect(venue.comparableArtists).toEqual(["Bad Frequencies"]);
    expect(venue.evidence[0].sourceUrl).toBe("https://www.bandsintown.com/e/1");
    expect(venue.score.venueCompatibilityScore).toBeGreaterThan(0);
  });

  it("merges duplicate venues discovered via different sources/spellings into one recommendation", () => {
    const artistA = buildSimilarArtist({ name: "Bad Frequencies" });
    const artistB = buildSimilarArtist({ name: "Broad Peak" });

    const concertHistory = [
      buildConcertResult(artistA, [
        buildConcert({
          venue: { name: "Le Krakatoa", city: "Mérignac", country: "France" },
          sources: [{ provider: "bandsintown", url: "https://www.bandsintown.com/e/1" }]
        })
      ]),
      buildConcertResult(artistB, [
        buildConcert({
          date: "2026-05-01",
          venue: { name: "Krakatoa", city: "Mérignac", country: "France" },
          sources: [{ provider: "songkick", url: "https://www.krakatoa.net/agenda/broad-peak" }]
        })
      ])
    ];

    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory,
      now: NOW
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].comparableArtists.sort()).toEqual(["Bad Frequencies", "Broad Peak"]);
    expect(result.recommendations[0].evidence).toHaveLength(2);
  });

  it("does not create a venue from a festival occurrence with no distinct venue identity", () => {
    const artist = buildSimilarArtist({ name: "Bad Frequencies" });
    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory: [
        buildConcertResult(artist, [
          buildConcert({
            venue: { name: "Rockstock Festival", city: "Lyon", country: "France" },
            festivalName: "Rockstock Festival"
          })
        ])
      ],
      now: NOW
    });

    expect(result.recommendations).toHaveLength(0);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ rawName: "Rockstock Festival", reason: "festival_not_venue" })
    );
  });

  it("keeps a real venue that happens to host a festival", () => {
    const artist = buildSimilarArtist({ name: "Bad Frequencies" });
    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory: [
        buildConcertResult(artist, [
          buildConcert({
            venue: { name: "Le Krakatoa", city: "Mérignac", country: "France" },
            festivalName: "Rockstock Festival"
          })
        ])
      ],
      now: NOW
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].name).toBe("Le Krakatoa");
  });

  it("rejects a generic/title-only page (e.g. 'Agenda') instead of creating a venue from it", () => {
    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      scrapedVenueCandidates: [
        buildBookingTarget({
          name: "Agenda",
          venueName: "Agenda",
          venueArtistEvidence: [
            {
              venueId: "v1",
              similarArtistId: "bad-frequencies",
              similarArtistName: "Bad Frequencies",
              eventDate: "2026-05-01",
              sourceUrl: "https://quai-m.fr/agenda",
              collectedAt: NOW.toISOString(),
              sourceProvider: "venue_discovery",
              confidence: 0.6
            }
          ]
        })
      ],
      now: NOW
    });

    expect(result.recommendations).toHaveLength(0);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ reason: "generic_or_seo_title" })
    );
  });

  it("rejects a scraped candidate with no comparable-artist evidence at all", () => {
    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      scrapedVenueCandidates: [buildBookingTarget({ name: "Le Klub", venueName: "Le Klub" })],
      now: NOW
    });

    expect(result.recommendations).toHaveLength(0);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ rawName: "Le Klub", reason: "insufficient_evidence" })
    );
  });

  it("keeps stale-but-useful history while scoring it lower than recent history", () => {
    const artist = buildSimilarArtist({ name: "Bad Frequencies" });
    const recentResult = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory: [buildConcertResult(artist, [buildConcert({ date: "2026-07-20" })])],
      now: NOW
    });
    const staleResult = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory: [buildConcertResult(artist, [buildConcert({ date: "2021-01-01" })])],
      now: NOW
    });

    expect(staleResult.recommendations).toHaveLength(1);
    expect(staleResult.recommendations[0].score.components.recentProgrammingActivity)
      .toBeLessThan(recentResult.recommendations[0].score.components.recentProgrammingActivity!);
  });

  it("flags conflicting sources (disagreeing capacity) instead of silently picking one and hiding the disagreement", () => {
    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      scrapedVenueCandidates: [
        buildBookingTarget({
          name: "Le Krakatoa",
          venueName: "Le Krakatoa",
          city: "Mérignac",
          sourceUrl: "https://krakatoa.net",
          estimatedCapacity: 300,
          confidence: 0.6,
          venueArtistEvidence: [
            {
              venueId: "v1",
              similarArtistId: "bad-frequencies",
              similarArtistName: "Bad Frequencies",
              eventDate: "2026-05-01",
              sourceUrl: "https://krakatoa.net/agenda",
              collectedAt: NOW.toISOString(),
              sourceProvider: "venue_discovery",
              confidence: 0.6
            }
          ]
        }),
        buildBookingTarget({
          name: "Le Krakatoa",
          venueName: "Le Krakatoa",
          city: "Mérignac",
          sourceUrl: "https://some-directory.example/venues/krakatoa",
          estimatedCapacity: 900,
          confidence: 0.9,
          venueArtistEvidence: [
            {
              venueId: "v2",
              similarArtistId: "broad-peak",
              similarArtistName: "Broad Peak",
              eventDate: "2026-04-01",
              sourceUrl: "https://some-directory.example/events/broad-peak",
              collectedAt: NOW.toISOString(),
              sourceProvider: "web_search",
              confidence: 0.9
            }
          ]
        })
      ],
      now: NOW
    });

    expect(result.recommendations).toHaveLength(1);
    const [venue] = result.recommendations;
    expect(venue.conflictingSources).toBe(true);
    expect(venue.evidence).toHaveLength(2);
    // Picks the higher-confidence source's reported capacity rather than
    // averaging/fabricating a merged value.
    expect(venue.estimatedCapacity).toBe(900);
  });

  it("merges optional structured historical events (e.g. a future Chartmetric-backed source) without requiring them", () => {
    const withoutStructured = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory: [],
      now: NOW
    });
    expect(withoutStructured.recommendations).toHaveLength(0);

    const structuredEvent: HistoricalArtistEvent = {
      artistName: "Bad Frequencies",
      eventName: "Support show",
      eventDate: "2026-06-10",
      venueName: "Le Ferrailleur",
      city: "Nantes",
      country: "France",
      sourceUrl: "https://example.com/event",
      sourceProvider: "chartmetric",
      confidence: 0.6
    };

    const withStructured = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      structuredHistoricalEvents: [structuredEvent],
      now: NOW
    });

    expect(withStructured.recommendations).toHaveLength(1);
    expect(withStructured.recommendations[0].name).toBe("Le Ferrailleur");
    expect(withStructured.recommendations[0].evidence[0].sourceProvider).toBe("chartmetric");
  });

  it("filters recommendations by city", () => {
    const artistA = buildSimilarArtist({ name: "Bad Frequencies" });
    const artistB = buildSimilarArtist({ name: "Broad Peak" });

    const concertHistory = [
      buildConcertResult(artistA, [buildConcert({ venue: { name: "Le Krakatoa", city: "Mérignac", country: "France" } })]),
      buildConcertResult(artistB, [buildConcert({ venue: { name: "Le Ferrailleur", city: "Nantes", country: "France" } })])
    ];

    const result = findVenueRecommendations({
      targetArtist: { name: "My Band", genres: ["pop punk"], city: "Paris", country: "France" },
      concertHistory,
      filter: { city: "Nantes" },
      now: NOW
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].name).toBe("Le Ferrailleur");
  });
});
