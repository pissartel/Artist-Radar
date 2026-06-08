import { describe, expect, it } from "vitest";
import { classifyBookingTarget } from "../src/booking/classifyTarget.js";
import { extractPublicContactSignals } from "../src/booking/contactExtraction.js";
import { getRelatedGenres, matchBookingGenres } from "../src/booking/genreMatching.js";
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

  it("normalizes OpenAgenda events without inventing contacts", async () => {
    const provider = buildOpenAgendaBookingSourceProvider({
      env: {
        ENABLE_OPENAGENDA_BOOKING: "true",
        OPENAGENDA_API_KEY: "test-key",
        OPENAGENDA_AGENDA_UID: "agenda"
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
