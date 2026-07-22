import { describe, expect, it, vi } from "vitest";
import {
  dedupeArtistConcerts,
  classifyConcertStatus,
  findSimilarArtistConcerts,
  selectTopCompatibleSimilarArtists
} from "../src/modules/similarArtistConcerts.js";
import type { ArtistConcert, ArtistConcertProvider } from "../src/providers/concerts/ArtistConcertProvider.js";
import type { SimilarArtist } from "../src/schemas.js";

function similarArtist(name: string, totalRelevance: number): SimilarArtist {
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
    genres: ["pop punk"],
    city: "Paris",
    country: "France",
    source: "mock",
    sources: ["test"],
    reason: "Compatible artist.",
    confidence: 0.85,
    sourceConfidence: 0.85,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: 3000,
    estimatedPopularity: null,
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: "manual",
    genreRelevance: 90,
    localRelevance: 90,
    sizeRelevance: 85,
    sceneRelevance: 88,
    totalRelevance,
    relevanceToUserArtist: totalRelevance,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: [],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: "small",
      confidence: 0.75,
      sizeSignalSource: "manual",
      platforms: {}
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

function concert(overrides: Partial<ArtistConcert> = {}): ArtistConcert {
  return {
    artist: { name: "Artist A" },
    date: "2026-03-12",
    status: "past",
    venue: { name: "Supersonic", city: "Paris", country: "France" },
    sources: [{ provider: "setlistfm" }],
    ...overrides
  };
}

describe("selectTopCompatibleSimilarArtists", () => {
  it("selects the top N artists by compatibility score, deterministically", () => {
    const artists = [
      similarArtist("Low", 40),
      similarArtist("High", 90),
      similarArtist("Mid", 65)
    ];

    const selected = selectTopCompatibleSimilarArtists(artists, 2);

    expect(selected.map((artist) => artist.name)).toEqual(["High", "Mid"]);
  });

  it("breaks ties deterministically by name rather than randomly", () => {
    const artists = [similarArtist("Zebra", 80), similarArtist("Apple", 80)];

    const selected = selectTopCompatibleSimilarArtists(artists, 2);

    expect(selected.map((artist) => artist.name)).toEqual(["Apple", "Zebra"]);
    // Running it again must produce the exact same order.
    expect(selectTopCompatibleSimilarArtists(artists, 2).map((artist) => artist.name)).toEqual(["Apple", "Zebra"]);
  });
});

describe("classifyConcertStatus", () => {
  const now = new Date("2026-07-01T00:00:00Z");

  it("classifies a future date as upcoming", () => {
    expect(classifyConcertStatus("2026-09-01", "unknown", now)).toBe("upcoming");
  });

  it("classifies a past date as past", () => {
    expect(classifyConcertStatus("2026-01-01", "unknown", now)).toBe("past");
  });

  it("respects an explicit cancelled signal regardless of date", () => {
    expect(classifyConcertStatus("2026-09-01", "cancelled", now)).toBe("cancelled");
  });

  it("returns unknown for an unparseable date", () => {
    expect(classifyConcertStatus("not-a-date", "unknown", now)).toBe("unknown");
  });
});

describe("dedupeArtistConcerts", () => {
  it("merges the same event returned by two providers (same date, same venue)", () => {
    const events = [
      concert({ sources: [{ provider: "setlistfm", externalId: "sk-1" }] }),
      concert({ sources: [{ provider: "songkick", externalId: "bk-2" }] })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.sources.map((source) => source.provider)).toEqual(["setlistfm", "songkick"]);
  });

  it("does not merge the same date at a different venue", () => {
    const events = [
      concert({ venue: { name: "Supersonic", city: "Paris" } }),
      concert({ venue: { name: "Le Batofar", city: "Paris" } })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(2);
  });

  it("does not merge the same venue on a different date", () => {
    const events = [
      concert({ date: "2026-03-12" }),
      concert({ date: "2026-05-20" })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(2);
  });

  it("normalizes venue-name variants (leading article, city suffix) as the same venue", () => {
    const events = [
      concert({ venue: { name: "Le Krakatoa", city: "Mérignac" }, sources: [{ provider: "setlistfm" }] }),
      concert({ venue: { name: "Krakatoa Mérignac", city: "Mérignac" }, sources: [{ provider: "bandsintown" }] })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.sources).toHaveLength(2);
  });

  it("falls back to a city match when one side is missing a venue name", () => {
    const events = [
      concert({ venue: { name: "Supersonic", city: "Paris" } }),
      concert({ venue: { name: "", city: "Paris" } })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.venue?.name).toBe("Supersonic");
  });

  it("keeps uncertain matches (different venue name and no shared city) separate rather than merging incorrectly", () => {
    const events = [
      concert({ venue: { name: "Supersonic", city: "Paris" } }),
      concert({ venue: { name: "Le Bikini", city: "Toulouse" } })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(2);
  });

  it("preserves the richer venue/lineup information rather than discarding it", () => {
    const events = [
      concert({
        venue: { name: "Supersonic", city: "Paris" },
        lineup: [{ name: "Artist A" }],
        sources: [{ provider: "songkick" }]
      }),
      concert({
        venue: { name: "Supersonic", city: "Paris", country: "France", latitude: 48.8, longitude: 2.3 },
        lineup: [{ name: "Artist A" }, { name: "Support Act" }],
        sources: [{ provider: "setlistfm" }]
      })
    ];

    const deduped = dedupeArtistConcerts(events);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.venue).toMatchObject({ country: "France", latitude: 48.8 });
    expect(deduped[0]?.lineup).toHaveLength(2);
  });
});

describe("findSimilarArtistConcerts", () => {
  it("processes only the selected top-N artists and groups results per artist", async () => {
    const artists = [similarArtist("High", 90), similarArtist("Low", 10)];
    const provider: ArtistConcertProvider = {
      name: "bandsintown",
      async getPastConcerts() {
        return [];
      },
      async getUpcomingConcerts(identity) {
        return [concert({ artist: { name: identity.name }, date: "2026-09-01", status: "upcoming", sources: [{ provider: "bandsintown" }] })];
      }
    };

    const results = await findSimilarArtistConcerts(artists, [provider], {
      limit: 1,
      now: new Date("2026-07-01T00:00:00Z"),
      musicBrainzSearch: async () => null
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.artist.name).toBe("High");
    expect(results[0]?.upcomingConcerts).toHaveLength(1);
  });

  it("returns partial results when one provider fails and another succeeds", async () => {
    const artists = [similarArtist("Artist A", 90)];
    const brokenProvider: ArtistConcertProvider = {
      name: "songkick",
      async getPastConcerts() {
        throw new Error("provider down");
      },
      async getUpcomingConcerts() {
        throw new Error("provider down");
      }
    };
    const workingProvider: ArtistConcertProvider = {
      name: "bandsintown",
      async getPastConcerts() {
        return [];
      },
      async getUpcomingConcerts(identity) {
        return [concert({ artist: { name: identity.name }, date: "2026-09-01", status: "upcoming", sources: [{ provider: "bandsintown" }] })];
      }
    };

    const results = await findSimilarArtistConcerts(artists, [brokenProvider, workingProvider], {
      limit: 1,
      now: new Date("2026-07-01T00:00:00Z"),
      musicBrainzSearch: async () => null
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.upcomingConcerts).toHaveLength(1);
  });

  it("carries the compatibility score through to each concert's artist field", async () => {
    const artists = [similarArtist("Artist A", 77)];
    const provider: ArtistConcertProvider = {
      name: "setlistfm",
      async getPastConcerts(identity) {
        return [concert({ artist: { name: identity.name }, date: "2026-01-01", status: "past", sources: [{ provider: "setlistfm" }] })];
      },
      async getUpcomingConcerts() {
        return [];
      }
    };

    const results = await findSimilarArtistConcerts(artists, [provider], {
      limit: 1,
      now: new Date("2026-07-01T00:00:00Z"),
      musicBrainzSearch: async () => null
    });

    expect(results[0]?.pastConcerts[0]?.artist.compatibilityScore).toBe(77);
  });

  it("does not call any provider when the artist list is empty", async () => {
    const getUpcoming = vi.fn(async () => []);
    const provider: ArtistConcertProvider = {
      name: "bandsintown",
      getPastConcerts: async () => [],
      getUpcomingConcerts: getUpcoming
    };

    const results = await findSimilarArtistConcerts([], [provider], { musicBrainzSearch: async () => null });

    expect(results).toEqual([]);
    expect(getUpcoming).not.toHaveBeenCalled();
  });
});
