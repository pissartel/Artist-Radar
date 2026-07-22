import { describe, expect, it } from "vitest";
import {
  aggregateSceneEvidence,
  aggregateVenueEvidence,
  isRecurringVenue
} from "../src/modules/ticketmasterEvidence.js";
import type { SimilarArtistTicketmasterEvents } from "../src/providers/ticketmaster/types.js";
import type { TicketmasterConcert } from "../src/providers/ticketmaster/normalizeTicketmasterEvent.js";
import type { SimilarArtist } from "../src/schemas.js";

const now = new Date("2026-07-01T00:00:00Z");

function similarArtist(name: string, totalRelevance: number): SimilarArtist {
  return {
    name, url: null, spotifyUrl: null, spotifyId: null, instagramUrl: null, instagramHandle: null,
    youtubeUrl: null, youtubeChannelId: null, youtubeSubscribers: null, youtubeTotalViews: null, youtubeVideoCount: null,
    genres: ["pop punk"], city: "Paris", country: "France", source: "mock", sources: ["test"],
    reason: "Compatible artist.", confidence: 0.85, sourceConfidence: 0.85, artistTier: "small",
    bookingCategory: "local_peer", estimatedFollowers: 3000, estimatedPopularity: null,
    topTrackPopularityMax: null, topTrackPopularityAvg: null, topTrackCount: null, sizeSignalSource: "manual",
    genreRelevance: 90, localRelevance: 90, sizeRelevance: 85, sceneRelevance: 88, totalRelevance,
    relevanceToUserArtist: totalRelevance, possibleUse: "booking_research", estimatedLevel: "emerging",
    evidenceNotes: [], sourceUrls: [], genreEvidence: [], locationEvidence: [], sizeEvidence: [],
    verificationStatus: "verified",
    popularity: { estimatedLevel: "small", confidence: 0.75, sizeSignalSource: "manual", platforms: {} },
    discardedTags: [], matchedQuery: null, searchRelevanceBoost: 0, spotify: null, imageUrl: null,
    imageSource: null, imageConfidence: null
  };
}

function concert(overrides: Partial<TicketmasterConcert> = {}): TicketmasterConcert {
  return {
    provider: "ticketmaster",
    eventId: "evt-1",
    name: "Test Event",
    date: { localDate: "2026-08-01" },
    status: "upcoming",
    venue: { name: "La Maroquinerie", city: "Paris", region: "Île-de-France", country: "France" },
    attractions: [],
    eventType: "concert",
    sourceRetrievedAt: now.toISOString(),
    ...overrides
  };
}

function entry(artist: SimilarArtist, concerts: { past?: TicketmasterConcert[]; upcoming?: TicketmasterConcert[] }): SimilarArtistTicketmasterEvents {
  return {
    artist,
    attractionResolution: { requestedArtistName: artist.name, confidence: 0.9, status: "resolved", attractionId: "K1" },
    pastEvents: concerts.past ?? [],
    upcomingEvents: concerts.upcoming ?? []
  };
}

describe("aggregateVenueEvidence", () => {
  it("groups events at the same venue across multiple similar artists", () => {
    const artistA = similarArtist("Artist A", 90);
    const artistB = similarArtist("Artist B", 80);
    const entries = [
      entry(artistA, { upcoming: [concert({ eventId: "1" })] }),
      entry(artistB, { upcoming: [concert({ eventId: "2" })] })
    ];

    const evidence = aggregateVenueEvidence(entries, now);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ matchingArtistCount: 2, upcomingEventCount: 2, pastEventCount: 0 });
    expect(evidence[0]?.matchingArtists.map((match) => match.artistName)).toEqual(["Artist A", "Artist B"]);
  });

  it("does not merge different venues", () => {
    const artist = similarArtist("Artist A", 90);
    const entries = [
      entry(artist, {
        upcoming: [
          concert({ eventId: "1", venue: { name: "La Maroquinerie", city: "Paris" } }),
          concert({ eventId: "2", venue: { name: "Le Bikini", city: "Toulouse" } })
        ]
      })
    ];

    const evidence = aggregateVenueEvidence(entries, now);

    expect(evidence).toHaveLength(2);
  });

  it("normalizes venue-name variants to the same evidence entry", () => {
    const artistA = similarArtist("Artist A", 90);
    const artistB = similarArtist("Artist B", 85);
    const entries = [
      entry(artistA, { upcoming: [concert({ eventId: "1", venue: { name: "Le Krakatoa", city: "Mérignac" } })] }),
      entry(artistB, { upcoming: [concert({ eventId: "2", venue: { name: "Krakatoa Mérignac", city: "Mérignac" } })] })
    ];

    const evidence = aggregateVenueEvidence(entries, now);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.matchingArtistCount).toBe(2);
  });

  it("flags a venue linked to more than one similar artist as recurring", () => {
    const artistA = similarArtist("Artist A", 90);
    const artistB = similarArtist("Artist B", 85);
    const evidence = aggregateVenueEvidence([
      entry(artistA, { upcoming: [concert({ eventId: "1" })] }),
      entry(artistB, { upcoming: [concert({ eventId: "2" })] })
    ], now)[0]!;

    expect(isRecurringVenue(evidence)).toBe(true);
  });

  it("does not flag a single-artist venue as recurring", () => {
    const artist = similarArtist("Artist A", 90);
    const evidence = aggregateVenueEvidence([entry(artist, { upcoming: [concert()] })], now)[0]!;

    expect(isRecurringVenue(evidence)).toBe(false);
  });

  it("computes a higher venueCompatibilityScore for venues with more, stronger, more recent evidence", () => {
    const strongArtist = similarArtist("Strong Artist", 95);
    const weakArtist = similarArtist("Weak Artist", 20);

    const richVenue = aggregateVenueEvidence([
      entry(strongArtist, { upcoming: [concert({ eventId: "1", venue: { name: "Rich Venue", city: "Paris" } })] }),
      entry(weakArtist, { upcoming: [concert({ eventId: "2", venue: { name: "Rich Venue", city: "Paris" } })] })
    ], now)[0]!;

    const thinVenue = aggregateVenueEvidence([
      entry(weakArtist, { past: [concert({ eventId: "3", status: "past", date: { localDate: "2020-01-01" }, venue: { name: "Thin Venue", city: "Paris" } })] })
    ], now)[0]!;

    expect(richVenue.venueCompatibilityScore!).toBeGreaterThan(thinVenue.venueCompatibilityScore!);
  });

  it("preserves zero results as valid (no venues) rather than fabricating evidence", () => {
    expect(aggregateVenueEvidence([], now)).toEqual([]);
  });
});

describe("aggregateSceneEvidence", () => {
  it("aggregates similar-artist events by city", () => {
    const artistA = similarArtist("Artist A", 90);
    const artistB = similarArtist("Artist B", 80);
    const scenes = aggregateSceneEvidence([
      entry(artistA, { upcoming: [concert({ eventId: "1", venue: { name: "V1", city: "Paris" } })] }),
      entry(artistB, { upcoming: [concert({ eventId: "2", venue: { name: "V2", city: "Paris" } })] }),
      entry(artistA, { upcoming: [concert({ eventId: "3", venue: { name: "V3", city: "Lyon" } })] })
    ]);

    const paris = scenes.find((scene) => scene.city === "Paris");
    expect(paris).toMatchObject({ matchingEventCount: 2, matchingArtistCount: 2, upcomingEventCount: 2 });
    expect(scenes.find((scene) => scene.city === "Lyon")).toMatchObject({ matchingEventCount: 1, matchingArtistCount: 1 });
  });

  it("returns an empty scene list when no events have a known city", () => {
    const artist = similarArtist("Artist A", 90);
    const scenes = aggregateSceneEvidence([entry(artist, { upcoming: [concert({ venue: undefined })] })]);
    expect(scenes).toEqual([]);
  });
});
