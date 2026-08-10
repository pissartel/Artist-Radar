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
            genreRelevance: 85,
            sceneRelevance: 60,
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

  it("maps to_verify similar artists before reference artists", () => {
    const result = buildResult({
      similarArtists: {
        reference: [
          {
            name: "allsinners",
            genres: ["post-hardcore"],
            city: "Canada",
            country: "CA",
            reason: "Outside the requested market.",
            artistTier: "small",
            totalRelevance: 45,
            estimatedFollowers: 832,
            genreRelevance: 85,
            sceneRelevance: 0,
          },
        ],
        to_verify: [
          {
            name: "Broad Peak",
            genres: [],
            city: null,
            country: null,
            reason: "Strong Last.fm similarity, missing metadata.",
            artistTier: "small",
            totalRelevance: 68,
            estimatedFollowers: 1378,
            genreRelevance: 70,
            sceneRelevance: 45,
          },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.similarArtists.map((artist) => artist.name)).toEqual(["Broad Peak", "allsinners"]);
  });

  it("preserves multiple valid backend venue opportunities and reports mapper drop counts", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "L'OLYMPIA",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: "https://www.ticketmaster.fr/fr/salle/l-olympia/idsite/34",
          contact: null,
          reason: "Structured Ticketmaster venue.",
          score: 74,
          suggested_message: "Research this venue.",
        },
        {
          name: "La Maroquinerie",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: "https://www.lamaroquinerie.fr",
          contact: null,
          reason: "Compatible programming evidence.",
          score: 72,
          suggested_message: "Research this venue.",
        },
      ],
      bookingSearch: {
        sourcesUsed: [],
        warnings: [],
        sourceMetadata: [],
        diagnostics: {
          stages: { finalApiOpportunities: 2 },
        },
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.bookingOpportunities.map((opportunity) => opportunity.title)).toEqual(["L'OLYMPIA", "La Maroquinerie"]);
    expect(response.bookingDiagnostics?.backendOpportunityCount).toBe(2);
    expect(response.bookingDiagnostics?.frontendMappedOpportunityCount).toBe(2);
    expect(response.bookingDiagnostics?.droppedDuringFrontendMapping).toEqual([]);
  });

  it("maps the new Chartmetric commercial-scale fields through (issue #201), keeping musical match/scale/overall relevance distinct", () => {
    const result = buildResult({
      similarArtists: {
        reference: [
          {
            name: "blink-182",
            genres: ["pop punk", "punk rock"],
            city: null,
            country: null,
            reason: "Major reference in the genre.",
            artistTier: "large",
            totalRelevance: 46,
            estimatedFollowers: 9_800_000,
            genreRelevance: 82,
            sceneRelevance: 10,
            spotifyId: "6FBDaR13swtiWwGhX1WQsP",
            spotifyUrl: "https://open.spotify.com/artist/6FBDaR13swtiWwGhX1WQsP",
            commercialTier: "major_reference",
            commercialAbsoluteScale: "major",
            commercialScore: 58,
            commercialScoreCoverage: 1,
            commercialScoreConfidence: "high",
            commercialScoreBreakdown: {
              genreCompatibility: 82,
              audienceSimilarity: 10,
              careerStageSimilarity: 0,
              geographicRelevance: 10,
              recentActivity: 55,
              crossPlatformEvidence: 60,
            },
            commercialScoreExplanation: "Commercial-scale compatibility score: 58/100 (tier: major_reference).",
            chartmetricDiagnostics: {
              selectedForEnrichment: true,
              spotifyIdPresent: true,
              spotifyUrlPresent: true,
              lookupAttempted: true,
              status: "success",
              matchMethod: "spotify_id",
              matchConfidence: "exact",
              metricsReturned: true,
              cacheHit: false,
              finalAudienceRatio: 1225,
              finalCommercialTier: "major_reference",
              scoreCoverage: 1,
              scoreConfidence: "high",
            },
          },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const blink182 = response.similarArtists[0];

    expect(blink182?.name).toBe("blink-182");
    // Overall/booking relevance stays as its own, clearly-separate field —
    // never conflated with the commercial-scale match.
    expect(blink182?.matchScore).toBe(46);
    expect(blink182?.musicalMatchScore).toBe(82);
    expect(blink182?.commercialTier).toBe("major_reference");
    expect(blink182?.commercialAbsoluteScale).toBe("major");
    expect(blink182?.commercialScore).toBe(58);
    expect(blink182?.commercialScoreCoverage).toBe(1);
    expect(blink182?.commercialScoreConfidence).toBe("high");
    expect(blink182?.chartmetricDiagnostics?.selectedForEnrichment).toBe(true);
    expect(blink182?.chartmetricDiagnostics?.matchMethod).toBe("spotify_id");
  });

  it("never maps an unresolved backend artistTier of 'unknown' onto the frontend Emerging label (issue #201 root cause)", () => {
    const result = buildResult({
      similarArtists: {
        reference: [
          {
            name: "blink-182",
            genres: [],
            city: null,
            country: null,
            reason: "Sparse discovery data.",
            artistTier: "unknown",
            totalRelevance: 46,
            estimatedFollowers: null,
            genreRelevance: 20,
            sceneRelevance: 0,
          },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const blink182 = response.similarArtists[0];

    expect(blink182?.artistTier).toBeUndefined();
  });

  it("keeps musical similarity visible even when commercial-scale data is entirely unavailable", () => {
    const result = buildResult({
      similarArtists: {
        reference: [
          {
            name: "Some Unresolved Reference Artist",
            genres: ["pop punk"],
            city: null,
            country: null,
            reason: "Strong genre match, no audience data.",
            artistTier: "unknown",
            totalRelevance: 46,
            estimatedFollowers: null,
            genreRelevance: 75,
            sceneRelevance: 0,
            commercialTier: "scale_unknown",
            commercialScore: null,
            // commercialScoreCoverage/confidence intentionally omitted, as a
            // provider that never even attempted enrichment would do.
          },
        ],
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const artist = response.similarArtists[0];

    expect(artist?.musicalMatchScore).toBe(75);
    expect(artist?.commercialTier).toBe("scale_unknown");
    expect(artist?.commercialScore).toBeNull();
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

  it("maps monthly listeners only from Chartmetric, never from Spotify followers", () => {
    const result = buildResult({
      artistProfile: {
        artistName: "Tuesday Fall",
        city: "Paris",
        country: "France",
        genres: ["pop punk"],
        socialLinks: { spotifyUrl: "https://open.spotify.com/artist/abc123" },
        platformStats: { spotifyFollowers: 5400, spotifyPopularity: 32 },
      },
      chartmetric: {
        provider: "chartmetric",
        status: "success",
        metrics: {
          spotifyMonthlyListeners: 9100,
          spotifyFollowers: 5400,
        },
      },
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.artist.monthlyListeners).toBe(9100);
    expect(response.artist.metrics?.monthlyListeners).toBe(9100);
    expect(response.artist.metrics?.followers).toBe(5400);
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

  it("resolves a stable venueId and venue fields for a concert opportunity (issue #213)", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Neon Riot at Le Point Ephemere",
          type: "concert",
          city: "Paris",
          country: "France",
          source_url: "https://songkick.example/events/123",
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
          venueName: "Le Point Ephemere",
          venueType: "venue",
          venueImageUrl: "https://le-point-ephemere.example/logo.png",
          venueConfidence: 0.8,
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venue).toBe("Le Point Ephemere");
    expect(opportunity?.venueId).toBeTruthy();
    expect(opportunity?.venueOpportunityId).toBe(opportunity?.venueId);
    expect(opportunity?.venueType).toBe("venue");
    expect(opportunity?.venueImageUrl).toBe("https://le-point-ephemere.example/logo.png");
    expect(opportunity?.venueConfidence).toBe(80);
    // The event's own source (a listing page) must never be mislabeled as
    // the venue's own official website (issue #213 acceptance criterion).
    expect(opportunity?.venueWebsite).toBeUndefined();
  });

  it("prefers the backend venueOpportunityId for a concert's internal venue link", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "The Suicide Machines + Faintest Idea at Glazart",
          type: "concert",
          city: "Paris",
          country: "France",
          source_url: "https://razibus.net/06-08-2026-the-suicide-machines",
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
          venueName: "Glazart",
          venueOpportunityId: "venue-glazart-paris-france",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venue).toBe("Glazart");
    expect(opportunity?.venueId).toBe("venue-glazart-paris-france");
    expect(opportunity?.venueOpportunityId).toBe("venue-glazart-paris-france");
  });

  it("gives two concerts at the same venue the same venueId, so they link to one canonical venue page", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Neon Riot at Le Point Ephemere",
          type: "concert",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
          venueName: "Le Point Ephemere",
        },
        {
          name: "Blink Kids at Le Point Ephemere",
          type: "concert",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 70,
          suggested_message: "Reach out.",
          venueName: "Le Point Ephemere",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const [first, second] = response.bookingOpportunities;

    expect(first.venueId).toBe(second.venueId);
  });

  it("uses the opportunity's own source as the venue website only when the opportunity IS the venue", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Le Petit Club",
          type: "venue",
          city: "Paris",
          country: "France",
          source_url: "https://le-petit-club.example/",
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
          venueName: "Le Petit Club",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venueWebsite).toBe("https://le-petit-club.example/");
  });

  // PR #218 review feedback: a venue opportunity discovered from a similar
  // artist's concert history must never surface that artist's Songkick/
  // Shotgun/Bandsintown profile, calendar, or ticketing page as the venue's
  // own official website.
  it.each([
    ["a Songkick artist calendar page", "https://songkick.com/artists/mina-warren/calendar"],
    ["a Shotgun artist profile page", "https://shotgun.live/en/users/artists/minawarren"],
    ["a Bandsintown event/ticketing page", "https://bandsintown.com/e/neon-riot-monsters-art"],
    ["a generic /events/ listing page", "https://agenda.example/events/monsters-art-night"],
    // Reported bug: an Instagram post about a show at the venue was being
    // shown as if it were the venue's own official website.
    ["an Instagram post", "https://www.instagram.com/p/DTizQeyCNWO/"],
    ["a YouTube video page", "https://www.youtube.com/watch?v=abc123"],
  ])("never maps %s to venueWebsite", (_label, sourceUrl) => {
    const result = buildResult({
      opportunities: [
        {
          name: "Monster's Art",
          type: "venue",
          city: "Marseille",
          country: "France",
          source_url: sourceUrl,
          contact: null,
          reason: "Similar artists played this venue.",
          score: 70,
          suggested_message: "Reach out.",
          venueName: "Monster's Art",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venueWebsite).toBeUndefined();
  });

  it("lists every similar artist confirmed at the venue, each with its own concert source (issue #213 review feedback)", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Monster's Art",
          type: "venue",
          city: "Marseille",
          country: "France",
          source_url: "https://songkick.com/artists/mina-warren/calendar",
          contact: null,
          reason: "Similar artists played this venue.",
          score: 70,
          suggested_message: "Reach out.",
          venueName: "Monster's Art",
          venueArtistEvidence: [
            {
              similarArtistName: "Mina Warren",
              sourceUrl: "https://songkick.com/artists/mina-warren/calendar",
              eventDate: "2026-03-01",
            },
            {
              similarArtistName: "Neon Riot",
              sourceUrl: "https://bandsintown.com/e/neon-riot-monsters-art",
              eventDate: "2026-01-15",
            },
          ],
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venueWebsite).toBeUndefined();
    expect(opportunity?.venueArtistEvidence).toEqual([
      {
        similarArtistName: "Mina Warren",
        sourceUrl: "https://songkick.com/artists/mina-warren/calendar",
        eventDate: "2026-03-01",
      },
      {
        similarArtistName: "Neon Riot",
        sourceUrl: "https://bandsintown.com/e/neon-riot-monsters-art",
        eventDate: "2026-01-15",
      },
    ]);
  });

  // Reproduces the issue's own worked example end-to-end through the
  // frontend mapper: a venue discovered from a similar artist's concert
  // (Artist A at Quai M) must surface as the venue itself — title "Quai M",
  // primary link the venue's official site — with the concert preserved
  // only as evidence, never as the opportunity's main link.
  it("maps a venue discovered from a similar artist's concert to the venue's own official site, never the concert URL", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Quai M",
          type: "venue",
          city: "Nantes",
          country: "France",
          source_url: "https://quai-m.fr",
          contact: null,
          reason: "Similar artists played this venue.",
          score: 70,
          suggested_message: "Reach out.",
          venueName: "Quai M",
          venueArtistEvidence: [
            {
              similarArtistName: "Artist A",
              sourceUrl: "https://example.com/events/artist-a-quai-m",
              eventDate: "2026-05-12",
              eventName: "Artist A at Quai M",
            },
          ],
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.title).toBe("Quai M");
    expect(opportunity?.venueWebsite).toBe("https://quai-m.fr");
    expect(opportunity?.sourceUrls).toEqual(["https://quai-m.fr"]);
    expect(opportunity?.sourceUrls).not.toContain("https://example.com/events/artist-a-quai-m");
    expect(opportunity?.venueArtistEvidence).toEqual([
      {
        similarArtistName: "Artist A",
        sourceUrl: "https://example.com/events/artist-a-quai-m",
        eventDate: "2026-05-12",
        eventName: "Artist A at Quai M",
      },
    ]);
  });

  it("omits venueId when the backend didn't resolve a venue name", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Open call for support acts",
          type: "organization",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Open call.",
          score: 60,
          suggested_message: "Apply.",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venueId).toBeUndefined();
    expect(opportunity?.venue).toBeUndefined();
  });

  it("only exposes a venue's own branding image, never an event-specific poster, as venueImageUrl", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Neon Riot at Le Point Ephemere",
          type: "concert",
          city: "Paris",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 82,
          suggested_message: "Reach out.",
          venueName: "Le Point Ephemere",
          venueImageUrl: null,
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venueImageUrl).toBeUndefined();
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
            genreRelevance: 85,
            sceneRelevance: 60,
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
            genreRelevance: 85,
            sceneRelevance: 60,
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

  it("passes the opportunity imageUrl through when the backend provides one", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Soirée Punk",
          displayTitle: "Punk concert in Rennes",
          type: "event",
          city: "Rennes",
          country: "France",
          source_url: "https://razibus.net/event.html",
          contact: null,
          reason: "Strong genre match.",
          score: 73,
          suggested_message: "Reach out.",
          imageUrl: "https://razibus.net/img/poster-35768.jpg",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.bookingOpportunities[0]?.imageUrl).toBe("https://razibus.net/img/poster-35768.jpg");
  });

  it("passes the concert lineup and ticket URL through when the backend already found them", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Soirée Punk",
          displayTitle: "Soirée Punk - Ferme de Quincé",
          type: "event",
          city: "Rennes",
          country: "France",
          source_url: "https://razibus.net/event.html",
          contact: null,
          reason: "Strong genre match.",
          score: 73,
          suggested_message: "Reach out.",
          lineup: ["Band A", "Band B"],
          ticketUrl: "https://razibus.net/tickets/example",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.lineup).toEqual(["Band A", "Band B"]);
    expect(opportunity?.ticketUrl).toBe("https://razibus.net/tickets/example");
  });

  it("leaves lineup empty and ticketUrl null rather than inventing them when the backend found neither", () => {
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

    expect(opportunity?.lineup).toEqual([]);
    expect(opportunity?.ticketUrl).toBeNull();
  });

  it("leaves imageUrl undefined rather than inventing one when the backend has no image", () => {
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

    expect(response.bookingOpportunities[0]?.imageUrl).toBeUndefined();
  });

  it("passes the structured matchBreakdown through instead of only the reason string", () => {
    const result = buildResult({
      opportunities: [
        {
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
            neutralFactors: [{ code: "contact_available", label: "No public booking contact was found", impact: "neutral" }],
          },
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.matchBreakdown?.positiveFactors).toEqual([
      { code: "genre_match", label: "Genre matches the artist", impact: "positive" },
    ]);
    expect(opportunity?.matchBreakdown?.neutralFactors).toEqual([
      { code: "contact_available", label: "No public booking contact was found", impact: "neutral" },
    ]);
  });

  it("never displays the same location twice when city and country are identical", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Soirée Punk",
          type: "event",
          city: "France",
          country: "France",
          source_url: null,
          contact: null,
          reason: "Strong genre match.",
          score: 73,
          suggested_message: "Reach out.",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);

    expect(response.bookingOpportunities[0]?.location).toBe("France");
  });

  it("maps event venues to a canonical venue page and preserves the source provider label", () => {
    const result = buildResult({
      opportunities: [
        {
          name: "Punk Night at La Maroquinerie",
          displayTitle: "Punk Night",
          type: "event",
          city: "Paris",
          country: "France",
          source_url: "https://example.test/events/punk-night",
          sourceProvider: "openagenda",
          contact: null,
          reason: "Strong genre match.",
          score: 79,
          suggested_message: "Track this event.",
          venueName: "La Maroquinerie",
        },
      ],
    });

    const response = mapPipelineResultToArtistRadarResponse(result, request);
    const opportunity = response.bookingOpportunities[0];

    expect(opportunity?.venueId).toBe("la-maroquinerie-paris-france");
    expect(opportunity?.venueOpportunityId).toBe("la-maroquinerie-paris-france");
    expect(opportunity?.sourceProvider).toBe("openagenda");
    expect(opportunity?.sourceEvidence?.[0]).toEqual({
      url: "https://example.test/events/punk-night",
      title: "Punk Night",
      retrievedInfo: "Source provider: openagenda",
    });
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
