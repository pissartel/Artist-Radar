import { afterEach, describe, expect, it, vi } from "vitest";
import {
  determineAbsoluteArtistTier,
  findSimilarArtists,
  groupSimilarArtistsByTier,
  mapSpotifyArtistToSimilarArtist,
  scoreGenreRelevance,
  scoreSizeRelevance
} from "../src/modules/similarArtistsFinder.js";
import type { ArtistProfile, SimilarArtist } from "../src/schemas.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall",
  city: "Paris",
  country: "France",
  genres: ["pop punk", "hardcore"],
  spotifyArtistName: "Tuesday Fall",
  spotifyGenres: ["pop punk"],
  socialLinks: {
    spotifyUrl: "https://open.spotify.com/artist/example",
    youtubeUrl: null,
    instagramUrl: null
  },
  platformStats: {
    spotifyFollowers: 1200,
    spotifyPopularity: 18
  },
  estimatedLevel: "emerging",
  confidence: 0.75,
  notes: ["Test profile."]
};

describe("findSimilarArtists", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns deterministic mock similar artists across small, medium and large tiers", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "true" }
    });

    expect(artists).toHaveLength(9);
    expect(artists.filter((artist) => artist.artistTier === "small")).toHaveLength(3);
    expect(artists.filter((artist) => artist.artistTier === "medium")).toHaveLength(3);
    expect(artists.filter((artist) => artist.artistTier === "large")).toHaveLength(3);
    expect(artists[0]).toMatchObject({
      name: "Paris Pop Punk Collective",
      url: null,
      spotifyId: null,
      source: "mock",
      city: "Paris",
      country: "France",
      artistTier: "small",
      possibleUse: "local_networking"
    });
  });

  it("uses Spotify related artists before search", async () => {
    let searchCalls = 0;
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [
        spotifyArtist("related-small", "Related Pop Punk Band", 1000, 19, ["pop punk"])
      ],
      spotifySearch: async () => {
        searchCalls += 1;
        return [spotifyArtist("search", "Search Band", 1000, 19, ["pop punk"])];
      }
    });

    expect(searchCalls).toBe(0);
    expect(artists).toHaveLength(1);
    expect(artists[0]?.source).toBe("spotify_related");
  });

  it("prints provider counts when DEBUG_SIMILAR_ARTISTS is true", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("DEBUG_SIMILAR_ARTISTS", "true");

    await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false", ENABLE_SPOTIFY_RELATED_ARTISTS: "true", DEBUG_SIMILAR_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => []
    });

    expect(log).toHaveBeenCalledWith(expect.stringContaining("[similar-artists] provider results"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[similar-artists] final group counts"));
  });

  it("falls back to Spotify search when related artists are unavailable", async () => {
    const queries: string[] = [];
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async (query) => {
        queries.push(query);
        return [
          spotifyArtist("search-small", "Search Pop Punk Band", 1000, 18, ["pop punk"]),
          spotifyArtist("search-large", "Search Big Punk Band", 200000, 60, ["punk rock"])
        ];
      }
    });

    expect(queries).toContain("pop punk france");
    expect(queries).toContain("pop punk paris");
    expect(artists).not.toHaveLength(0);
    expect(artists.map((artist) => artist.source)).toEqual(["spotify_search", "spotify_search"]);
  });

  it("enriches Spotify search candidates by id before tiering", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "green-day",
          name: "Green Day",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/green-day",
          images: []
        }
      ],
      spotifyArtistById: async () => ({
        id: "green-day",
        name: "Green Day",
        followers: 6_500_000,
        popularity: 82,
        genres: ["punk", "rock"],
        spotifyUrl: "https://open.spotify.com/artist/green-day",
        images: ["https://image.example/green-day.jpg"]
      })
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.name).toBe("Green Day");
    expect(artists[0]?.estimatedFollowers).toBe(6_500_000);
    expect(artists[0]?.estimatedPopularity).toBe(82);
    expect(artists[0]?.artistTier).toBe("large");
    expect(artists[0]?.possibleUse).toBe("long_term_reference");
    expect(groupSimilarArtistsByTier(artists).reference).toHaveLength(1);
  });

  it("uses top track popularity as a fallback size signal when artist popularity and followers are missing", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "blink-182",
          name: "blink-182",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/blink-182",
          images: []
        }
      ],
      spotifyArtistById: async () => ({
        id: "blink-182",
        name: "blink-182",
        followers: null,
        popularity: null,
        genres: [],
        spotifyUrl: "https://open.spotify.com/artist/blink-182",
        images: [],
        topTrackPopularityMax: 66,
        topTrackPopularityAvg: 61,
        topTrackCount: 3,
        sizeSignalSource: "spotify_tracks"
      })
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.artistTier).toBe("large");
    expect(artists[0]?.sizeSignalSource).toBe("spotify_tracks");
    expect(artists[0]?.topTrackPopularityMax).toBe(66);
  });

  it("does not deep-enrich Spotify search candidates when the feature is disabled", async () => {
    const artistById = vi.fn(async () => ({
      id: "green-day",
      name: "Green Day",
      followers: 6_500_000,
      popularity: 82,
      genres: ["punk", "rock"],
      spotifyUrl: "https://open.spotify.com/artist/green-day",
      images: []
    }));

    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "true"
      },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "green-day",
          name: "Green Day",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/green-day",
          images: []
        }
      ],
      spotifyArtistById: artistById
    });

    expect(artistById).not.toHaveBeenCalled();
    expect(artists).toHaveLength(1);
    expect(artists[0]?.artistTier).toBe("unknown");
    expect(artists[0]?.estimatedFollowers).toBeNull();
    expect(artists[0]?.estimatedPopularity).toBeNull();
  });

  it("scores genre relevance across different genres", () => {
    expect(scoreGenreRelevance(["pop punk"], ["pop punk"])).toBeGreaterThanOrEqual(85);
    expect(scoreGenreRelevance(["pop punk"], ["rock"])).toBeLessThan(scoreGenreRelevance(["pop punk"], ["pop punk"]));
    expect(scoreGenreRelevance(["rap"], ["hip hop"])).toBeGreaterThanOrEqual(85);
    expect(scoreGenreRelevance(["techno"], ["acoustic folk"])).toBeLessThan(25);
    expect(scoreGenreRelevance(["pop punk"], ["europop", "hungarian", "hungary", "magyar", "pop"])).toBeLessThan(25);
  });

  it("classifies much bigger mainstream artists as large/reference", () => {
    const size = scoreSizeRelevance({ followers: 1200, popularity: 18 }, { followers: 400000, popularity: 70 });

    expect(size.artistTier).toBe("large");
    expect(size.score).toBeLessThan(50);
  });

  it("does not keep broad rock candidates with low genre relevance for a pop punk profile", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [
        spotifyArtist("shaka-like", "Broad Rock Candidate", 500000, 72, ["french rock", "rock"])
      ],
      spotifySearch: async () => []
    });

    expect(artists).toEqual([]);
  });

  it("rejects Star Crystal-like explicit wrong genres for a pop punk profile", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      spotifySearch: async () => [
        spotifyArtist("star-crystal", "Star Crystal", 1200, 20, ["europop", "hungarian", "hungary", "magyar", "pop"])
      ]
    });

    expect(artists.some((artist) => artist.name === "Star Crystal")).toBe(false);
  });

  it("does not let France locality rescue a generic pop-only candidate for pop punk", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "French Pop Only", url: null, match: 0.95 }
      ],
      musicBrainzSearch: async () => ({
        musicBrainzId: "pop-only",
        name: "French Pop Only",
        country: "France",
        area: "France",
        beginArea: "Paris",
        tags: ["pop"],
        sourceUrl: "https://musicbrainz.org/artist/pop-only",
        score: 95
      }),
      spotifySearch: async () => []
    });

    expect(artists.some((artist) => artist.name === "French Pop Only")).toBe(false);
  });

  it("groups a good genre and France candidate as regional_peer", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "French Punk Match", url: null, match: 0.95 }
      ],
      musicBrainzSearch: async () => ({
        musicBrainzId: "french-punk-match",
        name: "French Punk Match",
        country: "France",
        area: "France",
        beginArea: "Lyon",
        tags: ["pop punk", "punk rock"],
        sourceUrl: "https://musicbrainz.org/artist/french-punk-match",
        score: 95
      }),
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    expect(grouped.regional_peer.some((artist) => artist.name === "French Punk Match")).toBe(true);
  });

  it("keeps good genre with unknown location in to_verify", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        VERIFY_SIMILAR_ARTISTS: "true",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Unknown Location Punk", url: null, match: 0.95 }
      ],
      musicBrainzSearch: async () => ({
        musicBrainzId: "unknown-location-punk",
        name: "Unknown Location Punk",
        country: null,
        area: null,
        beginArea: null,
        tags: ["pop punk"],
        sourceUrl: "https://musicbrainz.org/artist/unknown-location-punk",
        score: 95
      }),
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    expect(grouped.to_verify.some((artist) => artist.name === "Unknown Location Punk")).toBe(true);
  });

  it("keeps genre-relevant candidates with missing size metrics in reference tier", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "unknown-size",
          name: "Unknown Size Pop Punk Band",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/unknown-size"
        }
      ]
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.artistTier).toBe("unknown");
    expect(artists[0]?.bookingCategory).toBe("reference");
    expect(artists[0]?.city).toBeNull();
    expect(artists[0]?.country).toBeNull();
    expect(artists[0]?.matchedQuery).toBe("pop punk");
    expect(groupSimilarArtistsByTier(artists).reference).toHaveLength(1);
  });

  it("keeps candidates with empty genres when the matched query is focused", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "focused-empty-genres",
          name: "Focused Empty Genres Band",
          followers: 2500,
          popularity: 19,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/focused-empty-genres"
        }
      ]
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.genreRelevance).toBeGreaterThanOrEqual(45);
    expect(artists[0]?.bookingCategory).toBe("reference");
    expect(artists[0]?.matchedQuery).toBe("pop punk");
  });

  it("keeps a Spotify search candidate with missing metrics when the query is focused", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "unknown-size",
          name: "Unknown Size Pop Punk Band",
          followers: null,
          popularity: null,
          genres: [],
          spotifyUrl: "https://open.spotify.com/artist/unknown-size"
        }
      ]
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.artistTier).toBe("unknown");
    expect(artists[0]?.bookingCategory).toBe("reference");
    expect(groupSimilarArtistsByTier(artists).reference).toHaveLength(1);
  });

  it("does not return placeholder seed names in real mode", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [
        {
          name: "Bordeaux Emo Rock Band",
          genres: ["emo pop", "pop punk"],
          city: "Bordeaux",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Temporary mock seed.",
          estimatedTier: "medium",
          mockOnly: true
        }
      ],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => []
    });

    expect(artists.some((artist) => artist.name === "Bordeaux Emo Rock Band")).toBe(false);
  });

  it("rejects unrelated candidates or ranks them very low", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async () => [
        {
          id: "unrelated",
          name: "Unrelated Mainstream Act",
          followers: 400000,
          popularity: 78,
          genres: ["electropop"],
          spotifyUrl: "https://open.spotify.com/artist/unrelated"
        }
      ]
    });

    expect(artists).toHaveLength(0);
  });

  it("maps Spotify artist results into SimilarArtist objects", () => {
    const artist = mapSpotifyArtistToSimilarArtist(
      spotifyArtist("spotify-artist-1", "Search Result Band", 8000, 31, ["pop punk", "emo"]),
      { profile, genre: "pop punk", city: "Paris", target: "France" },
      "spotify_search"
    );

    expect(artist).toMatchObject({
      name: "Search Result Band",
      url: "https://open.spotify.com/artist/spotify-artist-1",
      spotifyId: "spotify-artist-1",
      source: "spotify_search",
      artistTier: "medium",
      possibleUse: "reference",
      estimatedFollowers: 8000,
      estimatedPopularity: 31
    });
    expect(artist.genreRelevance).toBeGreaterThanOrEqual(85);
    expect(artist.totalRelevance).toBeGreaterThan(50);
  });

  it("maps very large Spotify artists as large reference candidates", () => {
    const artist = mapSpotifyArtistToSimilarArtist(
      spotifyArtist("spotify-artist-2", "Mainstream Reference Band", 400000, 72, ["pop punk", "punk rock"]),
      { profile, genre: "pop punk", city: "Paris", target: "France" },
      "spotify_search"
    );

    expect(artist.artistTier).toBe("large");
    expect(artist.possibleUse).toBe("long_term_reference");
    expect(artist.estimatedFollowers).toBe(400000);
    expect(artist.estimatedPopularity).toBe(72);
  });

  it("tiers Spotify artists with absolute thresholds when user metrics are missing", () => {
    expect(determineAbsoluteArtistTier(2000, 18)).toBe("small");
    expect(determineAbsoluteArtistTier(9000, 34)).toBe("medium");
    expect(determineAbsoluteArtistTier(70000, 50)).toBe("large");
    expect(determineAbsoluteArtistTier(null, null)).toBe("unknown");
  });

  it("deduplicates and excludes the user artist", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [
        spotifyArtist("user", "Tuesday Fall", 1200, 18, ["pop punk"]),
        spotifyArtist("small", "Small Spotify Band", 1000, 18, ["pop punk"]),
        spotifyArtist("small", "Small Spotify Band", 1000, 18, ["pop punk"]),
        spotifyArtist("medium", "Medium Spotify Band", 10000, 35, ["pop punk", "emo"]),
        spotifyArtist("large", "Large Spotify Band", 200000, 60, ["punk rock"])
      ]
    });

    expect(artists.map((artist) => artist.name)).not.toContain("Tuesday Fall");
    expect(artists).toHaveLength(3);
    const grouped = groupSimilarArtistsByTier(artists);
    expect(grouped.reference.length + grouped.to_verify.length + grouped.unknown.length).toBe(3);
  });

  it("returns non-empty similar artists by tier when Spotify search returns candidates", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifyRelatedArtists: async () => [],
      spotifySearch: async (query) => {
        if (query === "pop punk france") {
          return [
            spotifyArtist("small-query", "Small Query Band", 1200, 18, []),
            spotifyArtist("medium-query", "Medium Query Band", 12000, 32, []),
            spotifyArtist("large-query", "Large Query Band", 300000, 67, [])
          ];
        }

        return [];
      }
    });

    const grouped = groupSimilarArtistsByTier(artists);
    expect(artists).not.toHaveLength(0);
    expect(grouped.local_peer.length + grouped.regional_peer.length + grouped.support_target.length + grouped.reference.length + grouped.unknown.length).toBeGreaterThan(0);
  });

  it("groups explicit unknown-tier artists", () => {
    const artist: SimilarArtist = {
      name: "Unknown Band",
      url: null,
      spotifyId: null,
      genres: ["pop punk"],
      city: null,
      country: null,
      source: "user",
      sources: ["user"],
      reason: "No metrics available.",
      confidence: 0.5,
      artistTier: "unknown",
      bookingCategory: "unknown",
      estimatedFollowers: null,
      estimatedPopularity: null,
      topTrackPopularityMax: null,
      topTrackPopularityAvg: null,
      topTrackCount: null,
      sizeSignalSource: "unknown",
      genreRelevance: 60,
      localRelevance: 45,
      sizeRelevance: 35,
      sceneRelevance: 45,
      totalRelevance: 50,
      relevanceToUserArtist: 50,
      possibleUse: "unknown",
      estimatedLevel: null,
      evidenceNotes: ["No metrics available."],
      sourceUrls: [],
      genreEvidence: [],
      locationEvidence: [],
      sizeEvidence: [],
      verificationStatus: "needs_verification"
    };

    expect(groupSimilarArtistsByTier([artist]).unknown).toEqual([artist]);
  });

  it("ranks local seed candidates above generic Spotify broad rock candidates", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [
        {
          name: "Paris Pop Punk Collective",
          genres: ["pop punk", "punk rock"],
          city: "Paris",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Local seed.",
          estimatedTier: "small",
          verified: true,
          sourceUrl: "https://example.com/paris-pop-punk-collective"
        }
      ],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifySearch: async () => [
        {
          id: "broad-rock",
          name: "Broad Rock Candidate",
          followers: 500000,
          popularity: 72,
          genres: ["french rock", "rock"],
          spotifyUrl: "https://open.spotify.com/artist/broad-rock",
          images: []
        }
      ]
    });

    expect(artists[0]?.name).toBe("Paris Pop Punk Collective");
    expect(artists[0]?.bookingCategory).toBe("local_peer");
    expect(artists.some((artist) => artist.name === "Broad Rock Candidate")).toBe(false);
  });

  it("deduplicates seed and Spotify candidates by name", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [
        {
          name: "Shared Band",
          genres: ["pop punk"],
          city: "Paris",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Seed duplicate.",
          estimatedTier: "small",
          verified: true,
          sourceUrl: "https://example.com/shared-band"
        }
      ],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifySearch: async () => [
        {
          id: "shared-band",
          name: "Shared Band",
          followers: 1200,
          popularity: 19,
          genres: ["pop punk"],
          spotifyUrl: "https://open.spotify.com/artist/shared-band",
          images: []
        }
      ]
    });

    expect(artists.filter((artist) => artist.name === "Shared Band")).toHaveLength(1);
  });

  it("returns non-empty tier groups when matching seed data is available", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [
        {
          name: "Paris Pop Punk Collective",
          genres: ["pop punk"],
          city: "Paris",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Local seed.",
          estimatedTier: "small",
          verified: true,
          sourceUrl: "https://example.com/paris-pop-punk-collective"
        },
        {
          name: "Lyon Pop Punk Next Step",
          genres: ["pop punk"],
          city: "Lyon",
          country: "France",
          url: null,
          source: "manual_seed",
          notes: "Regional seed.",
          estimatedTier: "medium",
          verified: true,
          sourceUrl: "https://example.com/lyon-pop-punk-next-step"
        }
      ],
      env: { MOCK_AI: "false", ENABLE_SPOTIFY_DEEP_ENRICHMENT: "true", ENABLE_SPOTIFY_RELATED_ARTISTS: "true" },
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    expect(grouped.local_peer.length).toBeGreaterThan(0);
    expect(grouped.regional_peer.length).toBeGreaterThanOrEqual(0);
  });

  it("deduplicates Last.fm and Spotify candidates by normalized name", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "blink-182", url: "https://www.last.fm/music/blink-182", match: 0.95 }
      ],
      spotifySearch: async () => [
        {
          id: "blink-182",
          name: "blink-182",
          followers: 6500000,
          popularity: 82,
          genres: ["punk", "rock"],
          spotifyUrl: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP",
          images: []
        }
      ]
    });

    expect(artists.filter((artist) => artist.name === "blink-182")).toHaveLength(1);
    expect(artists[0]?.source).toBe("lastfm_similar");
  });

  it("ranks Last.fm candidates above generic Spotify search candidates", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Last.fm Pop Punk Reference", url: null, match: 0.94 }
      ],
      spotifySearch: async () => [
        {
          id: "generic-rock",
          name: "Generic Rock Candidate",
          followers: null,
          popularity: null,
          genres: ["rock"],
          spotifyUrl: "https://open.spotify.com/artist/generic-rock",
          images: []
        }
      ]
    });

    expect(artists[0]?.source).toBe("lastfm_similar");
    expect(artists[0]?.totalRelevance).toBeGreaterThanOrEqual(artists[1]?.totalRelevance ?? 0);
  });

  it("skips enrichment when VERIFY_SIMILAR_ARTISTS is false", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        VERIFY_SIMILAR_ARTISTS: "false",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Verification Skip Band", url: null, match: 0.94 }
      ],
      spotifySearch: async () => [
        spotifyArtist("verification-skip-band", "Verification Skip Band", 1000, 20, ["pop punk"])
      ],
      musicBrainzSearch: async () => null
    });

    const candidate = artists.find((artist) => artist.name === "Verification Skip Band");
    expect(candidate?.source).toBe("lastfm_similar");
    expect(candidate?.spotifyUrl).toBeNull();
  });

  it("marks Last.fm-only candidates as needs_verification when verification is enabled", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        VERIFY_SIMILAR_ARTISTS: "true",
        VERIFY_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Last.fm Needs Check", url: null, match: 0.94 }
      ],
      spotifySearch: async () => [],
      musicBrainzSearch: async () => null
    });

    const candidate = artists.find((artist) => artist.name === "Last.fm Needs Check");
    expect(candidate?.verificationStatus).toBe("needs_verification");
    expect(candidate?.bookingCategory).toBe("to_verify");
  });

  it("keeps Broad Peak from Last.fm with missing metadata in to_verify", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        VERIFY_SIMILAR_ARTISTS: "true",
        VERIFY_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Broad Peak", url: null, match: 0.94 }
      ],
      spotifySearch: async () => [],
      musicBrainzSearch: async () => null
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const broadPeak = grouped.to_verify.find((artist) => artist.name === "Broad Peak");
    expect(broadPeak).toBeDefined();
    expect(broadPeak?.totalRelevance).toBeGreaterThanOrEqual(35);
  });

  it("keeps Bad Frequencies-like Last.fm candidates in to_verify when consolidation finds no evidence", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [{ name: "Bad Frequencies", url: null, match: 0.94 }],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const candidate = grouped.to_verify.find((artist) => artist.name === "Bad Frequencies");
    expect(candidate).toBeDefined();
    expect(candidate?.spotifyUrl).toBeNull();
    expect(candidate?.verificationStatus).toBe("needs_verification");
  });

  it("promotes a consolidated MusicBrainz France candidate with compatible genre to regional_peer", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [{ name: "Bad Frequencies", url: null, match: 0.94 }],
      lastfmArtistInfo: async () => ({ name: "Bad Frequencies", url: null, tags: ["pop punk", "punk rock"], listeners: null, playcount: null }),
      musicBrainzSearch: async () => ({
        musicBrainzId: "bad-frequencies",
        name: "Bad Frequencies",
        country: "France",
        area: "France",
        beginArea: null,
        tags: ["pop punk", "punk rock"],
        sourceUrl: "https://musicbrainz.org/artist/bad-frequencies",
        score: 95
      }),
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const candidate = grouped.regional_peer.find((artist) => artist.name === "Bad Frequencies");
    expect(candidate).toBeDefined();
    expect(candidate?.genreEvidence.some((entry) => entry.source === "lastfm" || entry.source === "musicbrainz")).toBe(true);
  });

  it("promotes Bad Frequencies from to_verify to regional_peer with Firecrawl-style compatible evidence", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [{ name: "Bad Frequencies", url: null, match: 0.94 }],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => [],
      webSearchProvider: {
        async search() {
          return [
            {
              title: "Bad Frequencies - French pop punk band",
              url: "https://example.com/bad-frequencies",
              snippet: "Bad Frequencies are a French pop punk band.",
              markdown: "Bad Frequencies are a French pop punk band with 1.2k Instagram followers.",
              links: ["https://www.instagram.com/badfrequenciesband/"]
            }
          ];
        }
      }
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const candidate = grouped.regional_peer.find((artist) => artist.name === "Bad Frequencies");
    expect(candidate).toBeDefined();
    expect(candidate?.instagramHandle).toBe("badfrequenciesband");
    expect(candidate?.country).toBe("France");
    expect(candidate?.city).not.toBe("France");
    expect(candidate?.genreEvidence.some((entry) => entry.source === "firecrawl" && entry.genres.includes("pop punk"))).toBe(true);
    expect(candidate?.locationEvidence.some((entry) => entry.country === "France")).toBe(true);
    expect(candidate?.sizeEvidence.some((entry) => entry.followers === 1200)).toBe(true);
  });

  it("rejects consolidated incompatible tags even when country matches", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [{ name: "French Europop Candidate", url: null, match: 0.94 }],
      lastfmArtistInfo: async () => ({ name: "French Europop Candidate", url: null, tags: ["europop", "pop"], listeners: null, playcount: null }),
      musicBrainzSearch: async () => ({
        musicBrainzId: "french-europop",
        name: "French Europop Candidate",
        country: "France",
        area: "France",
        beginArea: "Paris",
        tags: ["europop", "pop"],
        sourceUrl: "https://musicbrainz.org/artist/french-europop",
        score: 95
      }),
      spotifySearch: async () => []
    });

    expect(artists.some((artist) => artist.name === "French Europop Candidate")).toBe(false);
  });

  it("skips consolidation when CONSOLIDATE_SIMILAR_ARTISTS is false", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "false",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [{ name: "Consolidation Disabled", url: null, match: 0.94 }],
      lastfmArtistInfo: async () => ({ name: "Consolidation Disabled", url: null, tags: ["pop punk"], listeners: null, playcount: null }),
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    const candidate = artists.find((artist) => artist.name === "Consolidation Disabled");
    expect(candidate?.genres).toEqual([]);
    expect(candidate?.genreEvidence).toEqual([]);
  });

  it("respects CONSOLIDATE_SIMILAR_ARTISTS_LIMIT", async () => {
    let consolidationInfoCalls = 0;
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Limit One", url: null, match: 0.94 },
        { name: "Limit Two", url: null, match: 0.93 }
      ],
      lastfmArtistInfo: async (name) => {
        consolidationInfoCalls += 1;
        return { name, url: null, tags: ["pop punk"], listeners: null, playcount: null };
      },
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    expect(consolidationInfoCalls).toBe(1);
    expect(artists.find((artist) => artist.name === "Limit One")?.genres).toContain("pop punk");
    expect(artists.find((artist) => artist.name === "Limit Two")?.genres).toEqual([]);
    expect(artists.find((artist) => artist.name === "Limit Two")?.reason).toContain("outside consolidation limit");
  });

  it("keeps Bad Frequencies in to_verify when it is outside the consolidation limit", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "First Candidate", url: null, match: 0.96 },
        { name: "Bad Frequencies", url: null, match: 0.94 }
      ],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const candidate = grouped.to_verify.find((artist) => artist.name === "Bad Frequencies");
    expect(candidate).toBeDefined();
    expect(candidate?.verificationStatus).toBe("needs_verification");
    expect(candidate?.reason).toContain("outside consolidation limit");
  });

  it("keeps Bad Frequencies in to_verify when consolidation limit increases but finds no incompatible evidence", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "20",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "First Candidate", url: null, match: 0.96 },
        { name: "Bad Frequencies", url: null, match: 0.94 },
        { name: "Third Candidate", url: null, match: 0.93 }
      ],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const candidate = grouped.to_verify.find((artist) => artist.name === "Bad Frequencies");
    expect(candidate).toBeDefined();
    expect(candidate?.verificationStatus).toBe("needs_verification");
  });

  it("increasing consolidation limit does not reduce final output when no output limits are hit", async () => {
    const run = (consolidationLimit: string) => findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: consolidationLimit,
        SIMILAR_ARTISTS_OUTPUT_LIMIT: "80",
        SIMILAR_ARTISTS_TO_VERIFY_LIMIT: "40",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "First Candidate", url: null, match: 0.96 },
        { name: "Bad Frequencies", url: null, match: 0.94 },
        { name: "Third Candidate", url: null, match: 0.93 },
        { name: "Fourth Candidate", url: null, match: 0.92 }
      ],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    const lowLimitArtists = await run("1");
    const highLimitArtists = await run("20");

    expect(highLimitArtists.length).toBeGreaterThanOrEqual(lowLimitArtists.length);
    expect(highLimitArtists.some((artist) => artist.name === "Bad Frequencies")).toBe(true);
  });

  it("keeps consolidation limit and output limit independent", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "true",
        CONSOLIDATE_SIMILAR_ARTISTS_LIMIT: "1",
        SIMILAR_ARTISTS_OUTPUT_LIMIT: "2",
        SIMILAR_ARTISTS_TO_VERIFY_LIMIT: "40",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Output One", url: null, match: 0.96 },
        { name: "Output Two", url: null, match: 0.95 },
        { name: "Output Three", url: null, match: 0.94 }
      ],
      lastfmArtistInfo: async () => null,
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    expect(artists).toHaveLength(2);
  });

  it("logs pruned candidates with reasons when debug is enabled", async () => {
    vi.stubEnv("DEBUG_SIMILAR_ARTISTS", "true");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        CONSOLIDATE_SIMILAR_ARTISTS: "false",
        SIMILAR_ARTISTS_OUTPUT_LIMIT: "1",
        SIMILAR_ARTISTS_TO_VERIFY_LIMIT: "40",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Prune One", url: null, match: 0.96 },
        { name: "Prune Two", url: null, match: 0.95 }
      ],
      musicBrainzSearch: async () => null,
      spotifySearch: async () => []
    });

    const logs = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logs).toContain("candidates pruned from final output");
    expect(logs).toContain("overall output limit 1 reached");
  });

  it("promotes verified Broad Peak with pop punk evidence and France to regional_peer", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        VERIFY_SIMILAR_ARTISTS: "true",
        VERIFY_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Broad Peak", url: null, match: 0.94 }
      ],
      musicBrainzSearch: async () => ({
        musicBrainzId: "broad-peak",
        name: "Broad Peak",
        country: "France",
        area: "France",
        beginArea: null,
        tags: ["pop punk", "punk rock"],
        sourceUrl: "https://musicbrainz.org/artist/broad-peak",
        score: 95
      }),
      spotifySearch: async () => [],
      webSearchProvider: {
        async search(query) {
          if (query.includes("Instagram")) {
            return [
              {
                title: "Broad Peak Instagram",
                url: "https://www.instagram.com/broadpeakband/",
                snippet: null
              }
            ];
          }
          return [];
        }
      }
    });

    const grouped = groupSimilarArtistsByTier(artists);
    const broadPeak = grouped.regional_peer.find((artist) => artist.name === "Broad Peak");
    expect(broadPeak).toBeDefined();
    expect(broadPeak?.instagramUrl).toBe("https://www.instagram.com/broadpeakband/");
    expect(broadPeak?.verificationStatus).toBe("verified");
  });

  it("attaches Spotify verification for non-Spotify candidates when enabled", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        VERIFY_SIMILAR_ARTISTS: "true",
        VERIFY_SIMILAR_ARTISTS_LIMIT: "1",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Verified Lastfm Band", url: null, match: 0.94 }
      ],
      spotifySearch: async () => [
        spotifyArtist("verified-lastfm-band", "Verified Lastfm Band", 1000, 20, ["pop punk"])
      ],
      musicBrainzSearch: async () => null
    });

    const candidate = artists.find((artist) => artist.name === "Verified Lastfm Band");
    expect(candidate?.verificationStatus).toBe("verified");
    expect(candidate?.spotifyUrl).toBe("https://open.spotify.com/artist/verified-lastfm-band");
  });

  it("lets MusicBrainz country metadata boost scene relevance for France-targeted profiles", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "grandes villes françaises",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Regional French Pop Punk", url: null, match: 0.9 }
      ],
      musicBrainzSearch: async () => ({
        musicBrainzId: "mbid-fr",
        name: "Regional French Pop Punk",
        country: "France",
        area: "France",
        beginArea: "Bordeaux",
        tags: ["pop punk", "punk rock"],
        sourceUrl: "https://musicbrainz.org/artist/mbid-fr",
        score: 95
      })
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.country).toBe("France");
    expect(artists[0]?.city).toBe("Bordeaux");
    expect(artists[0]?.sceneRelevance).toBeGreaterThanOrEqual(80);
  });

  it("keeps MusicBrainz fallback candidates unchanged when no metadata is found", async () => {
    const artists = await findSimilarArtists({
      profile,
      target: "France",
      genre: "pop punk",
      city: "Paris",
      seedCandidates: [],
      env: {
        MOCK_AI: "false",
        LASTFM_API_KEY: "key",
        ENABLE_SPOTIFY_DEEP_ENRICHMENT: "false",
        ENABLE_SPOTIFY_RELATED_ARTISTS: "false"
      },
      lastfmSimilarArtists: async () => [
        { name: "Fallback Artist", url: null, match: 0.9 }
      ],
      musicBrainzSearch: async () => null
    });

    expect(artists).toHaveLength(1);
    expect(artists[0]?.name).toBe("Fallback Artist");
    expect(artists[0]?.country).toBeNull();
    expect(artists[0]?.genres).toEqual([]);
  });
});

function spotifyArtist(
  id: string,
  name: string,
  followers: number,
  popularity: number,
  genres: string[]
) {
  return {
    id,
    name,
    followers,
    popularity,
    genres,
    spotifyUrl: `https://open.spotify.com/artist/${id}`,
    images: []
  };
}
