import { describe, expect, it } from "vitest";
import {
  buildVenueTargetsFromArtistEventHistory,
  dedupeHistoricalArtistEvents,
  selectSimilarArtistsForLiveHistory,
  type HistoricalArtistEvent
} from "../src/booking/artistEventHistory.js";
import { buildSimilarArtistLiveHistoryBookingSourceProvider } from "../src/booking/providers/SimilarArtistLiveHistoryBookingSourceProvider.js";
import type { ArtistEventHistoryProvider } from "../src/booking/artistEventHistory.js";
import type { BookingSearchInput } from "../src/booking/types.js";
import type { SimilarArtist } from "../src/schemas.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 10,
  artistProfile: {
    artistName: "Tuesday Fall",
    city: "Paris",
    country: "France",
    genres: ["pop punk"],
    spotifyArtistName: null,
    spotifyGenres: [],
    socialLinks: {},
    platformStats: {
      spotifyFollowers: 4500
    },
    estimatedLevel: "emerging",
    confidence: 0.7,
    notes: []
  },
  similarArtists: [
    similarArtist("Paris Peer One", "local_peer", "small", 3800, "Paris"),
    similarArtist("Paris Peer Two", "local_peer", "small", 4200, "Paris"),
    similarArtist("National Peer", "regional_peer", "medium", 6000, "Lyon"),
    similarArtist("Scene Support", "support_target", "medium", 9000, "Nantes"),
    similarArtist("Small Scene", "regional_peer", "small", 2500, "Rennes"),
    similarArtist("Huge Reference", "reference", "large", 250000, "Los Angeles")
  ]
};

describe("artist event history", () => {
  it("selects at least five compatible similar artists before large references when available", () => {
    const selected = selectSimilarArtistsForLiveHistory(input, 10);

    expect(selected).toHaveLength(5);
    expect(selected.map((artist) => artist.name)).not.toContain("Huge Reference");
    expect(selected.map((artist) => artist.name)).toEqual(expect.arrayContaining([
      "Paris Peer One",
      "Paris Peer Two",
      "National Peer",
      "Scene Support",
      "Small Scene"
    ]));
  });

  it("deduplicates historical events by artist, date, venue, city and source URL", () => {
    const events: HistoricalArtistEvent[] = [
      historicalEvent({ artistName: "Paris Peer One", eventDate: "2026-01-10T20:00:00+01:00", venueName: "Le Sample", city: "Paris" }),
      historicalEvent({ artistName: "paris peer one", eventDate: "2026-01-10", venueName: "Le Sample", city: "Paris" }),
      historicalEvent({ artistName: "Paris Peer One", eventDate: "2026-02-10", venueName: "Le Sample", city: "Paris" })
    ];

    const deduped = dedupeHistoricalArtistEvents(events);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.eventDate).toBe("2026-01-10");
  });

  it("creates merged venue targets with structured evidence for compatible artists", () => {
    const targets = buildVenueTargetsFromArtistEventHistory(input, input.similarArtists ?? [], [
      historicalEvent({ artistName: "Paris Peer One", eventName: "Peer One Release", eventDate: "2026-01-10", venueName: "Le Sample", city: "Paris" }),
      historicalEvent({ artistName: "Paris Peer Two", eventName: "Peer Two Night", eventDate: "2026-03-12", venueName: "Le Sample", city: "Paris", sourceUrl: "https://lesample.example/events/two" })
    ], {
      now: new Date("2026-07-01T00:00:00Z"),
      lookbackMonths: 24
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: "Le Sample",
      category: "venue",
      sourceType: "similar_artist_live_history",
      sourceProvider: "similar_artist_event_history",
      venueName: "Le Sample"
    });
    expect(targets[0]?.venueArtistEvidence).toHaveLength(2);
    expect(targets[0]?.venueArtistEvidence?.[0]).toMatchObject({
      venueId: "sample:paris:france",
      similarArtistId: "paris-peer-one",
      eventName: "Peer One Release",
      eventDate: "2026-01-10",
      sourceUrl: "https://lesample.example/events/one",
      sourceProvider: "test_history"
    });
    expect(targets[0]?.confidence).toBeGreaterThan(0.75);
    expect(targets[0]?.evidence.join(" ")).toContain("Compatible similar artists found at venue: 2");
  });

  it("merges venue name variants (leading article, bare name, name+city suffix) into one candidate", () => {
    const targets = buildVenueTargetsFromArtistEventHistory(input, input.similarArtists ?? [], [
      historicalEvent({
        artistName: "Paris Peer One",
        venueName: "Le Krakatoa",
        city: "Mérignac",
        sourceUrl: "https://krakatoa.example/events/one"
      }),
      historicalEvent({
        artistName: "Paris Peer Two",
        venueName: "Krakatoa",
        city: "Mérignac",
        sourceUrl: "https://krakatoa.example/events/two"
      }),
      historicalEvent({
        artistName: "National Peer",
        venueName: "Krakatoa Mérignac",
        city: "Mérignac",
        sourceUrl: "https://krakatoa.example/events/three"
      })
    ], {
      now: new Date("2026-07-01T00:00:00Z"),
      lookbackMonths: 24
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.venueArtistEvidence).toHaveLength(3);
    expect(new Set(targets[0]?.venueArtistEvidence?.map((item) => item.similarArtistId))).toEqual(
      new Set(["paris-peer-one", "paris-peer-two", "national-peer"])
    );
  });

  it("never uses a concert's own event-page URL as the venue target's primary sourceUrl", () => {
    // Reproduces the reported venue-opportunity bug: a similar artist's
    // concert is only evidence the venue is compatible, not the opportunity
    // itself — the venue's primary link must never be the event page.
    const targets = buildVenueTargetsFromArtistEventHistory(input, input.similarArtists ?? [], [
      historicalEvent({ artistName: "Paris Peer One", venueName: "Le Sample", city: "Paris", sourceUrl: "https://example.com/events/artist-a-quai-m" })
    ], {
      now: new Date("2026-07-01T00:00:00Z"),
      lookbackMonths: 24
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.sourceUrl).toBeNull();
    // The concert is preserved only as structured evidence.
    expect(targets[0]?.venueArtistEvidence?.[0]?.sourceUrl).toBe("https://example.com/events/artist-a-quai-m");
  });

  it("uses a candidate event source URL as the venue's primary link only when it plausibly looks like the venue's own page", () => {
    const targets = buildVenueTargetsFromArtistEventHistory(input, input.similarArtists ?? [], [
      historicalEvent({ artistName: "Paris Peer One", venueName: "Quai M", city: "Nantes", sourceUrl: "https://quai-m.fr" })
    ], {
      now: new Date("2026-07-01T00:00:00Z"),
      lookbackMonths: 24
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.sourceUrl).toBe("https://quai-m.fr");
    expect(targets[0]?.sourceType).toBe("venue_official_programming_page");
  });

  it("rejects historical events without a venue name or a traceable source URL", () => {
    const targets = buildVenueTargetsFromArtistEventHistory(input, input.similarArtists ?? [], [
      historicalEvent({ artistName: "Paris Peer One", venueName: "Le Sample", sourceUrl: "https://lesample.example/events/one" }),
      historicalEvent({ artistName: "Paris Peer Two", venueName: null }),
      historicalEvent({ artistName: "National Peer", sourceUrl: null })
    ], {
      now: new Date("2026-07-01T00:00:00Z"),
      lookbackMonths: 24
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.venueArtistEvidence).toHaveLength(1);
    expect(targets[0]?.venueArtistEvidence?.[0]?.similarArtistId).toBe("paris-peer-one");
  });

  it("continues similar-artist live-history search when one event provider fails", async () => {
    const brokenProvider: ArtistEventHistoryProvider = {
      providerName: "broken_history",
      async findPastEvents() {
        throw new Error("rate limited");
      }
    };
    const workingProvider: ArtistEventHistoryProvider = {
      providerName: "working_history",
      async findPastEvents({ artistName }) {
        return [historicalEvent({ artistName, venueName: "Le Sample", city: "Paris" })];
      }
    };
    const provider = buildSimilarArtistLiveHistoryBookingSourceProvider({
      webSearchProvider: {
        providerName: "empty_search",
        async search() {
          return [];
        }
      },
      eventHistoryProviders: [brokenProvider, workingProvider],
      maxSimilarArtists: 5,
      maxResultsPerArtist: 1,
      maxHistoricalEventsPerArtist: 1
    });

    const result = await provider.search({ input, maxResults: 10 });

    expect(result.targets.some((target) => target.name === "Le Sample")).toBe(true);
    expect(result.targets.every((target) => (target.venueArtistEvidence?.length ?? 0) > 0)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("broken_history failed"))).toBe(true);
    expect(result.metadata).toMatchObject({
      similarArtistsKept: 5,
      historicalVenueTargets: 1
    });
  });
});

function historicalEvent(overrides: Partial<HistoricalArtistEvent>): HistoricalArtistEvent {
  return {
    artistName: "Paris Peer One",
    eventName: "Peer One Live",
    eventDate: "2026-01-10",
    venueName: "Le Sample",
    city: "Paris",
    country: "France",
    sourceUrl: "https://lesample.example/events/one",
    sourceProvider: "test_history",
    lineup: [overrides.artistName ?? "Paris Peer One"],
    organizer: null,
    confidence: 0.72,
    ...overrides
  };
}

function similarArtist(
  name: string,
  bookingCategory: SimilarArtist["bookingCategory"],
  artistTier: SimilarArtist["artistTier"],
  estimatedFollowers: number,
  city: string
): SimilarArtist {
  return {
    name,
    url: null,
    spotifyUrl: null,
    spotifyId: null,
    instagramUrl: null,
    instagramHandle: null,
    youtubeUrl: null,
    youtubeChannelId: null,
    youtubeSubscribers: null,
    youtubeTotalViews: null,
    youtubeVideoCount: null,
    genres: ["pop punk", "punk rock"],
    city,
    country: "France",
    source: "mock",
    sources: ["test"],
    reason: "Compatible pop punk scene artist.",
    confidence: 0.85,
    sourceConfidence: 0.85,
    artistTier,
    bookingCategory,
    estimatedFollowers,
    estimatedPopularity: null,
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: "manual",
    genreRelevance: 92,
    localRelevance: city === "Paris" ? 90 : 60,
    sizeRelevance: 85,
    sceneRelevance: 88,
    totalRelevance: 90,
    relevanceToUserArtist: 90,
    possibleUse: "booking_research",
    estimatedLevel: artistTier === "large" ? "established" : "emerging",
    evidenceNotes: [],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: artistTier,
      confidence: 0.75,
      sizeSignalSource: "manual",
      platforms: {
        spotify: {
          followers: estimatedFollowers,
          sourceUrl: null
        }
      }
    },
    discardedTags: [],
    matchedQuery: null,
    searchRelevanceBoost: 0,
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null
  };
}
