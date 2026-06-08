import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyBookingTarget } from "../src/booking/classifyTarget.js";
import { extractPublicContactSignals } from "../src/booking/contactExtraction.js";
import { getRelatedGenres, matchBookingGenres } from "../src/booking/genreMatching.js";
import { buildDefaultBookingSourceProviders } from "../src/booking/providers/BookingSourceProvider.js";
import { buildMockBookingSourceProvider } from "../src/booking/providers/MockBookingSourceProvider.js";
import { buildOpenAgendaBookingSourceProvider } from "../src/booking/providers/OpenAgendaBookingSourceProvider.js";
import { buildWebSearchBookingSourceProvider } from "../src/booking/providers/WebSearchBookingSourceProvider.js";
import { normalizeBookingSource } from "../src/booking/normalizeBookingTarget.js";
import { recommendBookingAction, scoreBookingCompatibility } from "../src/booking/scoring.js";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import { buildBookingSearchExtractionPrompt } from "../src/prompts.js";
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

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Strong Punk Room", "Weak Rock Room"]);
    expect(result.opportunities[0]?.contact).toBe("booking@example.test");
    expect(result.opportunities[0]?.reason).toContain("Genre fit:");
    expect(result.opportunities[0]?.suggestedAction).toBe("booking_contact");
    expect(result.warnings).toEqual(["Provider-level warning."]);
    expect(result.sourceMetadata[0]).toMatchObject({
      sourceProvider: "qa_booking_provider",
      targetCount: 2,
      warnings: ["Provider-level warning."]
    });
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
            snippet: "Paris venue programmation pop punk booking@example.test",
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
            text: "Official venue page with pop punk concerts.",
            markdown: "Official venue page with pop punk concerts.",
            sourceProvider: "test-extract",
            statusCode: 200
          };
        }
      }
    });

    const result = await searchBookingOpportunities(input, { providers: [provider] });

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
