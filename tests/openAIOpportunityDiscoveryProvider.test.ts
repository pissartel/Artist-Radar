import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenAIOpportunityDiscoveryProvider,
  clearOpenAIOpportunityDiscoveryCacheForTests,
  OpenAIOpportunityDiscoveryClient,
  type OpenAIResponsesClient
} from "../src/booking/providers/OpenAIOpportunityDiscoveryProvider.js";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";
import type { BookingSourceProvider } from "../src/booking/providers/BookingSourceProvider.js";
import type { SimilarArtist } from "../src/schemas.js";

const NOW = new Date("2026-08-06T12:00:00Z");

function similarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Oakman",
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
    city: "Lyon",
    country: "France",
    source: "test",
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
    genreRelevance: 84,
    localRelevance: 70,
    sizeRelevance: 64,
    sceneRelevance: 74,
    totalRelevance: 80,
    relevanceToUserArtist: 80,
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

function input(overrides: Partial<BookingSearchInput> = {}): BookingSearchInput {
  return {
    artist: "Tuesday Fall",
    city: "Paris",
    genre: "pop punk",
    target: "France",
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
    similarArtists: [
      similarArtist({ name: "Oakman", bookingCategory: "regional_peer" }),
      similarArtist({ name: "Two Trains Left", bookingCategory: "support_target" }),
      similarArtist({ name: "Green Day", bookingCategory: "reference", artistTier: "large", estimatedFollowers: 6_000_000 })
    ],
    ...overrides
  };
}

function candidate(overrides: Record<string, unknown>) {
  return {
    name: "This Is My Fest",
    candidateType: "festival",
    city: "Paris",
    country: "France",
    officialUrl: "https://thisismyfest.example",
    evidenceSources: [{ url: "https://thisismyfest.example", sourceType: "official_site", evidenceText: "Festival lineup includes punk rock and hardcore artists." }],
    compatibleArtists: [{ name: "Oakman", eventName: "This Is My Fest 2025", eventDate: "2025-10-10", venueName: null }],
    genres: ["Punk Rock", "Melodic Hardcore"],
    discoveryMethod: "genre_search",
    discoveryConfidence: 0.86,
    ...overrides
  };
}

function fakeOpenAi(candidatesByCall: Array<Array<Record<string, unknown>>>): { client: OpenAIOpportunityDiscoveryClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => {
    const candidates = candidatesByCall[Math.min(create.mock.calls.length - 1, candidatesByCall.length - 1)] ?? [];
    const urls = candidates.flatMap((entry) => Array.isArray(entry.evidenceSources) ? entry.evidenceSources.map((source) => (source as { url: string }).url) : []);
    return {
      output_text: JSON.stringify({ candidates }),
      output: [{ type: "web_search_call", action: { sources: urls.map((url) => ({ url })) } }]
    };
  });
  const responsesClient: OpenAIResponsesClient = { responses: { create } } as unknown as OpenAIResponsesClient;
  return {
    client: new OpenAIOpportunityDiscoveryClient({ apiKey: "test", model: "test-model", client: responsesClient }),
    create
  };
}

describe("OpenAIOpportunityDiscoveryProvider", () => {
  beforeEach(() => {
    clearOpenAIOpportunityDiscoveryCacheForTests();
  });

  it("discovers a compatible festival that is not exclusively pop punk and keeps it without a future date", async () => {
    const { client } = fakeOpenAi([[candidate({})]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [provider] });

    expect(result.opportunities[0]).toMatchObject({ name: "This Is My Fest", category: "festival", opportunityKind: "prospecting_target" });
    expect(result.opportunities[0]?.sourceUrl).toBe("https://thisismyfest.example");
  });

  it("discovers venues from compatible programming evidence and keeps venues without contact", async () => {
    const { client } = fakeOpenAi([[candidate({
      name: "La Maroquinerie",
      candidateType: "venue",
      officialUrl: "https://www.lamaroquinerie.fr",
      evidenceSources: [{ url: "https://www.lamaroquinerie.fr", sourceType: "official_site", evidenceText: "Venue programming lists Oakman and pop punk concerts." }],
      compatibleArtists: [{ name: "Oakman", eventName: "Oakman at La Maroquinerie", eventDate: "2026-11-20", venueName: "La Maroquinerie" }],
      genres: ["Pop Punk"],
      discoveryMethod: "programming_search"
    })]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [provider] });

    expect(result.opportunities[0]).toMatchObject({ name: "La Maroquinerie", category: "venue", contact: null });
    expect(result.opportunities[0]?.target.programmingEvidence?.[0]?.artistName).toBe("Oakman");
  });

  it("uses regional peers and support targets for similar-artist history prompts but not reference artists", async () => {
    const { client } = fakeOpenAi([[]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "3" },
      client,
      now: NOW
    });

    const result = await provider.search({ input: input(), maxResults: 20 });
    const historyQuery = result.searchedQueries.find((query) => query.includes("last 24 months")) ?? "";

    expect(historyQuery).toContain("Oakman");
    expect(historyQuery).toContain("Two Trains Left");
    expect(historyQuery).not.toContain("Green Day");
  });

  it("rejects ambiguous upcoming dates and does not mark them verified", async () => {
    const { client } = fakeOpenAi([[candidate({
      name: "Ambiguous Punk Night",
      candidateType: "event",
      officialUrl: "https://venue.example/events/punk-night",
      evidenceSources: [{ url: "https://venue.example/events/punk-night", sourceType: "official_event", evidenceText: "Punk night announced for 10 September without a year." }],
      compatibleArtists: [{ name: "Oakman", eventName: "Ambiguous Punk Night", eventDate: "09-10", venueName: "Venue" }],
      genres: ["Pop Punk"],
      discoveryMethod: "similar_artist_upcoming"
    })]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [provider] });

    expect(result.opportunities).toEqual([]);
    expect(result.diagnostics.openAiOpportunityDiscovery.rejectedCandidates[0]).toMatchObject({ name: "Ambiguous Punk Night" });
  });

  it("can return a festival, venue and promoter in the same run", async () => {
    const { client } = fakeOpenAi([[
      candidate({ name: "Burdigala Fest", candidateType: "festival", officialUrl: "https://burdigala.example" }),
      candidate({
        name: "LE BACKSTAGE BY THE MILL",
        candidateType: "venue",
        officialUrl: "https://backstage.example",
        evidenceSources: [{ url: "https://backstage.example", sourceType: "official_site", evidenceText: "Backstage programming includes pop punk shows." }],
        genres: ["Pop Punk"],
        discoveryMethod: "programming_search"
      }),
      candidate({
        name: "Punk Fiction",
        candidateType: "promoter",
        officialUrl: "https://punkfiction.example",
        evidenceSources: [{ url: "https://punkfiction.example", sourceType: "official_site", evidenceText: "Promoter organizes punk rock and emo shows in France." }],
        genres: ["Punk Rock", "Emo"],
        discoveryMethod: "scene_search"
      })
    ]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [provider] });

    expect(result.opportunities.map((opportunity) => opportunity.category)).toEqual(expect.arrayContaining(["festival", "venue", "promoter"]));
  });

  it("deduplicates with other providers and keeps official URLs over editorial sources", async () => {
    const { client } = fakeOpenAi([[candidate({
      name: "L'OLYMPIA",
      candidateType: "venue",
      officialUrl: null,
      evidenceSources: [{ url: "https://blog.example/olympia-review", sourceType: "editorial", evidenceText: "Editorial review mentions pop punk at L'Olympia." }],
      compatibleArtists: [{ name: "Oakman", eventName: "Oakman", eventDate: "2026-11-20", venueName: "L'OLYMPIA" }],
      genres: ["Pop Punk"],
      discoveryMethod: "programming_search"
    })]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });
    const ticketmaster = {
      providerName: "ticketmaster",
      async search() {
        return {
          sourceProvider: "ticketmaster",
          searchedQueries: [],
          warnings: [],
          metadata: { rawEventCount: 1 },
          targets: [ticketmasterVenue("L'OLYMPIA")]
        };
      }
    };

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [provider, ticketmaster] });

    expect(result.opportunities.filter((opportunity) => opportunity.name === "L'OLYMPIA")).toHaveLength(1);
    expect(result.opportunities[0]?.sourceUrl).toBe("https://www.ticketmaster.fr/fr/salle/l-olympia/idsite/34");
    expect(result.diagnostics.openAiOpportunityDiscovery.candidates.mergedWithOtherProviders).toBeGreaterThan(0);
  });

  it("keeps Green Day from generating Levi's Stadium as an actionable French opportunity", async () => {
    const { client } = fakeOpenAi([[candidate({
      name: "Levi's Stadium",
      candidateType: "venue",
      city: "Santa Clara",
      country: "USA",
      officialUrl: "https://www.levisstadium.com",
      evidenceSources: [{ url: "https://www.levisstadium.com", sourceType: "official_site", evidenceText: "Green Day played Levi's Stadium." }],
      compatibleArtists: [{ name: "Green Day", eventName: "Green Day stadium show", eventDate: "2025-09-20", venueName: "Levi's Stadium" }],
      genres: ["Pop Punk"],
      discoveryMethod: "scene_search"
    })]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [provider] });

    expect(result.opportunities).toEqual([]);
    expect(result.rejectedByReason.country).toBe(1);
  });

  it("uses expanded mode diagnostics when configured for Firecrawl-degraded discovery", async () => {
    const { client } = fakeOpenAi([[]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_DISCOVERY_MODE: "expanded", OPENAI_BOOKING_MAX_SEARCH_CALLS: "7" },
      client,
      now: NOW
    });

    const result = await provider.search({ input: input(), maxResults: 20 });

    expect(result.metadata.openAiOpportunityDiscoveryDiagnostics).toMatchObject({
      mode: "expanded",
      searches: expect.objectContaining({ venueQueries: 2, organizationQueries: 2 })
    });
  });

  it("activates expanded OpenAI discovery when Firecrawl reports HTTP 402 and still returns French opportunities", async () => {
    const { client } = fakeOpenAi([[candidate({
      name: "Xtreme Fest",
      candidateType: "festival",
      officialUrl: "https://xtremefest.example",
      evidenceSources: [{ url: "https://xtremefest.example", sourceType: "official_site", evidenceText: "Festival programs punk rock and melodic hardcore artists in France." }],
      genres: ["Punk Rock", "Melodic Hardcore"]
    })]]);
    const firecrawl402: BookingSourceProvider = {
      providerName: "firecrawl_booking",
      async search() {
        return {
          sourceProvider: "firecrawl_booking",
          searchedQueries: [],
          targets: [],
          warnings: ["Firecrawl disabled for this run: quota or credits unavailable (HTTP 402)."],
          metadata: { enabled: false, disabledReason: "Firecrawl disabled for this run: quota or credits unavailable (HTTP 402)." }
        };
      }
    };
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    const result = await searchBookingOpportunities(input(), { now: NOW, providers: [firecrawl402, provider] });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toContain("Xtreme Fest");
    expect(result.diagnostics.openAiOpportunityDiscovery.mode).toBe("expanded");
    expect(result.diagnostics.providerAvailability.extractionProviders.firecrawl).toBe("quota_exhausted");
  });

  it("caches identical OpenAI searches", async () => {
    const uniqueInput = input({ artist: "Cache Test Artist" });
    const { client, create } = fakeOpenAi([[]]);
    const provider = buildOpenAIOpportunityDiscoveryProvider({
      env: { OPENAI_BOOKING_DISCOVERY_ENABLED: "true", OPENAI_API_KEY: "test", OPENAI_BOOKING_MAX_SEARCH_CALLS: "1" },
      client,
      now: NOW
    });

    await provider.search({ input: uniqueInput, maxResults: 20 });
    await provider.search({ input: uniqueInput, maxResults: 20 });

    expect(create).toHaveBeenCalledTimes(1);
  });
});

function ticketmasterVenue(name: string): BookingTarget {
  return {
    name,
    category: "venue",
    city: "Paris",
    country: "France",
    sourceUrl: "https://www.ticketmaster.fr/fr/salle/l-olympia/idsite/34",
    sourceType: "venue_official_programming_page",
    sourceProvider: "ticketmaster",
    genres: ["Pop Punk"],
    venueName: name,
    venueOpportunityId: "venue-l-olympia-paris-france",
    eventDate: null,
    isFutureEvent: null,
    isPastEvent: null,
    dateConfidence: "unclear",
    opportunityKind: "actionable",
    contacts: [],
    confidence: 0.8,
    evidence: ["Structured Ticketmaster venue."],
    programmingEvidence: [{ artistName: "Oakman", genres: ["Pop Punk"], eventName: "Oakman", eventDate: "2026-11-20", sourceUrl: "https://ticketmaster.example/event" }]
  };
}
