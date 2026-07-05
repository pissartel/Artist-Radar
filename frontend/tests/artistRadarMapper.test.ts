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
    expect(response.matchExplanations).toEqual([]);
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
    expect(response.matchExplanations).toEqual([]);
    expect(response.warnings).toEqual([]);
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
