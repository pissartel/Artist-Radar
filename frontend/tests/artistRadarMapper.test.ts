import { describe, expect, it } from "vitest";
import { mapPipelineResultToArtistRadarResponse } from "@/lib/server/artistRadarMapper";
import type { ArtistRadarRequest } from "@/types/artistRadar";
import type { BackendPipelineResult } from "@/lib/server/backendTypes";

const request: ArtistRadarRequest = {
  artistName: "Tuesday Fall",
  genre: "pop punk",
  location: "Paris",
};

function buildResult(overrides: Partial<BackendPipelineResult> = {}): BackendPipelineResult {
  return {
    artistProfile: {
      artistName: "Tuesday Fall",
      city: "Paris",
      country: "France",
      genres: ["pop punk"],
      socialLinks: {},
      platformStats: {},
    },
    similarArtists: {},
    opportunities: [],
    ...overrides,
  };
}

describe("mapPipelineResultToArtistRadarResponse", () => {
  it("maps artist profile, similar artists, and opportunities from the real pipeline result", () => {
    const result = buildResult({
      similarArtists: {
        local_peer: [
          {
            name: "Neon Riot",
            genres: ["pop punk", "punk rock"],
            city: "Lyon",
            country: "France",
            reason: "Similar genre and audience size.",
            artistTier: "small",
            totalRelevance: 78,
            estimatedFollowers: 4200,
          },
        ],
      },
      opportunities: [
        {
          name: "Le Petit Club",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: "https://example.test/le-petit-club",
          contact: "booking@example.test",
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out about an upcoming pop punk night.",
        },
      ],
      bookingSearch: {
        sourcesUsed: ["https://example.test/le-petit-club"],
        warnings: ["ConcertsPunk returned HTTP 403; skipping."],
        sourceMetadata: [
          { providerName: "native_fetch_scene_agendas", sourceProvider: "native_fetch_scene_agendas", targetCount: 1 },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.artist.name).toBe("Tuesday Fall");
    expect(response.similarArtists).toHaveLength(1);
    expect(response.similarArtists[0]?.name).toBe("Neon Riot");
    expect(response.bookingOpportunities).toHaveLength(1);
    expect(response.bookingOpportunities[0]?.title).toBe("Le Petit Club");
    expect(response.bookingOpportunities[0]?.contact).toBe("booking@example.test");
    expect(response.warnings).toEqual(["ConcertsPunk returned HTTP 403; skipping."]);
    expect(response.sources).toEqual([
      { id: "native-fetch-scene-agendas", name: "native_fetch_scene_agendas", type: "native_fetch_scene_agendas", opportunityCount: 1 },
    ]);
  });

  it("maps artist metrics only from fields the backend actually provides", () => {
    const result = buildResult({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Paris",
        country: "France",
        genres: ["pop punk", "punk rock"],
        socialLinks: { spotifyUrl: "https://open.spotify.com/artist/abc123" },
        platformStats: { spotifyFollowers: 5400, spotifyPopularity: 32 },
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.artist.metrics).toEqual({
      monthlyListeners: null,
      followers: 5400,
      popularityScore: 32,
      mainGenre: "pop punk",
      spotifyUrl: "https://open.spotify.com/artist/abc123",
    });
  });

  it("marks Spotify-derived metrics as unavailable rather than inventing them", () => {
    const response = mapPipelineResultToArtistRadarResponse(buildResult(), request);

    expect(response.artist.metrics).toEqual({
      monthlyListeners: null,
      followers: null,
      popularityScore: null,
      mainGenre: "pop punk",
      spotifyUrl: null,
    });
  });

  it("returns a graceful empty booking state with warnings when no provider finds targets", () => {
    const result = buildResult({
      bookingSearch: {
        sourcesUsed: [],
        warnings: ["OpenAgenda booking provider is disabled.", "Firecrawl booking provider is disabled."],
        sourceMetadata: [],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.bookingOpportunities).toEqual([]);
    expect(response.topCities).toEqual([]);
    expect(response.warnings).toEqual([
      "OpenAgenda booking provider is disabled.",
      "Firecrawl booking provider is disabled.",
    ]);
    expect(response.kpis.find((kpi) => kpi.id === "concerts-found")?.value).toBe(0);
  });

  it("empties booking-related fields and drops booking warnings when enableBooking is false", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Le Petit Club",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
        },
      ],
      bookingSearch: {
        sourcesUsed: [],
        warnings: ["Some booking warning."],
        sourceMetadata: [],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, { ...request, enableBooking: false });

    expect(response.bookingOpportunities).toEqual([]);
    expect(response.sources).toEqual([]);
    expect(response.warnings).toEqual([]);
  });

  it("infers a reliable category for each mapped booking opportunity", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Le Petit Club",
          type: "event",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 80,
          suggested_message: "Reach out.",
        },
        {
          name: "Salle Pleyel",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 80,
          suggested_message: "Reach out.",
        },
        {
          name: "Paris Pop Punk Festival",
          type: "unknown_source",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 80,
          suggested_message: "Reach out.",
        },
        {
          name: "Underground Bill",
          type: "unknown_source",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Best pitched as a support-slot opportunity.",
          score: 70,
          suggested_message: "Offer to play a support slot.",
        },
        {
          name: "Local Booker",
          type: "unknown_source",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: "booker@example.test",
          reason: "Books shows in the area.",
          score: 60,
          suggested_message: "Reach out directly.",
        },
        {
          name: "Mystery Lead",
          type: "unknown_source",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Not much signal here.",
          score: 40,
          suggested_message: "Investigate further.",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const categoryByTitle = Object.fromEntries(
      response.bookingOpportunities.map((opportunity) => [opportunity.title, opportunity.category]),
    );

    expect(categoryByTitle["Le Petit Club"]).toBe("concert");
    expect(categoryByTitle["Salle Pleyel"]).toBe("venue");
    expect(categoryByTitle["Paris Pop Punk Festival"]).toBe("festival");
    expect(categoryByTitle["Underground Bill"]).toBe("opening_slot");
    expect(categoryByTitle["Local Booker"]).toBe("contact");
    expect(categoryByTitle["Mystery Lead"]).toBe("unknown");
    expect(response.bookingOpportunities.every((opportunity) => Boolean(opportunity.category))).toBe(true);
  });

  it("maps organization-style booking targets (association, promoter, ...) to the organization type and category", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Loud & Proud Collective",
          type: "association",
          city: "Lyon",
          country: "France",
          source_url: null,
          contact: "hello@loudandproud.test",
          reason: "Books local pop punk shows.",
          score: 65,
          suggested_message: "Reach out about a local show.",
        },
        {
          name: "Riot Booking Agency",
          type: "booking_agency",
          city: "Lyon",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Represents comparable artists.",
          score: 60,
          suggested_message: "Reach out directly.",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const [association, agency] = response.bookingOpportunities;

    expect(association?.type).toBe("organization");
    expect(association?.category).toBe("organization");
    expect(association?.organizationType).toBe("association");
    expect(agency?.type).toBe("organization");
    expect(agency?.organizationType).toBe("booking_agency");
  });

  it("prefers the backend's normalized displayTitle over the raw name, and passes through genres/capacity/recent events/related artist", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "music.box PACA - Mina Warren en replay - France TV",
          displayTitle: "music.box PACA - Mina Warren",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: "booking@example.test",
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
          date: "2026-09-01",
          genres: ["pop punk", "punk rock"],
          venueCapacity: 250,
          recentEvents: ["Neon Riot live"],
          relatedArtist: {
            name: "Neon Riot",
            popularityComparison: "similar_size",
            matchedGenres: ["pop punk"],
          },
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.title).toBe("music.box PACA - Mina Warren");
    expect(opportunity?.date).toBe("2026-09-01");
    expect(opportunity?.genres).toEqual(["pop punk", "punk rock"]);
    expect(opportunity?.venueCapacity).toBe(250);
    expect(opportunity?.recentEvents).toEqual(["Neon Riot live"]);
    expect(opportunity?.relatedArtist).toEqual({
      name: "Neon Riot",
      popularityComparison: "similar_size",
      matchedGenres: ["pop punk"],
    });
  });

  it("falls back to the raw name and empty by-type fields when the backend doesn't provide them", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Le Petit Club",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.title).toBe("Le Petit Club");
    expect(opportunity?.genres).toEqual([]);
    expect(opportunity?.venueCapacity).toBeNull();
    expect(opportunity?.recentEvents).toEqual([]);
    expect(opportunity?.relatedArtist).toBeNull();
  });

  it("passes the generic imageUrl through for the main artist and similar artists, not spotify.imageUrl", () => {
    const result = buildResult({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Paris",
        country: "France",
        genres: ["pop punk"],
        socialLinks: {},
        platformStats: {},
        spotify: {
          id: "abc123",
          url: "https://open.spotify.com/artist/abc123",
          imageUrl: "https://images.example.test/spotify-raw.jpg",
          followers: 1000,
          popularity: 20,
          genres: ["pop punk"],
        },
        imageUrl: "https://images.example.test/resolved.jpg",
        imageSource: "spotify",
        imageConfidence: 0.9,
      },
      similarArtists: {
        local_peer: [
          {
            name: "Neon Riot",
            genres: ["pop punk"],
            city: "Lyon",
            country: "France",
            reason: "Similar genre and audience size.",
            artistTier: "small",
            totalRelevance: 78,
            estimatedFollowers: 4200,
            spotify: {
              id: "def456",
              url: "https://open.spotify.com/artist/def456",
              imageUrl: "https://images.example.test/spotify-raw-similar.jpg",
              followers: 4200,
              popularity: 15,
              genres: ["pop punk"],
            },
            imageUrl: "https://images.example.test/resolved-similar.jpg",
            imageSource: "spotify",
            imageConfidence: 0.9,
          },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.artist.imageUrl).toBe("https://images.example.test/resolved.jpg");
    expect(response.artist.imageSource).toBe("spotify");
    expect(response.artist.imageConfidence).toBe(0.9);
    expect(response.similarArtists[0]?.imageUrl).toBe("https://images.example.test/resolved-similar.jpg");
    expect(response.similarArtists[0]?.imageSource).toBe("spotify");
  });

  it("keeps imageUrl null when no trusted image source exists", () => {
    const result = buildResult({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Paris",
        country: "France",
        genres: ["pop punk"],
        socialLinks: {},
        platformStats: {},
        spotify: null,
        imageUrl: null,
        imageSource: null,
        imageConfidence: null,
      },
      similarArtists: {
        local_peer: [
          {
            name: "Neon Riot",
            genres: ["pop punk"],
            city: "Lyon",
            country: "France",
            reason: "Similar genre and audience size.",
            artistTier: "small",
            totalRelevance: 78,
            estimatedFollowers: 4200,
            spotify: null,
            imageUrl: null,
            imageSource: null,
            imageConfidence: null,
          },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.artist.imageUrl).toBeUndefined();
    expect(response.similarArtists[0]?.imageUrl).toBeUndefined();
  });

  it("falls back to request artist name and genre when the backend profile is missing them", () => {
    const result = buildResult({
      artistProfile: {
        artistName: null,
        city: null,
        country: null,
        genres: [],
        socialLinks: {},
        platformStats: {},
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.artist.name).toBe("Tuesday Fall");
    expect(response.artist.genres).toEqual(["pop punk"]);
    expect(response.artist.city).toBe("Paris");
  });
});
