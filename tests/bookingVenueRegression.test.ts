import { describe, expect, it } from "vitest";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import { buildFirecrawlBookingSourceProvider } from "../src/booking/providers/FirecrawlBookingSourceProvider.js";
import {
  isEligibleSimilarArtistForBookingVenueDiscovery
} from "../src/booking/similarArtistEligibility.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";
import type { BookingSourceProvider } from "../src/booking/providers/BookingSourceProvider.js";
import type { SimilarArtist } from "../src/schemas.js";

const NOW = new Date("2026-08-06T12:00:00Z");

function similarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Mina Warren",
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
    city: "Paris",
    country: "France",
    source: "mock",
    sources: ["test"],
    reason: "Verified compatible French pop punk artist.",
    confidence: 0.86,
    sourceConfidence: 0.86,
    artistTier: "small",
    bookingCategory: "regional_peer",
    estimatedFollowers: null,
    estimatedPopularity: null,
    topTrackPopularityMax: null,
    topTrackPopularityAvg: null,
    topTrackCount: null,
    sizeSignalSource: "unknown",
    genreRelevance: 82,
    localRelevance: 70,
    sizeRelevance: 65,
    sceneRelevance: 70,
    totalRelevance: 78,
    relevanceToUserArtist: 78,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: [],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: { estimatedLevel: "unknown", confidence: 0.2, sizeSignalSource: "unknown", platforms: {} },
    discardedTags: [],
    matchedQuery: null,
    searchRelevanceBoost: 0,
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null,
    ...overrides
  };
}

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "grandes villes françaises",
  links: [],
  limit: 20,
  artistProfile: {
    artistName: "Tuesday Fall",
    city: "Paris",
    country: "France",
    genres: ["pop punk"],
    spotifyArtistName: null,
    spotifyGenres: [],
    socialLinks: {},
    platformStats: {},
    estimatedLevel: "emerging",
    confidence: 0.7,
    notes: []
  },
  similarArtists: [similarArtist()]
};

function venueTarget(name: string, overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name,
    category: "venue",
    city: "Paris",
    country: "France",
    sourceUrl: `https://venues.example/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sourceType: "venue_official_programming_page",
    sourceProvider: "ticketmaster",
    genres: [],
    pastProgramming: ["Les 3 Fromages"],
    programmingEvidence: [{ artistName: "Les 3 Fromages", genres: ["Pop Punk", "Punk"] }],
    venueName: name,
    venueOpportunityId: `venue-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-paris-france`,
    eventDate: null,
    isFutureEvent: null,
    isPastEvent: null,
    dateConfidence: "unclear",
    opportunityKind: "actionable",
    derivedFromSimilarArtist: null,
    contacts: [],
    confidence: 0.72,
    evidence: ["Structured Ticketmaster programming evidence: Les 3 Fromages (Pop Punk)."],
    ...overrides
  };
}

function eventTarget(name: string, overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name,
    category: "event",
    city: "Paris",
    country: "France",
    sourceUrl: `https://events.example/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sourceType: "event_page",
    sourceProvider: "ticketmaster",
    genres: ["Pop Punk"],
    venueName: "L'OLYMPIA",
    venueOpportunityId: "venue-l-olympia-paris-france",
    eventDate: "2026-08-16",
    isFutureEvent: true,
    isPastEvent: false,
    dateConfidence: "verified",
    opportunityKind: "actionable",
    contacts: [],
    confidence: 0.72,
    evidence: ["Structured Ticketmaster event."],
    ...overrides
  };
}

function provider(targets: BookingTarget[], metadata: Record<string, unknown> = {}, providerName = "fixture"): BookingSourceProvider {
  return {
    providerName,
    async search() {
      return { targets, sourceProvider: providerName, searchedQueries: [], warnings: [], metadata };
    }
  };
}

function failingProvider(name: string): BookingSourceProvider {
  return {
    providerName: name,
    async search() {
      throw new Error(`${name} unavailable`);
    }
  };
}

describe("booking venue regression safeguards", () => {
  it("keeps verified regional peers and support targets eligible when popularity fields are missing", () => {
    expect(isEligibleSimilarArtistForBookingVenueDiscovery(similarArtist({ bookingCategory: "regional_peer", estimatedFollowers: null }))).toBe(true);
    expect(isEligibleSimilarArtistForBookingVenueDiscovery(similarArtist({ bookingCategory: "support_target", estimatedFollowers: null }))).toBe(true);
  });

  it("rejects reference artists for booking venue generation", () => {
    expect(isEligibleSimilarArtistForBookingVenueDiscovery(similarArtist({
      name: "Green Day",
      bookingCategory: "reference",
      artistTier: "large",
      estimatedFollowers: 6_500_000,
      totalRelevance: 95,
      genreRelevance: 95
    }))).toBe(false);
  });

  it("rejects Green Day / Levi's Stadium and prefers an empty result over an irrelevant fallback", async () => {
    const result = await searchBookingOpportunities({
      ...input,
      similarArtists: [similarArtist({ name: "Green Day", bookingCategory: "reference", artistTier: "large" })]
    }, {
      now: NOW,
      providers: [provider([
        venueTarget("Levi's Stadium", {
          city: "Santa Clara",
          country: "USA",
          sourceUrl: "https://www.levisstadium.com",
          programmingEvidence: [{ artistName: "Green Day", genres: ["Pop Punk"] }],
          derivedFromSimilarArtist: { name: "Green Day", popularityComparison: "massively_bigger", matchedGenres: ["pop punk"], sourceUrl: "https://example.test/green-day" },
          confidence: 0.5
        })
      ])]
    });

    expect(result.opportunities).toEqual([]);
    expect(result.rejectedByReason.country).toBe(1);
    expect(result.diagnostics.qualityFloorRejectedCandidates).toEqual([]);
  });

  it("returns several valid French venue opportunities and does not delete venues with missing contact or capacity", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        venueTarget("L'OLYMPIA", { estimatedCapacity: null, contacts: [] }),
        venueTarget("LE BACKSTAGE BY THE MILL", { contacts: [] }),
        venueTarget("LA MACHINE DU MOULIN ROUGE", { estimatedCapacity: null }),
        venueTarget("La Maroquinerie", { contacts: [] })
      ], { rawEventCount: 4 })]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual([
      "L'OLYMPIA",
      "LE BACKSTAGE BY THE MILL",
      "LA MACHINE DU MOULIN ROUGE",
      "La Maroquinerie"
    ]);
    expect(result.opportunities.every((opportunity) => opportunity.category === "venue")).toBe(true);
    expect(result.diagnostics.stages.rawProviderTargets).toBe(4);
    expect(result.diagnostics.stages.finalApiOpportunities).toBe(4);
  });

  it("excludes out-of-country venues from a France search", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        venueTarget("L'OLYMPIA"),
        venueTarget("Toronto Arena", { city: "Toronto", country: "Canada" })
      ])]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["L'OLYMPIA"]);
    expect(result.rejectedByReason.country).toBe(1);
  });

  it("does not reject venues by missing, past, old, or too-soon dates", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        venueTarget("No Date", { eventDate: null }),
        venueTarget("Past Venue", { eventDate: "2026-01-10", isPastEvent: true }),
        venueTarget("Old Venue", { eventDate: "2023-01-10", isPastEvent: true }),
        venueTarget("Soon Venue", { eventDate: "2026-08-16", isFutureEvent: true })
      ])]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(expect.arrayContaining(["No Date", "Past Venue", "Old Venue", "Soon Venue"]));
    expect(result.opportunities).toHaveLength(4);
    expect(result.diagnostics.venueLoss.venueCandidatesRejectedByDate).toBe(0);
  });

  it("deduplicates adjacent dates from the same festival edition", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        eventTarget("Aliza'Fest #4 le 21 août 2026 à Le Fidelaire (27)", {
          category: "festival",
          city: null,
          country: "France",
          sourceUrl: "https://agenda.example/alizafest-21-aout",
          sourceType: "festival_page",
          sourceProvider: "openagenda",
          eventDate: "2026-08-21",
          venueName: "Le Fidelaire",
          genres: ["Punk Rock"]
        }),
        eventTarget("Aliza'Fest #4 le 22 août 2026 à Le Fidelaire (27)", {
          category: "festival",
          city: null,
          country: "France",
          sourceUrl: "https://agenda.example/alizafest-22-aout",
          sourceType: "festival_page",
          sourceProvider: "openagenda",
          eventDate: "2026-08-22",
          venueName: "Le Fidelaire",
          genres: ["Punk Rock"]
        }),
        eventTarget("OL'DIRTY BEAT Fest le 21 août 2026 à Campénéac (56)", {
          category: "festival",
          city: null,
          country: "France",
          sourceUrl: "https://agenda.example/oldirty-beat-21-aout",
          sourceType: "festival_page",
          sourceProvider: "openagenda",
          eventDate: "2026-08-21",
          venueName: "Campénéac",
          genres: ["Punk Rock"]
        })
      ])]
    });

    const alizaFestival = result.opportunities.find((opportunity) => opportunity.category === "festival" && opportunity.name.includes("Aliza'Fest"));
    expect(result.opportunities.filter((opportunity) => opportunity.category === "festival" && opportunity.name.includes("Aliza'Fest"))).toHaveLength(1);
    expect(alizaFestival?.dateRange).toEqual({
      start: "2026-08-21",
      end: "2026-08-22"
    });
    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(expect.arrayContaining([
      "OL'DIRTY BEAT Fest le 21 août 2026 à Campénéac (56)"
    ]));
    expect(result.rejectedByReason.duplicate).toBe(2);
  });

  it("creates a venue opportunity from an agenda event before the event date filter runs", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        eventTarget("Aliza'Fest #4 le 21 août 2026 à Le Fidelaire (27)", {
          category: "event",
          city: "Pacy-sur-Eure",
          country: "France",
          sourceUrl: "https://openagenda.example/events/alizafest-21-aout",
          sourceType: "openagenda",
          sourceProvider: "openagenda",
          eventDate: "2026-08-21",
          venueName: "Le Fidelaire",
          genres: ["Punk Rock"]
        })
      ])]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toContain("Le Fidelaire");
    expect(result.opportunities.some((opportunity) => opportunity.name.includes("Aliza'Fest"))).toBe(false);
    const venue = result.opportunities.find((opportunity) => opportunity.name === "Le Fidelaire");
    expect(venue).toMatchObject({
      category: "venue",
      city: "Pacy-sur-Eure",
      country: "France",
      sourceUrl: null
    });
    expect(venue?.target.programmingEvidence?.[0]).toMatchObject({
      eventName: "Aliza'Fest #4 le 21 août 2026 à Le Fidelaire (27)",
      eventDate: "2026-08-21",
      sourceUrl: "https://openagenda.example/events/alizafest-21-aout"
    });
    expect(result.rejectedByReason.tooSoonEvent).toBe(1);
    expect(result.diagnostics.venueLoss.venueCandidatesRejectedByDate).toBe(0);
  });

  it("keeps eligible event opportunities while adding extracted venue opportunities", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        eventTarget("Oakman + Two Trains Left at La Maroquinerie", {
          city: "Paris",
          country: "France",
          sourceUrl: "https://agenda.example/events/oakman-two-trains-left",
          sourceType: "event_page",
          sourceProvider: "scene_agenda",
          eventDate: "2026-10-12",
          venueName: "La Maroquinerie",
          venueOpportunityId: null,
          lineup: ["Oakman", "Two Trains Left"],
          genres: ["Pop Punk"]
        })
      ])]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(expect.arrayContaining([
      "La Maroquinerie",
      "Oakman + Two Trains Left at La Maroquinerie"
    ]));
    const event = result.opportunities.find((opportunity) => opportunity.name === "Oakman + Two Trains Left at La Maroquinerie");
    expect(event).toMatchObject({
      category: "event",
      sourceUrl: "https://agenda.example/events/oakman-two-trains-left",
      venueOpportunityId: "venue-la-maroquinerie-paris-france"
    });
    const venue = result.opportunities.find((opportunity) => opportunity.name === "La Maroquinerie");
    expect(venue).toMatchObject({
      category: "venue",
      sourceUrl: null
    });
  });

  it("does not let extracted venues consume every limited result slot", async () => {
    const result = await searchBookingOpportunities({ ...input, limit: 5 }, {
      now: NOW,
      providers: [provider([
        eventTarget("Compatible Show 1 at Venue 1", { eventDate: "2026-10-01", venueName: "Venue 1", venueOpportunityId: null }),
        eventTarget("Compatible Show 2 at Venue 2", { eventDate: "2026-10-02", venueName: "Venue 2", venueOpportunityId: null }),
        eventTarget("Compatible Show 3 at Venue 3", { eventDate: "2026-10-03", venueName: "Venue 3", venueOpportunityId: null }),
        eventTarget("Compatible Show 4 at Venue 4", { eventDate: "2026-10-04", venueName: "Venue 4", venueOpportunityId: null }),
        eventTarget("Compatible Show 5 at Venue 5", { eventDate: "2026-10-05", venueName: "Venue 5", venueOpportunityId: null })
      ])]
    });

    expect(result.opportunities).toHaveLength(5);
    expect(result.opportunities.some((opportunity) => opportunity.category === "venue")).toBe(true);
    expect(result.opportunities.some((opportunity) => opportunity.category === "event")).toBe(true);
  });

  it("keeps a venue when its event opportunity is too soon and filtered out", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        eventTarget("LES 3 FROMAGES", { eventDate: "2026-08-16" }),
        venueTarget("L'OLYMPIA")
      ])]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["L'OLYMPIA"]);
    expect(result.rejectedByReason.tooSoonEvent).toBe(1);
    expect(result.diagnostics.venueLoss.finalVenueOpportunities).toBe(1);
    expect(result.diagnostics.venueLoss.finalEventOpportunities).toBe(0);
  });

  it("does not reject a venue with pop punk programming for missing native venue genre fields", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        venueTarget("L'OLYMPIA", {
          genres: [],
          programmingEvidence: [{
            artistName: "Les 3 Fromages",
            artistNames: ["Les 3 Fromages"],
            eventName: "LES 3 FROMAGES",
            eventDate: "2026-11-07",
            sourceUrl: "https://www.ticketmaster.fr/fr/manifestation/les-3-fromages",
            genres: ["Pop Punk"]
          }]
        })
      ])]
    });

    expect(result.opportunities[0]?.name).toBe("L'OLYMPIA");
    expect(result.targets[0]?.genres).toEqual([]);
    expect(result.targets[0]?.programmingEvidence?.[0]?.genres).toEqual(["Pop Punk"]);
    expect(result.diagnostics.venueLoss.venueCandidatesRejectedByGenre).toBe(0);
  });

  it("keeps Ticketmaster venues when optional providers fail", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [
        failingProvider("firecrawl"),
        failingProvider("concertspunk"),
        provider([venueTarget("L'OLYMPIA")], { rawEventCount: 1 }, "ticketmaster")
      ]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["L'OLYMPIA"]);
    expect(result.warnings.join(" ")).toContain("firecrawl failed");
    expect(result.warnings.join(" ")).toContain("concertspunk failed");
    expect(result.diagnostics.venueLoss.rawTicketmasterEvents).toBe(1);
  });

  it("keeps Ticketmaster venues when Firecrawl returns HTTP 402", async () => {
    const firecrawl = buildFirecrawlBookingSourceProvider(
      { ENABLE_FIRECRAWL_BOOKING: "true", FIRECRAWL_API_KEY: "test-key" },
      async () => new Response("quota exhausted - payment required", { status: 402 }) as unknown as Response
    );
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [
        firecrawl,
        provider([venueTarget("L'OLYMPIA")], { rawEventCount: 1 }, "ticketmaster")
      ]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["L'OLYMPIA"]);
    expect(result.warnings.some((warning) => warning.includes("quota or credits unavailable"))).toBe(true);
    expect(result.diagnostics.venueLoss.finalVenueOpportunities).toBe(1);
    expect(result.diagnostics.providerAvailability.structuredProviders.ticketmaster).toBe("available");
    expect(result.diagnostics.providerAvailability.extractionProviders.firecrawl).toBe("quota_exhausted");
  });

  it("lists explicit reasons for every quality-floor rejection", async () => {
    const result = await searchBookingOpportunities(input, {
      now: NOW,
      providers: [provider([
        venueTarget("Weak Venue", {
          sourceUrl: null,
          venueOpportunityId: null,
          providerVenueId: null,
          sourceProvider: "web_search",
          sourceType: "search_result",
          programmingEvidence: [],
          pastProgramming: [],
          genres: [],
          confidence: 0.83,
          evidence: ["Weak venue candidate with no structured evidence."]
        })
      ])]
    });

    expect(result.opportunities).toEqual([]);
    expect(result.diagnostics.qualityFloorRejectedCandidates).toHaveLength(1);
    expect(result.diagnostics.qualityFloorRejectedCandidates[0]).toMatchObject({
      name: "Weak Venue",
      category: "venue",
      programmingEvidenceCount: 0,
      hasStructuredVenue: false
    });
    expect(result.diagnostics.qualityFloorRejectedCandidates[0]?.rejectionReasons.length).toBeGreaterThan(0);
  });
});
