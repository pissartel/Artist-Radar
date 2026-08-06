import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyBookingTarget } from "../src/booking/classifyTarget.js";
import { extractPublicContactSignals } from "../src/booking/contactExtraction.js";
import { getRelatedGenres, matchBookingGenres } from "../src/booking/genreMatching.js";
import { buildDefaultBookingSourceProviders } from "../src/booking/providers/BookingSourceProvider.js";
import { buildMockBookingSourceProvider } from "../src/booking/providers/MockBookingSourceProvider.js";
import { buildOpenAgendaBookingSourceProvider } from "../src/booking/providers/OpenAgendaBookingSourceProvider.js";
import { buildSceneAgendaBookingSourceProvider, getSceneAgendaSourceStatuses } from "../src/booking/providers/SceneAgendaProvider.js";
import {
  buildSimilarArtistLiveHistoryBookingSourceProvider,
  buildSupportSlotDiscoveryQueries,
  getSupportSlotRelatedGenres
} from "../src/booking/providers/SimilarArtistLiveHistoryBookingSourceProvider.js";
import { buildNativeFetchSceneAgendaProvider, getNativeFetchSceneAgendaStatus } from "../src/booking/providers/NativeFetchSceneAgendaProvider.js";
import { buildFirecrawlBookingSourceProvider, isFirecrawlBookingEnabled } from "../src/booking/providers/FirecrawlBookingSourceProvider.js";
import { getEnabledBookingSearchProviders } from "../src/providers/web/providers.js";
import { buildWebSearchBookingSourceProvider } from "../src/booking/providers/WebSearchBookingSourceProvider.js";
import { normalizeBookingSource } from "../src/booking/normalizeBookingTarget.js";
import { recommendBookingAction, scoreBookingCompatibility } from "../src/booking/scoring.js";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import { buildBookingSearchExtractionPrompt } from "../src/prompts.js";
import type { SimilarArtist } from "../src/schemas.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";
import type { BookingSourceProvider } from "../src/booking/providers/BookingSourceProvider.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 5,
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
  }
};

describe("Booking Search core", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns related genres for pop punk", () => {
    expect(getRelatedGenres(["pop punk"])).toEqual(expect.arrayContaining(["punk rock", "emo", "easycore"]));
  });

  it("scores genre matching by exact, related, generic and incompatible levels", () => {
    expect(matchBookingGenres(["pop punk"], ["pop punk"]).level).toBe("exact");
    expect(matchBookingGenres(["pop punk"], ["punk rock"]).level).toBe("related");
    expect(matchBookingGenres(["pop punk"], ["emo"]).level).toBe("related");
    expect(matchBookingGenres(["pop punk"], ["easycore"]).level).toBe("related");
    expect(matchBookingGenres(["pop punk"], ["rock"]).level).toBe("generic");
    expect(matchBookingGenres(["pop punk"], ["rock"]).score).toBeLessThan(60);
    expect(matchBookingGenres(["pop punk"], ["techno"]).level).toBe("incompatible");
  });

  it("classifies support slot and open call targets from public text", () => {
    expect(classifyBookingTarget({ name: "Lineup Show", text: "support TBA", url: "https://example.test/show" }).category).toBe("event");
    expect(classifyBookingTarget({ name: "Premiere Partie", text: "première partie à venir", url: "https://example.test/show-fr" }).category).toBe("event");
    expect(classifyBookingTarget({ name: "Festival", text: "festival open air", url: "https://example.test/festival" }).category).toBe("festival");
    expect(classifyBookingTarget({ name: "Springboard", text: "tremplin pop punk", url: "https://example.test/springboard" }).category).toBe("springboard");
    expect(classifyBookingTarget({ name: "Open Call", text: "appel à candidature", url: "https://example.test/apply" }).category).toBe("open_call");
  });

  it("classifies association and collective booking targets", () => {
    expect(classifyBookingTarget({ name: "Local Crew", text: "collectif punk qui organise des concerts", url: "https://example.test/crew" }).category).toBe("collective");
    expect(classifyBookingTarget({ name: "Association Shows", text: "association locale de concerts", url: "https://example.test/asso" }).category).toBe("association");
  });

  it("extracts public booking contacts with stronger confidence than press contacts", () => {
    const contacts = extractPublicContactSignals(
      "Booking: booking@example.test Programmation: programming@example.test Billetterie: billetterie@example.test Presse: presse@example.test",
      ["https://example.test/contact"]
    );

    expect(contacts.find((contact) => contact.value === "booking@example.test")?.confidence).toBeGreaterThan(
      contacts.find((contact) => contact.value === "billetterie@example.test")?.confidence ?? 1
    );
    expect(contacts.find((contact) => contact.value === "programming@example.test")?.confidence).toBeGreaterThan(
      contacts.find((contact) => contact.value === "presse@example.test")?.confidence ?? 1
    );
    expect(contacts.some((contact) => contact.type === "contact_form")).toBe(true);
  });

  it("raises support slot likelihood for support TBA and premiere partie wording", () => {
    const baseline = scoreBookingCompatibility(input, baseTarget({ description: "Regular pop punk club night." }));
    const supportTba = scoreBookingCompatibility(input, baseTarget({ description: "Pop punk night with support TBA." }));
    const premierePartie = scoreBookingCompatibility(input, baseTarget({ description: "Concert pop punk, première partie à venir." }));

    expect(supportTba.supportSlotPotential).toBeGreaterThan(baseline.supportSlotPotential);
    expect(premierePartie.supportSlotPotential).toBeGreaterThan(baseline.supportSlotPotential);
  });

  it("recommends support slot when capacity is too large for an emerging artist", () => {
    const target = baseTarget({
      estimatedCapacity: 1200,
      genres: ["pop punk"],
      description: "Venue programming pop punk shows."
    });

    const score = scoreBookingCompatibility(input, target);
    const action = recommendBookingAction(input, target, score);

    expect(score.genreFit).toBeGreaterThan(80);
    expect(score.sizeFit).toBeLessThan(50);
    expect(action).toBe("support_slot");
  });

  it("explains recommendation quality with confidence and warnings", () => {
    const target = baseTarget({
      estimatedCapacity: 1200,
      genres: ["rock"],
      confidence: 0.4,
      description: "Line-up soon for a rock night.",
      evidence: ["line-up soon"]
    });

    const score = scoreBookingCompatibility(input, target);

    expect(score.confidence).toBeGreaterThanOrEqual(0);
    expect(score.reason).toContain("Genre fit:");
    expect(score.reason).toContain("Size/capacity fit:");
    expect(score.reason).toContain("Contact confidence:");
    expect(score.reason).toContain("Source confidence:");
    expect(score.warnings).toEqual(expect.arrayContaining([
      "Source does not expose a public booking contact.",
      "Venue capacity may be too large for headline; treat this as a support-slot lead.",
      "Support slot is inferred, not confirmed.",
      "Source confidence is low; verify against an official page."
    ]));
  });

  it("searchBookingOpportunities sorts provider targets by compatibility score", async () => {
    const result = await searchBookingOpportunities(input, {
      providers: [buildMockBookingSourceProvider()]
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.name).toBe("Mock Pop Punk Club");
    expect(result.opportunities[0]?.contact).toBe("booking@example.test");
    expect(result.opportunities[0]?.confidence).toBeGreaterThan(0);
    expect(Array.isArray(result.opportunities[0]?.warnings)).toBe(true);
  });

  it("builds a display title, summary and internal review alongside the raw title", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_title_provider",
      async search() {
        return {
          sourceProvider: "qa_title_provider",
          searchedQueries: ["qa"],
          warnings: [],
          metadata: {},
          targets: [
            baseTarget({
              name: "music.box PACA - Mina Warren en replay - France TV",
              genres: ["pop punk"],
              description: "Programmation pop punk.",
              contacts: [],
              confidence: 0.9
            })
          ]
        };
      }
    };

    const result = await searchBookingOpportunities(input, { providers: [provider] });
    const opportunity = result.opportunities[0];

    expect(opportunity?.rawTitle).toBe("music.box PACA - Mina Warren en replay - France TV");
    expect(opportunity?.displayTitle).toBe("music.box PACA - Mina Warren");
    expect(opportunity?.summary).toContain("music.box PACA - Mina Warren");
    expect(opportunity?.internalReview.needsReview).toBe(true);
    expect(opportunity?.internalReview.missingFields).toEqual(expect.arrayContaining(["date", "contact"]));
    expect(opportunity?.internalReview.confidence).toBeGreaterThanOrEqual(0);
    expect(opportunity?.internalReview.confidence).toBeLessThanOrEqual(1);
  });

  it("searchBookingOpportunities returns sorted opportunities with reasons and contacts when available", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_booking_provider",
      async search() {
        return {
          sourceProvider: "qa_booking_provider",
          searchedQueries: ["qa"],
          warnings: ["Provider-level warning."],
          metadata: { test: true },
          targets: [
            baseTarget({
              name: "Weak Rock Room",
              genres: ["rock"],
              estimatedCapacity: 900,
              confidence: 0.5,
              contacts: [],
              sourceUrl: "https://example.test/weak-rock-room"
            }),
            baseTarget({
              name: "Strong Punk Room",
              genres: ["pop punk", "punk rock"],
              estimatedCapacity: 220,
              confidence: 0.9,
              description: "Programmation pop punk. Booking: booking@example.test",
              contacts: [{
                type: "email",
                value: "booking@example.test",
                sourceUrl: "https://example.test/strong-punk-room",
                confidence: 0.9
              }],
              sourceUrl: "https://example.test/strong-punk-room"
            })
          ]
        };
      }
    };

    const result = await searchBookingOpportunities(input, { providers: [provider] });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Strong Punk Room"]);
    expect(result.opportunities[0]?.contact).toBe("booking@example.test");
    expect(result.opportunities[0]?.reason).toContain("Genre fit:");
    expect(result.opportunities[0]?.suggestedAction).toBe("booking_contact");
    expect(result.warnings).toEqual(expect.arrayContaining(["Provider-level warning."]));
    expect(result.sourceMetadata[0]).toMatchObject({
      sourceProvider: "qa_booking_provider",
      targetCount: 2,
      warnings: ["Provider-level warning."]
    });
  });

  it("returns empty opportunities gracefully with warnings when no provider finds targets", async () => {
    const emptyProvider: BookingSourceProvider = {
      providerName: "empty_provider",
      async search() {
        return {
          sourceProvider: "empty_provider",
          searchedQueries: ["qa"],
          warnings: ["empty_provider found nothing for this query."],
          metadata: {},
          targets: []
        };
      }
    };

    const result = await searchBookingOpportunities(input, { providers: [emptyProvider] });

    expect(result.opportunities).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining(["empty_provider found nothing for this query."]));
  });

  it("keeps other providers' results when one provider throws", async () => {
    const brokenProvider: BookingSourceProvider = {
      providerName: "broken_provider",
      async search() {
        throw new Error("HTTP 403");
      }
    };
    const workingProvider: BookingSourceProvider = {
      providerName: "working_provider",
      async search() {
        return {
          sourceProvider: "working_provider",
          searchedQueries: ["qa"],
          warnings: [],
          metadata: {},
          targets: [
            baseTarget({
              name: "Working Punk Room",
              genres: ["pop punk"],
              confidence: 0.9,
              contacts: [],
              sourceUrl: "https://example.test/working-punk-room"
            })
          ]
        };
      }
    };

    const result = await searchBookingOpportunities(input, {
      providers: [brokenProvider, workingProvider]
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Working Punk Room"]);
    expect(result.warnings.some((warning) => warning.includes("broken_provider failed and was skipped"))).toBe(true);
  });

  it("normalizes raw booking source data while preserving source and contact URLs", () => {
    const target = normalizeBookingSource({
      name: "Official Venue",
      url: "https://example.test/venue",
      text: "Salle de concert pop punk. Booking: book@example.test",
      links: ["https://example.test/contact"],
      genres: ["pop punk"],
      confidence: 0.8
    });

    expect(target?.sourceUrl).toBe("https://example.test/venue");
    expect(target?.contacts[0]?.sourceUrl).toBe("https://example.test/venue");
    expect(target?.confidence).toBe(0.8);
  });

  it("wraps existing web search/extract providers into BookingSourceProvider", async () => {
    const provider = buildWebSearchBookingSourceProvider({
      maxQueries: 1,
      maxResultsPerQuery: 1,
      maxExtractPages: 1,
      webSearchProvider: {
        providerName: "test-search",
        async search() {
          return [{
            title: "Pop Punk Venue",
            url: "https://example.test/pop-punk-venue",
            snippet: "Paris, France venue programmation pop punk booking@example.test 2026-07-01",
            sourceProvider: "test-search",
            confidence: 0.7,
            links: []
          }];
        }
      },
      webExtractProvider: {
        providerName: "test-extract",
        async extract(url) {
          return {
            url,
            title: "Pop Punk Venue",
            text: "Official venue page in Paris, France with pop punk concerts. 2026-07-01",
            markdown: "Official venue page in Paris, France with pop punk concerts. 2026-07-01",
            sourceProvider: "test-extract",
            statusCode: 200
          };
        }
      }
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-15T00:00:00Z")
    });

    expect(result.targets.some((target) => target.sourceUrl === "https://example.test/pop-punk-venue")).toBe(true);
    expect(result.opportunities[0]?.sourceUrl).toBe("https://example.test/pop-punk-venue");
    expect(result.sourceMetadata[0]?.metadata).toMatchObject({
      searchProvider: "test-search",
      extractProvider: "test-extract"
    });
  });

  it("returns an OpenAgenda provider warning when disabled", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({ env: {} });
    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings[0]).toContain("OpenAgenda booking provider is disabled");
    expect(result.metadata).toMatchObject({ enabled: false });
  });

  it("logs booking provider startup status without secret values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    buildDefaultBookingSourceProviders({
      ENABLE_OPENAGENDA: "true",
      OPENAGENDA_AGENDA_UIDS: "agenda",
      OPENAGENDA_API_KEY: "secret-openagenda-key",
      ENABLE_FIRECRAWL_CONSOLIDATION: "true",
      FIRECRAWL_API_KEY: "secret-firecrawl-key",
      MOCK_AI: "false"
    });

    const message = warn.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("[booking] Booking providers:");
    expect(message).toContain("- OpenAgenda: enabled");
    expect(message).toContain("- Firecrawl: enabled");
    expect(message).toContain("- Mock: disabled");
    expect(message).not.toContain("secret-openagenda-key");
    expect(message).not.toContain("secret-firecrawl-key");
  });

  it("disables OpenAgenda gracefully when the API key is missing", async () => {
    const fetchMock = vi.fn();
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true"
      },
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.targets).toEqual([]);
    expect(result.warnings[0]).toContain("missing OPENAGENDA_API_KEY");
    expect(result.metadata).toMatchObject({ enabled: false, reason: "missing_api_key" });
  });

  it("normalizes OpenAgenda events without inventing contacts", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key",
        OPENAGENDA_AGENDA_UIDS: "agenda"
      },
      fetchImpl: async () => new Response(JSON.stringify({
        total: 1,
        events: [{
          uid: 123,
          title: { fr: "Festival Pop Punk" },
          description: { fr: "Festival pop punk à Paris. Appel à candidature ouvert." },
          canonicalUrl: "https://openagenda.com/agenda/events/123",
          keywords: ["pop punk"],
          location: { city: "Paris", country: "France" },
          firstTiming: { begin: "2026-07-01T20:00:00+02:00" }
        }]
      }), { status: 200 }) as unknown as Response
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({
      name: "Festival Pop Punk",
      category: "open_call",
      sourceUrl: "https://openagenda.com/agenda/events/123",
      eventDate: "2026-07-01T20:00:00+02:00",
      contacts: []
    });
  });

  it("normalizes OpenAgenda events when keywords and tags are not arrays", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key",
        OPENAGENDA_AGENDA_UIDS: "agenda"
      },
      fetchImpl: async () => new Response(JSON.stringify({
        total: 1,
        events: [{
          uid: 124,
          title: { fr: "Concert format variable" },
          description: { fr: "Concert à Paris." },
          canonicalUrl: "https://openagenda.com/agenda/events/124",
          keywords: { fr: ["pop punk", "concert"] },
          tags: "festival",
          location: { city: "Paris", country: "France" }
        }]
      }), { status: 200 }) as unknown as Response
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]?.genres).toEqual(expect.arrayContaining(["pop punk", "concert"]));
    expect(result.targets[0]?.description).toContain("pop punk");
  });

  it("uses configured OpenAgenda agenda UIDs before discovery", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      expect(endpoint).toContain("/v2/agendas/paris-env/events");
      return new Response(JSON.stringify({
        total: 1,
        events: [{
          uid: 456,
          title: { fr: "Concert env Paris" },
          description: { fr: "Concert pop punk Paris." },
          canonicalUrl: "https://openagenda.com/paris-env/events/456",
          keywords: ["pop punk"],
          location: { city: "Paris", country: "France" }
        }]
      }), { status: 200 }) as unknown as Response;
    });
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key",
        OPENAGENDA_AGENDA_UIDS: "paris-env"
      },
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.targets[0]?.name).toBe("Concert env Paris");
    expect(result.metadata).toMatchObject({
      configuredAgendaUids: ["paris-env"],
      selectedAgendaUids: ["paris-env"],
      selectedAgendas: [{
        uid: "paris-env",
        sourceUrl: "https://openagenda.com/agendas/paris-env",
        source: "env_override"
      }]
    });
  });

  it("uses configured OpenAgenda seed agenda UIDs before discovery", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      expect(endpoint).toContain("/v2/agendas/paris-seed/events");
      return new Response(JSON.stringify({
        total: 1,
        events: [{
          uid: 457,
          title: { fr: "Concert seed Paris" },
          description: { fr: "Concert pop punk Paris." },
          canonicalUrl: "https://openagenda.com/paris-seed/events/457",
          keywords: ["pop punk"],
          location: { city: "Paris", country: "France" }
        }]
      }), { status: 200 }) as unknown as Response;
    });
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      seeds: [{
        locationKey: "paris",
        city: "Paris",
        region: "Ile-de-France",
        country: "France",
        agendaUids: ["paris-seed"],
        keywords: ["concert", "musiques actuelles"],
        nearbyCities: ["Montreuil"]
      }],
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.targets[0]?.name).toBe("Concert seed Paris");
    expect(result.metadata).toMatchObject({
      seedLocationKeys: ["paris"],
      seedAgendaUids: ["paris-seed"],
      seedAgendaUidsUsed: 1,
      selectedAgendas: [{
        uid: "paris-seed",
        source: "seed"
      }]
    });
  });

  it("discovers OpenAgenda agenda UIDs when no configured UID exists", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (endpoint.includes("/v2/agendas?") && !endpoint.includes("/events")) {
        return new Response(JSON.stringify({
          total: 1,
          agendas: [{
            uid: "discovered-paris",
            slug: "discovered-paris",
            title: { fr: "Agenda découvert Paris" },
            description: { fr: "Concerts musique à Paris" },
            official: true
          }]
        }), { status: 200 }) as unknown as Response;
      }

      expect(endpoint).toContain("/v2/agendas/discovered-paris/events");
      return new Response(JSON.stringify({
        total: 1,
        events: [{
          uid: 789,
          title: { fr: "Concert découvert" },
          description: { fr: "Concert pop punk à Paris." },
          canonicalUrl: "https://openagenda.com/discovered-paris/events/789",
          keywords: ["pop punk"],
          location: { city: "Paris", country: "France" }
        }]
      }), { status: 200 }) as unknown as Response;
    });
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.targets[0]?.name).toBe("Concert découvert");
    expect(result.warnings[0]).toContain("OpenAgenda discovered agenda UIDs for future seed review");
    expect(result.metadata).toMatchObject({
      configuredAgendaUids: [],
      seedAgendaUidsUsed: 0,
      discoveredAgendaUids: ["discovered-paris"],
      selectedAgendaUids: ["discovered-paris"],
      eventSourceUrls: ["https://openagenda.com/discovered-paris/events/789"],
      selectedAgendas: [{
        uid: "discovered-paris",
        title: "Agenda découvert Paris",
        slug: "discovered-paris",
        official: true,
        sourceUrl: "https://openagenda.com/discovered-paris",
        source: "discovery"
      }]
    });
  });

  it("falls back to artist location and nearby cities when request city is missing", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ agendas: [] }), { status: 200 }) as unknown as Response)
    });

    const result = await provider.search({
      input: {
        ...input,
        city: "",
        target: null,
        artistProfile: {
          ...input.artistProfile!,
          city: "Paris"
        }
      },
      maxResults: 5
    });

    expect(result.metadata.locationsSearched).toEqual(expect.arrayContaining(["Paris", "Montreuil", "Pantin", "Saint-Denis", "Ivry-sur-Seine"]));
  });

  it("expands grandes villes françaises target to major French cities", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ agendas: [] }), { status: 200 }) as unknown as Response)
    });

    const result = await provider.search({
      input: {
        ...input,
        target: "grandes villes françaises"
      },
      maxResults: 5
    });

    expect(result.metadata.locationsSearched).toEqual(expect.arrayContaining([
      "Paris",
      "Lyon",
      "Marseille",
      "Lille",
      "Nantes",
      "Bordeaux",
      "Toulouse",
      "Rennes",
      "Strasbourg",
      "Montpellier"
    ]));
  });

  it("uses genre-aware OpenAgenda discovery keywords for pop punk", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ agendas: [] }), { status: 200 }) as unknown as Response)
    });

    const result = await provider.search({ input, maxResults: 5 });
    const queries = result.searchedQueries.join(" | ");

    expect(queries).toContain("pop punk");
    expect(queries).toContain("punk rock");
    expect(queries).toContain("emo");
    expect(queries).toContain("musiques actuelles");
  });

  it("returns a clear warning when OpenAgenda agenda discovery finds nothing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      total: 0,
      agendas: []
    }), { status: 200 }) as unknown as Response);
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      fetchImpl: fetchMock as unknown as typeof fetch
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings).toEqual([
      "OpenAgenda agenda discovery found no relevant public agendas for the requested location."
    ]);
    expect(result.metadata).toMatchObject({
      enabled: true,
      selectedAgendaUids: []
    });
  });

  it("returns a clear warning when OpenAgenda agenda discovery fails", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA: "true",
        OPENAGENDA_API_KEY: "test-key"
      },
      fetchImpl: vi.fn(async () => {
        throw new Error("network unavailable");
      }) as unknown as typeof fetch
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("OpenAgenda agenda discovery failed"))).toBe(true);
    expect(result.warnings).toContain("OpenAgenda agenda discovery found no relevant public agendas for the requested location.");
  });

  it("filters booking candidates by recent date and strict pop punk genre evidence", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_filter_provider",
      async search() {
        return {
          sourceProvider: "qa_filter_provider",
          searchedQueries: ["filter"],
          warnings: [],
          metadata: {},
          targets: [
            baseTarget({ name: "Future Pop Punk", genres: ["pop punk"], eventDate: "2026-08-01", confidence: 0.8 }),
            baseTarget({ name: "Recent Emo", category: "event", genres: ["emo"], eventDate: "2025-06-01", confidence: 0.8 }),
            // category "event" (not the default "venue"): this row tests that an
            // old *dated event* gets rejected. Venue/organization candidates are
            // evergreen and are deliberately exempt from date-based rejection
            // (issue #168) — see venueDiscoveryBookingSourceProvider.test.ts.
            baseTarget({ name: "Old Punk", category: "event", genres: ["punk rock"], eventDate: "2023-01-01", confidence: 0.9 }),
            baseTarget({ name: "Techno Only", genres: ["techno"], description: "Techno club night.", eventDate: "2026-08-01", confidence: 0.9 }),
            baseTarget({ name: "Generic Rock", genres: ["rock"], description: "Rock concert music.", eventDate: "2026-08-01", confidence: 0.9 })
          ]
        };
      }
    };

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Future Pop Punk"]);
    expect(result.targets.some((target) => target.name === "Recent Emo" && target.opportunityKind === "historical_signal")).toBe(true);
    expect(result.rejectedByReason.pastEvent).toBe(2);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Booking relevance rejected 1 events older than 24 months.",
      "Booking relevance excluded 1 past events from actionable opportunities (kept as historical signals).",
      "Booking relevance rejected 1 genre-mismatch candidates.",
      "Booking quality floor rejected 1 low-quality candidates."
    ]));
  });

  it("ranks similar-artist live history above OpenAgenda when both are genre/date matched", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_priority_provider",
      async search() {
        return {
          sourceProvider: "qa_priority_provider",
          searchedQueries: ["priority"],
          warnings: [],
          metadata: {},
          targets: [
            baseTarget({
              name: "OpenAgenda Pop Punk Event",
              sourceType: "openagenda",
              sourceProvider: "openagenda_booking",
              genres: ["pop punk"],
              eventDate: "2026-08-01",
              confidence: 0.9
            }),
            baseTarget({
              name: "Peer Venue Live History",
              sourceType: "similar_artist_live_history",
              sourceProvider: "similar_artist_live_history:test",
              genres: ["pop punk"],
              eventDate: "2026-09-01",
              confidence: 0.86,
              derivedFromSimilarArtist: {
                name: "Comparable Punk Band",
                popularityComparison: "same_tier",
                matchedGenres: ["pop punk"],
                sourceUrl: "https://example.test/comparable-punk-band"
              }
            })
          ]
        };
      }
    };

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities[0]?.name).toBe("Peer Venue Live History");
    expect(result.opportunities[0]?.derivedFromSimilarArtist).toMatchObject({
      name: "Comparable Punk Band",
      popularityComparison: "same_tier"
    });
    expect(result.opportunities[0]?.reason).toContain("Similar artist Comparable Punk Band");
  });

  it("treats massively bigger similar artists as support-slot references", () => {
    const target = baseTarget({
      sourceType: "similar_artist_live_history",
      genres: ["pop punk"],
      eventDate: "2026-08-01",
      derivedFromSimilarArtist: {
        name: "Arena Pop Punk Band",
        popularityComparison: "massively_bigger",
        matchedGenres: ["pop punk"],
        sourceUrl: "https://example.test/arena-pop-punk-band"
      }
    });

    const score = scoreBookingCompatibility(input, target);

    expect(recommendBookingAction(input, target, score)).toBe("support_slot");
  });

  it("uses comparable similar artists as booking context without returning them as opportunities", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_similar_context_provider",
      async search({ input }) {
        const artist = input.similarArtists?.[0];
        return {
          sourceProvider: "qa_similar_context_provider",
          searchedQueries: [],
          warnings: [],
          metadata: { similarArtistsConsidered: input.similarArtists?.length ?? 0 },
          targets: artist
            ? [baseTarget({
                name: "Venue From Similar Artist",
                sourceType: "similar_artist_live_history",
                genres: artist.genres,
                eventDate: "2026-08-01",
                derivedFromSimilarArtist: {
                  name: artist.name,
                  popularityComparison: "same_tier",
                  matchedGenres: ["pop punk"],
                  sourceUrl: artist.sourceUrls[0] ?? artist.url
                }
              })]
            : []
        };
      }
    };

    const result = await searchBookingOpportunities({
      ...input,
      similarArtists: [baseSimilarArtist({ name: "Comparable Punk Band" })]
    }, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.name).toBe("Venue From Similar Artist");
    expect(result.opportunities[0]?.name).not.toBe("Comparable Punk Band");
    expect(result.opportunities[0]?.derivedFromSimilarArtist?.name).toBe("Comparable Punk Band");
  });

  it("keeps future specialized scene agenda events and treats recent past ones as historical signals with strict pop punk evidence", async () => {
    const provider = buildSceneAgendaBookingSourceProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      now: new Date("2026-06-09T12:00:00Z"),
      maxQueries: 1,
      maxResultsPerQuery: 3,
      webSearchProvider: {
        providerName: "scene-test-search",
        async search() {
          return [
            sceneResult("Future Easycore Night", "Paris easycore pop punk punk rock + guest 2026-08-01", "future"),
            sceneResult("Recent Emo Venue History", "Paris emo punk rock show 2025-06-01", "recent"),
            sceneResult("Old Punk Archive", "Paris punk rock show 2023-01-01", "old")
          ];
        }
      }
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Future Easycore Night"]);
    expect(result.opportunities.some((opportunity) => opportunity.name === "Recent Emo Venue History")).toBe(false);
    expect(result.opportunities.some((opportunity) => opportunity.name === "Old Punk Archive")).toBe(false);
    expect(result.targets.some((target) => target.name === "Recent Emo Venue History" && target.opportunityKind === "historical_signal")).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Booking relevance rejected 1 events older than 24 months."
    ]));
  });

  it("rejects generic rock/concert and metal-only scene events for pop punk unless crossover evidence exists", async () => {
    const provider = buildSceneAgendaBookingSourceProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      now: new Date("2026-06-09T12:00:00Z"),
      maxQueries: 1,
      maxResultsPerQuery: 3,
      webSearchProvider: {
        providerName: "scene-test-search",
        async search() {
          return [
            sceneResult("Generic Rock Concert", "Paris rock concert 2026-08-01", "generic"),
            sceneResult("Metal Only Night", "Paris metal heavy metal concert 2026-08-01", "metal"),
            sceneResult("Hardcore Punk Crossover", "Paris metalcore hardcore punk pop punk 2026-08-01", "crossover")
          ];
        }
      }
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Hardcore Punk Crossover"]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Booking relevance rejected 2 genre-mismatch candidates."
    ]));
  });

  it("adds inferred support-slot warning for specialized scene support TBA signals", async () => {
    const provider = buildSceneAgendaBookingSourceProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      now: new Date("2026-06-09T12:00:00Z"),
      maxQueries: 1,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "scene-test-search",
        async search() {
          return [sceneResult("Pop Punk Club Show", "Paris pop punk punk rock support TBA 2026-08-01", "support")];
        }
      }
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities[0]?.sourceType).toBe("specialized_scene_agenda");
    expect(result.opportunities[0]?.warnings).toContain("Support slot is inferred, not confirmed.");
  });

  it("cross-checks scene agenda lineups against similar artists", async () => {
    const provider = buildSceneAgendaBookingSourceProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      now: new Date("2026-06-09T12:00:00Z"),
      maxQueries: 1,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "scene-test-search",
        async search() {
          return [sceneResult("Comparable Punk Band at Club", "Comparable Punk Band pop punk punk rock Paris 2026-08-01", "similar")];
        }
      }
    });

    const result = await searchBookingOpportunities({
      ...input,
      similarArtists: [baseSimilarArtist({ name: "Comparable Punk Band" })]
    }, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities[0]?.derivedFromSimilarArtist).toMatchObject({
      name: "Comparable Punk Band",
      popularityComparison: "same_tier"
    });
    expect(result.opportunities[0]?.reason).toContain("Similar artist Comparable Punk Band");
  });

  it("keeps ConcertsMetal disabled by default and skips protected blocked results", async () => {
    expect(getSceneAgendaSourceStatuses({ ENABLE_SCENE_AGENDAS: "true" }).find((status) => status.key === "concerts_metal")).toMatchObject({
      enabled: false
    });

    const provider = buildSceneAgendaBookingSourceProvider({
      env: {
        ENABLE_SCENE_AGENDAS: "true",
        ENABLE_CONCERTS_PUNK: "false",
        ENABLE_PUNKNROLL_AGENDA: "false",
        ENABLE_RAZIBUS: "false",
        ENABLE_FRANCE_PUNK_SCENE: "false",
        ENABLE_CONCERTS_METAL: "true"
      },
      maxQueries: 1,
      maxResultsPerQuery: 1,
      webSearchProvider: {
        providerName: "scene-test-search",
        async search() {
          return [sceneResult("check_bot", "check_bot CAPTCHA anti-bot page", "protected")];
        }
      }
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.metadata).toMatchObject({ blockedResults: 1 });
    expect(result.warnings.some((warning) => warning.includes("blocked/protected"))).toBe(true);
  });

  it("ranks specialized scene agenda results above matched OpenAgenda results", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_scene_priority_provider",
      async search() {
        return {
          sourceProvider: "qa_scene_priority_provider",
          searchedQueries: ["priority"],
          warnings: [],
          metadata: {},
          targets: [
            baseTarget({
              name: "OpenAgenda Matched Pop Punk Event",
              sourceType: "openagenda",
              sourceProvider: "openagenda_booking",
              genres: ["pop punk"],
              eventDate: "2026-08-01",
              confidence: 0.9
            }),
            baseTarget({
              name: "Scene Agenda Pop Punk Event",
              sourceType: "specialized_scene_agenda",
              sourceProvider: "concerts_punk",
              genres: ["pop punk", "punk rock"],
              eventDate: "2026-08-01",
              confidence: 0.9
            })
          ]
        };
      }
    };

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-09T12:00:00Z")
    });

    expect(result.opportunities[0]?.name).toBe("Scene Agenda Pop Punk Event");
  });

  it("builds a strict source-grounded Booking Search extraction prompt", () => {
    const prompt = buildBookingSearchExtractionPrompt({
      input,
      sourceUrl: "https://example.test/show",
      sourceTitle: "Concerts Paris",
      sourceText: "Concert pop punk à Paris. Booking: book@example.test"
    });

    expect(prompt).toContain("Do not invent contacts");
    expect(prompt).toContain("Never mark a support slot as confirmed unless the source explicitly states it.");
    expect(prompt).toContain("confidence");
    expect(prompt).toContain("warnings");
    expect(prompt).toContain("recommendedNextAction");
    expect(prompt).toContain("must be written in French");
  });
});

describe("Similar artist live-history query improvements", () => {
  it("similar artist city queries quote artist name but not city", async () => {
    const provider = buildSimilarArtistLiveHistoryBookingSourceProvider({
      maxSimilarArtists: 1,
      maxResultsPerArtist: 0,
      webSearchProvider: {
        providerName: "test",
        async search() { return []; }
      }
    });

    const result = await provider.search({
      input: { ...input, similarArtists: [baseSimilarArtist({ name: "Thru It All" })] },
      maxResults: 5
    });

    const artistCityQueries = result.searchedQueries.filter((q) => q.includes("Thru It All") && q.includes("Paris"));
    expect(artistCityQueries.length).toBeGreaterThan(0);
    expect(artistCityQueries.some((q) => q.includes('"Paris"'))).toBe(false);
    expect(artistCityQueries.every((q) => q.includes('"Thru It All"'))).toBe(true);
  });

  it("similar artist queries include France-level variants when city queries return zero results", async () => {
    const provider = buildSimilarArtistLiveHistoryBookingSourceProvider({
      maxSimilarArtists: 1,
      maxResultsPerArtist: 3,
      webSearchProvider: {
        providerName: "test",
        async search(query) {
          if (query.includes("France") && !query.includes("Paris")) {
            return [{ title: "France Venue", url: "https://example.test/fr", snippet: "Concert France pop punk", sourceProvider: "test", confidence: 0.8, links: [] }];
          }
          return [];
        }
      }
    });

    const result = await provider.search({
      input: {
        ...input,
        city: "Paris",
        artistProfile: { ...input.artistProfile!, country: "France" },
        similarArtists: [baseSimilarArtist({ name: "Thru It All" })]
      },
      maxResults: 5
    });

    expect(result.metadata.countryFallbackUsed).toBe(true);
    expect(result.metadata.locationMode).toBe("city_and_country");
    expect(result.searchedQueries.some((q) => q.includes("France") && q.includes("Thru It All"))).toBe(true);
  });

  it("Paris target generates both Paris and France queries in support-slot discovery", () => {
    const queries = buildSupportSlotDiscoveryQueries("pop punk", "Paris", "France");
    expect(queries.some((q) => q.includes("Paris"))).toBe(true);
    expect(queries.some((q) => q.includes("France"))).toBe(true);
  });

  it("support-slot discovery queries are generated without similar artist names", async () => {
    const provider = buildSimilarArtistLiveHistoryBookingSourceProvider({
      maxSimilarArtists: 0,
      maxResultsPerArtist: 0,
      webSearchProvider: {
        providerName: "test",
        async search() { return []; }
      }
    });

    const result = await provider.search({ input, maxResults: 5 });

    const supportSlotQueries = result.searchedQueries.filter(
      (q) => q.includes("première partie") || (q.includes("support") && !q.includes("searchedQueries"))
    );
    expect(supportSlotQueries.length).toBeGreaterThan(0);
    expect(supportSlotQueries.some((q) => q.includes("pop punk"))).toBe(true);
  });

  it("pop punk support-slot related genres include punk, emo, and easycore", () => {
    const genres = getSupportSlotRelatedGenres("pop punk");
    expect(genres).toContain("punk rock");
    expect(genres).toContain("emo");
    expect(genres).toContain("easycore");
  });

  it("pop punk support-slot discovery queries include punk rock and emo variants", () => {
    const queries = buildSupportSlotDiscoveryQueries("pop punk", "Paris", "France");
    const queryText = queries.join(" | ");
    expect(queryText).toContain("punk rock");
    expect(queryText).toContain("emo");
    expect(queryText).toContain("punk");
  });

  it("support signal in support-slot discovery creates support_slot opportunity warning", async () => {
    const provider = buildSimilarArtistLiveHistoryBookingSourceProvider({
      maxSimilarArtists: 0,
      maxResultsPerArtist: 3,
      webSearchProvider: {
        providerName: "test",
        async search() {
          return [{
            title: "Pop Punk Paris Concert",
            url: "https://example.test/concert-pp",
            snippet: "pop punk concert Paris première partie à venir 2026-09-01",
            sourceProvider: "test",
            confidence: 0.82,
            links: []
          }];
        }
      }
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-12T12:00:00Z")
    });

    expect((result.sourceMetadata[0]?.metadata.supportSignalCount as number) ?? 0).toBeGreaterThan(0);
    const supportSlotOpportunity = result.opportunities.find((opp) =>
      opp.warnings.includes("Support slot is inferred, not confirmed.")
    );
    expect(supportSlotOpportunity).toBeDefined();
  });

  it("metadata reports generatedQueryCount, supportSignalCount, locationMode, and resolvedLocations", async () => {
    const provider = buildSimilarArtistLiveHistoryBookingSourceProvider({
      maxSimilarArtists: 1,
      maxResultsPerArtist: 3,
      webSearchProvider: {
        providerName: "test",
        async search() { return []; }
      }
    });

    // Use 0 similar artists so no city queries run → no fallback → locationMode stays "city"
    const result = await provider.search({
      input: { ...input, similarArtists: [] },
      maxResults: 5
    });

    expect(typeof result.metadata.generatedQueryCount).toBe("number");
    expect((result.metadata.generatedQueryCount as number)).toBeGreaterThan(0);
    expect(typeof result.metadata.supportSignalCount).toBe("number");
    expect(result.metadata.locationMode).toBe("city");
    expect(Array.isArray(result.metadata.resolvedLocations)).toBe(true);
    expect((result.metadata.resolvedLocations as string[])).toContain("Paris");
    expect((result.metadata.resolvedLocations as string[])).toContain("France");
    expect(typeof result.metadata.countryFallbackUsed).toBe("boolean");
    expect(result.metadata.countryFallbackUsed).toBe(false);
  });

  it("web search booking queries do not over-quote genre or city", async () => {
    const capturedQueries: string[] = [];
    const provider = buildWebSearchBookingSourceProvider({
      maxQueries: 7,
      maxResultsPerQuery: 0,
      webSearchProvider: {
        providerName: "test",
        async search(query) {
          capturedQueries.push(query);
          return [];
        }
      }
    });

    // Use target: null so the city (Paris) is used as location, not target (France)
    await provider.search({ input: { ...input, target: null }, maxResults: 5 });

    expect(capturedQueries.some((q) => q.includes('"pop punk"'))).toBe(false);
    expect(capturedQueries.some((q) => q.includes('"Paris"'))).toBe(false);
    expect(capturedQueries.some((q) => q.includes("pop punk"))).toBe(true);
    expect(capturedQueries.some((q) => q.includes("Paris"))).toBe(true);
  });
});

describe("Firecrawl-free fallback (native fetch scene agendas)", () => {
  it("booking works when Firecrawl is disabled and no other web search provider is configured", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true", ENABLE_CONCERTS_PUNK: "true", CONCERTS_PUNK_URL: "https://example.test/feed" },
      fetchImpl: vi.fn(async () => new Response(
        `<?xml version="1.0"?>
        <rss><channel>
          <item>
            <title>Pop Punk Paris Night</title>
            <link>https://example.test/concert-pp</link>
            <description>Concert pop punk punk rock emo Paris 2026-09-15</description>
            <pubDate>2026-09-15</pubDate>
          </item>
        </channel></rss>`,
        { status: 200 }
      ) as unknown as Response)
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-12T00:00:00Z")
    });

    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities[0]?.sourceType).toBe("specialized_scene_agenda");
  });

  it("native fetch scene agenda provider parses RSS entries and returns normalized targets", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true", CONCERTS_PUNK_URL: "https://example.test/feed" },
      fetchImpl: async () => new Response(
        `<rss><channel>
          <item>
            <title>Festival Pop Punk France</title>
            <link>https://example.test/festival</link>
            <description>festival pop punk punk rock emo easycore France 2026-07-20</description>
            <pubDate>2026-07-20</pubDate>
          </item>
        </channel></rss>`,
        { status: 200 }
      ) as unknown as Response,
      now: new Date("2026-06-12T00:00:00Z")
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets.length).toBeGreaterThan(0);
    expect(result.targets[0]?.sourceType).toBe("specialized_scene_agenda");
    expect(result.targets[0]?.sourceUrl).toBe("https://example.test/festival");
    expect(result.metadata.enabled).toBe(true);
    expect((result.metadata.rawEventsFound as number)).toBeGreaterThan(0);
  });

  it("native fetch scene agenda provider skips blocked pages and adds warning", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true", CONCERTS_PUNK_URL: "https://example.test/blocked" },
      fetchImpl: async () => new Response(
        "Please wait while we check your browser... check_bot",
        { status: 200 }
      ) as unknown as Response
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings.some((w) => w.includes("blocked"))).toBe(true);
  });

  it("native fetch scene agenda provider handles fetch errors gracefully", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true", CONCERTS_PUNK_URL: "https://example.test/unreachable" },
      fetchImpl: async () => { throw new Error("network unavailable"); }
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings.some((w) => w.includes("ConcertsPunk fetch failed"))).toBe(true);
  });

  it("native fetch scene agenda provider is disabled when ENABLE_SCENE_AGENDAS is explicitly false", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "false", CONCERTS_PUNK_URL: "https://example.test/feed" }
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.metadata.enabled).toBe(false);
  });

  it("native fetch scene agenda status reports disabled when no URL is configured", () => {
    const status = getNativeFetchSceneAgendaStatus({
      ENABLE_SCENE_AGENDAS: "true",
      ENABLE_CONCERTS_PUNK: "false",
      ENABLE_RAZIBUS: "false",
      ENABLE_PUNKNROLL_AGENDA: "false",
      ENABLE_FRANCE_PUNK_SCENE: "false"
    });
    expect(status.enabled).toBe(false);
    expect(status.reason).toContain("no scene agenda fetch URLs are configured");
  });

  it("native fetch scene agenda detects support signals and creates support_slot warnings", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true", CONCERTS_PUNK_URL: "https://example.test/feed" },
      fetchImpl: async () => new Response(
        `<rss><channel>
          <item>
            <title>Big Pop Punk Night</title>
            <link>https://example.test/big-night</link>
            <description>pop punk punk rock Paris première partie à venir 2026-09-01</description>
            <pubDate>2026-09-01</pubDate>
          </item>
        </channel></rss>`,
        { status: 200 }
      ) as unknown as Response,
      now: new Date("2026-06-12T00:00:00Z")
    });

    const result = await searchBookingOpportunities(input, {
      providers: [provider],
      now: new Date("2026-06-12T00:00:00Z")
    });

    const slotOpp = result.opportunities.find((opp) =>
      opp.warnings.includes("Support slot is inferred, not confirmed.")
    );
    expect(slotOpp).toBeDefined();
  });
});

describe("Firecrawl quota handling", () => {
  it("Firecrawl booking is disabled when no API key is present", () => {
    expect(isFirecrawlBookingEnabled({})).toBe(false);
    expect(isFirecrawlBookingEnabled({ ENABLE_FIRECRAWL_BOOKING: "true" })).toBe(false);
  });

  it("Firecrawl booking is enabled by ENABLE_FIRECRAWL_BOOKING=true with API key", () => {
    expect(isFirecrawlBookingEnabled({ ENABLE_FIRECRAWL_BOOKING: "true", FIRECRAWL_API_KEY: "key" })).toBe(true);
  });

  it("Firecrawl booking is enabled by ENABLE_FIRECRAWL_CONSOLIDATION=true with API key", () => {
    expect(isFirecrawlBookingEnabled({ ENABLE_FIRECRAWL_CONSOLIDATION: "true", FIRECRAWL_API_KEY: "key" })).toBe(true);
  });

  it("Firecrawl booking is disabled by ENABLE_FIRECRAWL_BOOKING=false even with API key", () => {
    expect(isFirecrawlBookingEnabled({ ENABLE_FIRECRAWL_BOOKING: "false", FIRECRAWL_API_KEY: "key", ENABLE_FIRECRAWL_CONSOLIDATION: "true" })).toBe(false);
  });

  it("Firecrawl quota 402 disables Firecrawl for the run and adds warning", async () => {
    const provider = buildFirecrawlBookingSourceProvider(
      { ENABLE_FIRECRAWL_BOOKING: "true", FIRECRAWL_API_KEY: "test-key" },
      async () => new Response("quota exceeded - payment required", { status: 402 }) as unknown as Response
    );

    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings.some((w) => w.includes("quota or credits unavailable"))).toBe(true);
    expect(result.metadata.enabled).toBe(false);
  });

  it("Firecrawl returns disabled warning when no key is configured", async () => {
    const provider = buildFirecrawlBookingSourceProvider({});
    const result = await provider.search({ input, maxResults: 5 });

    expect(result.targets).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.metadata.enabled).toBe(false);
  });

  it("scene agendas are enabled by default without explicit ENABLE_SCENE_AGENDAS=true", () => {
    const status = getSceneAgendaSourceStatuses({});
    const concertsPunk = status.find((s) => s.key === "concerts_punk");
    expect(concertsPunk?.enabled).toBe(true);
    expect(concertsPunk?.reason).toContain("default");
  });

  it("booking startup log includes SceneAgendas status when no Firecrawl is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    buildDefaultBookingSourceProviders({
      ENABLE_SCENE_AGENDAS: "true",
      MOCK_AI: "false"
    });

    const message = warn.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("[booking] Booking providers:");
    expect(message).toContain("SceneAgendas: enabled");
    expect(message).toContain("Firecrawl: disabled");
    expect(message).not.toContain("secret");

    vi.restoreAllMocks();
  });
});

describe("Scene agenda URL fixes", () => {
  it("ConcertsPunk uses /?country=fr listing URL by default, not /feed/", async () => {
    const fetchedUrls: string[] = [];
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      fetchImpl: async (url: RequestInfo | URL) => {
        fetchedUrls.push(String(url));
        return new Response("", { status: 200 }) as unknown as Response;
      },
      now: new Date("2026-06-12T00:00:00Z")
    });

    await provider.search({ input, maxResults: 5 });

    expect(fetchedUrls.some((u) => u.includes("concertspunk.fr/?country=fr"))).toBe(true);
    expect(fetchedUrls.every((u) => !u.includes("/feed/"))).toBe(true);
  });

  it("Razibus uses /evenements-a-venir.php listing URL by default", async () => {
    const fetchedUrls: string[] = [];
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      fetchImpl: async (url: RequestInfo | URL) => {
        fetchedUrls.push(String(url));
        return new Response("", { status: 200 }) as unknown as Response;
      },
      now: new Date("2026-06-12T00:00:00Z")
    });

    await provider.search({ input, maxResults: 5 });

    expect(fetchedUrls.some((u) => u.includes("razibus.net/evenements-a-venir.php"))).toBe(true);
  });

  it("PunknRollAgenda uses agenda.punknroll.fr listing URL by default", async () => {
    const fetchedUrls: string[] = [];
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      fetchImpl: async (url: RequestInfo | URL) => {
        fetchedUrls.push(String(url));
        return new Response("", { status: 200 }) as unknown as Response;
      },
      now: new Date("2026-06-12T00:00:00Z")
    });

    await provider.search({ input, maxResults: 5 });

    expect(fetchedUrls.some((u) => u.includes("agenda.punknroll.fr"))).toBe(true);
  });

  it("pop punk genre auto-selects ConcertsPunk, Razibus, and PunknRollAgenda without explicit env flags", async () => {
    const fetchedUrls: string[] = [];
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      fetchImpl: async (url: RequestInfo | URL) => {
        fetchedUrls.push(String(url));
        return new Response("", { status: 200 }) as unknown as Response;
      },
      now: new Date("2026-06-12T00:00:00Z")
    });

    const result = await provider.search({ input, maxResults: 5 });

    expect(fetchedUrls.length).toBeGreaterThanOrEqual(3);
    const statuses = result.metadata.sourceStatuses as Array<{ key: string; enabled: boolean; reason: string }>;
    const concertsPunk = statuses.find((s) => s.key === "concerts_punk");
    expect(concertsPunk?.enabled).toBe(true);
    expect(concertsPunk?.reason).toContain("genre");
  });

  it("non-punk genre does not auto-select punk scene agendas", async () => {
    const fetchedUrls: string[] = [];
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" },
      fetchImpl: async (url: RequestInfo | URL) => {
        fetchedUrls.push(String(url));
        return new Response("", { status: 200 }) as unknown as Response;
      }
    });

    const jazzInput = { ...input, genre: "jazz" };
    const result = await provider.search({ input: jazzInput, maxResults: 5 });

    expect(fetchedUrls.length).toBe(0);
    const statuses = result.metadata.sourceStatuses as Array<{ key: string; enabled: boolean; reason: string }>;
    const concertsPunk = statuses.find((s) => s.key === "concerts_punk");
    expect(concertsPunk?.enabled).toBe(false);
    expect(concertsPunk?.reason).toContain("not selected for genre");
  });

  it("FrancePunkScene is disabled with a descriptive message when no URL is configured", async () => {
    const provider = buildNativeFetchSceneAgendaProvider({
      env: { ENABLE_SCENE_AGENDAS: "true" }
    });

    const result = await provider.search({ input, maxResults: 5 });

    const statuses = result.metadata.sourceStatuses as Array<{ key: string; enabled: boolean; reason: string }>;
    const francePunk = statuses.find((s) => s.key === "france_punk_scene");
    expect(francePunk?.enabled).toBe(false);
    expect(francePunk?.reason).toContain("no public event listing URL");
  });
});

describe("Optional booking search providers (Tavily, Exa, Jina)", () => {
  it("Tavily booking is enabled when TAVILY_API_KEY is present and not explicitly disabled", () => {
    const providers = getEnabledBookingSearchProviders({ TAVILY_API_KEY: "test-key" });
    expect(providers.some((p) => p.providerName === "tavily")).toBe(true);
  });

  it("Tavily booking is disabled when TAVILY_API_KEY is missing", () => {
    const providers = getEnabledBookingSearchProviders({});
    expect(providers.some((p) => p.providerName === "tavily")).toBe(false);
  });

  it("Tavily booking is disabled when ENABLE_TAVILY_BOOKING=false even with API key", () => {
    const providers = getEnabledBookingSearchProviders({ TAVILY_API_KEY: "test-key", ENABLE_TAVILY_BOOKING: "false" });
    expect(providers.some((p) => p.providerName === "tavily")).toBe(false);
  });

  it("Exa booking is enabled when EXA_API_KEY is present and not explicitly disabled", () => {
    const providers = getEnabledBookingSearchProviders({ EXA_API_KEY: "test-key" });
    expect(providers.some((p) => p.providerName === "exa")).toBe(true);
  });

  it("Exa booking is disabled when ENABLE_EXA_BOOKING=false even with API key", () => {
    const providers = getEnabledBookingSearchProviders({ EXA_API_KEY: "test-key", ENABLE_EXA_BOOKING: "false" });
    expect(providers.some((p) => p.providerName === "exa")).toBe(false);
  });

  it("Jina Reader is enabled by default without an API key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    buildDefaultBookingSourceProviders({ ENABLE_SCENE_AGENDAS: "false", MOCK_AI: "false" });

    const message = warn.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("JinaReader: enabled");

    vi.restoreAllMocks();
  });

  it("Jina Reader is disabled when ENABLE_JINA_READER=false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    buildDefaultBookingSourceProviders({ ENABLE_JINA_READER: "false", ENABLE_SCENE_AGENDAS: "false", MOCK_AI: "false" });

    const message = warn.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("JinaReader: disabled");

    vi.restoreAllMocks();
  });

  it("booking startup log shows Tavily, Exa, JinaReader status and does not expose API keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    buildDefaultBookingSourceProviders({
      TAVILY_API_KEY: "super-secret-tavily-key",
      EXA_API_KEY: "super-secret-exa-key",
      JINA_API_KEY: "super-secret-jina-key",
      ENABLE_SCENE_AGENDAS: "false",
      MOCK_AI: "false"
    });

    const message = warn.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("Tavily: enabled");
    expect(message).toContain("Exa: enabled");
    expect(message).toContain("JinaReader: enabled");
    expect(message).not.toContain("super-secret-tavily-key");
    expect(message).not.toContain("super-secret-exa-key");
    expect(message).not.toContain("super-secret-jina-key");

    vi.restoreAllMocks();
  });
});

function baseTarget(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Large Club",
    category: "venue",
    city: "Paris",
    country: "France",
    description: null,
    sourceUrl: "https://example.test/large-club",
    sourceType: "mock",
    genres: [],
    estimatedCapacity: null,
    estimatedArtistTier: null,
    contacts: [],
    confidence: 0.8,
    evidence: [],
    ...overrides
  };
}

function baseSimilarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Comparable Punk Band",
    url: "https://example.test/comparable-punk-band",
    spotifyId: null,
    genres: ["pop punk", "punk rock"],
    city: "Paris",
    country: "France",
    source: "mock",
    sources: ["mock"],
    reason: "Comparable pop punk artist.",
    confidence: 0.9,
    artistTier: "small",
    bookingCategory: "regional_peer",
    estimatedFollowers: 1500,
    estimatedPopularity: 18,
    sizeSignalSource: "manual",
    genreRelevance: 95,
    localRelevance: 80,
    sizeRelevance: 85,
    sceneRelevance: 80,
    totalRelevance: 90,
    relevanceToUserArtist: 90,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: ["Strong genre compatibility."],
    sourceUrls: ["https://example.test/comparable-punk-band"],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: {
      estimatedLevel: "small",
      confidence: 0.8,
      sizeSignalSource: "manual",
      platforms: {
        spotify: {
          followers: 1500,
          popularity: 18,
          sourceUrl: "https://example.test/comparable-punk-band"
        }
      }
    },
    discardedTags: [],
    ...overrides
  };
}

function sceneResult(title: string, snippet: string, slug: string) {
  return {
    title,
    url: `https://example.test/scene/${slug}`,
    snippet,
    sourceProvider: "scene-test-search",
    confidence: 0.82,
    links: []
  };
}
