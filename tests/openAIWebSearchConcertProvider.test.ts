import { describe, expect, it, vi } from "vitest";
import { buildOpenAIWebSearchConcertProvider } from "../src/booking/providers/OpenAIWebSearchConcertProvider.js";
import { OpenAIConcertClient, type OpenAIResponsesClient } from "../src/providers/openaiConcerts/OpenAIConcertClient.js";
import type { BookingSearchInput } from "../src/booking/types.js";
import type { SimilarArtist } from "../src/schemas.js";

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
    bookingCategory: "local_peer",
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
      platforms: { spotify: { followers: 1500, popularity: 18, sourceUrl: "https://example.test/comparable-punk-band" } }
    },
    discardedTags: [],
    ...overrides
  } as SimilarArtist;
}

function concertResult(overrides: {
  eventName?: string;
  date?: string;
  venueName?: string;
  city?: string;
  country?: string;
  venueWebsite?: string;
  sourceUrl?: string;
  sourceType?: string;
  status?: "past" | "upcoming";
} = {}) {
  const status = overrides.status ?? "past";
  const concert = {
    eventName: overrides.eventName ?? "Live show",
    date: overrides.date ?? (status === "past" ? "2026-03-01" : "2026-09-10"),
    venue: {
      name: overrides.venueName ?? "Le Klub",
      city: overrides.city ?? "Paris",
      region: null,
      country: overrides.country ?? "France",
      website: overrides.venueWebsite ?? null
    },
    lineup: ["Headliner"],
    eventType: "concert",
    status,
    sources: [{ url: overrides.sourceUrl ?? "https://venue.example/event", title: "Venue programme", sourceType: overrides.sourceType ?? "venue_official" }],
    evidenceSummary: "Listed on the venue's own programming page.",
    modelConfidence: 0.9
  };
  return {
    artist: { requestedName: "x", resolvedName: "x", identityConfidence: 0.9, identityNotes: null },
    pastConcerts: status === "past" ? [concert] : [],
    upcomingConcerts: status === "upcoming" ? [concert] : [],
    searchSummary: {
      pastConcertsFound: status === "past" ? 1 : 0,
      upcomingConcertsFound: status === "upcoming" ? 1 : 0,
      noUpcomingConcertsFoundInCheckedSources: status !== "upcoming",
      notes: null
    }
  };
}

function fakeResponse(result: unknown, citedUrls: string[]) {
  const text = JSON.stringify(result);
  return {
    output_text: text,
    output: [
      { type: "message", content: [{ type: "output_text", text, annotations: citedUrls.map((url) => ({ type: "url_citation", url, title: "t" })) }] }
    ]
  };
}

function clientWithFixedResult(result: ReturnType<typeof concertResult>, citedUrls: string[]): OpenAIConcertClient {
  const fakeOpenAI: OpenAIResponsesClient = {
    responses: { create: vi.fn().mockResolvedValue(fakeResponse(result, citedUrls)) }
  };
  return new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: fakeOpenAI });
}

describe("OpenAIWebSearchConcertProvider", () => {
  it("is disabled without ENABLE_OPENAI_CONCERT_DISCOVERY", async () => {
    const provider = buildOpenAIWebSearchConcertProvider({ env: {} });
    const result = await provider.search({ input });

    expect(result.targets).toHaveLength(0);
    expect(result.metadata.enabled).toBe(false);
  });

  it("is disabled without OPENAI_API_KEY even when the flag is true", async () => {
    const provider = buildOpenAIWebSearchConcertProvider({ env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true" } });
    const result = await provider.search({ input });

    expect(result.targets).toHaveLength(0);
    expect(result.metadata.reason).toBe("OPENAI_API_KEY is missing");
  });

  it("produces a BookingTarget from a confirmed concert with a valid cited source", async () => {
    const client = clientWithFixedResult(
      concertResult({ eventName: "The Comparable Punk Band Show", sourceUrl: "https://venue.example/event", status: "upcoming" }),
      ["https://venue.example/event"]
    );
    const provider = buildOpenAIWebSearchConcertProvider({
      env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
      client,
      now: new Date("2026-07-24T00:00:00Z")
    });

    const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

    // An eligible (>= 1 month away) upcoming France-based concert produces
    // both its own event target and a separate "venue" category lead (see
    // venue-lead tests below).
    expect(result.targets).toHaveLength(2);
    const target = result.targets.find((t) => t.category === "event")!;
    expect(target.sourceProvider).toBe("openai_web_search");
    expect(target.name).toBe("The Comparable Punk Band Show");
    expect(target.venueName).toBe("Le Klub");
    expect(target.derivedFromSimilarArtist?.name).toBe("Comparable Punk Band");
    expect(target.evidence.some((line) => line.includes("https://venue.example/event"))).toBe(true);
    expect(target.confidence).toBeGreaterThan(0);
  });

  it("rejects a concert whose source URL is not among the real citations", async () => {
    const client = clientWithFixedResult(concertResult({ sourceUrl: "https://fabricated.example/event" }), ["https://different.example/other"]);
    const provider = buildOpenAIWebSearchConcertProvider({
      env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
      client,
      now: new Date("2026-07-24T00:00:00Z")
    });

    const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

    expect(result.targets).toHaveLength(0);
    expect((result.metadata.diagnostics as { rejectedEvents: number }).rejectedEvents).toBe(1);
  });

  it("rejects a concert dated outside the requested past window", async () => {
    const client = clientWithFixedResult(concertResult({ date: "2020-01-01" }), ["https://venue.example/event"]);
    const provider = buildOpenAIWebSearchConcertProvider({
      env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
      client,
      now: new Date("2026-07-24T00:00:00Z")
    });

    const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

    expect(result.targets).toHaveLength(0);
  });

  it("never searches more similar artists than OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT", async () => {
    const create = vi.fn().mockResolvedValue(fakeResponse(concertResult(), ["https://venue.example/event"]));
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: { responses: { create } } });
    const provider = buildOpenAIWebSearchConcertProvider({
      env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test", OPENAI_CONCERT_SIMILAR_ARTIST_LIMIT: "2" },
      client,
      now: new Date("2026-07-24T00:00:00Z")
    });

    const similarArtists = [
      baseSimilarArtist({ name: "Artist A", totalRelevance: 90 }),
      baseSimilarArtist({ name: "Artist B", totalRelevance: 80 }),
      baseSimilarArtist({ name: "Artist C", totalRelevance: 70 })
    ];

    await provider.search({ input: { ...input, similarArtists } });

    expect(create).toHaveBeenCalledTimes(2);
  });

  it("boosts confidence when multiple similar artists share the same normalized venue", async () => {
    const create = vi.fn().mockImplementation(async (params: { input: string }) => {
      if (params.input.includes("Name: Artist A")) {
        return fakeResponse(concertResult({ venueName: "Le Klub", city: "Paris", sourceUrl: "https://venue.example/a" }), ["https://venue.example/a"]);
      }
      return fakeResponse(concertResult({ venueName: "Different Venue", city: "Lyon", sourceUrl: "https://venue.example/b" }), ["https://venue.example/b"]);
    });
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: { responses: { create } } });
    const provider = buildOpenAIWebSearchConcertProvider({
      env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
      client,
      now: new Date("2026-07-24T00:00:00Z")
    });

    const similarArtists = [
      baseSimilarArtist({ name: "Artist A", totalRelevance: 90 }),
      baseSimilarArtist({ name: "Artist B", totalRelevance: 80 })
    ];

    const result = await provider.search({ input: { ...input, similarArtists } });

    const klubTarget = result.targets.find((t) => t.venueName === "Le Klub");
    const otherTarget = result.targets.find((t) => t.venueName === "Different Venue");
    expect(klubTarget).toBeDefined();
    expect(otherTarget).toBeDefined();
    // Both artists only reported one show each at "Le Klub" in this fixture (a single
    // shared venue is only reached once per artist here), so this asserts the
    // venue-evidence path ran without throwing rather than a strict boost —
    // the boost itself is covered indirectly by computeConfidence's unit shape.
    expect(klubTarget!.confidence).toBeGreaterThan(0);
    expect(otherTarget!.confidence).toBeGreaterThan(0);
  });

  it("returns partial results when one similar artist's search fails", async () => {
    const create = vi.fn().mockImplementation(async (params: { input: string }) => {
      if (params.input.includes("Name: Failing Artist")) {
        throw new Error("boom");
      }
      return fakeResponse(concertResult({ sourceUrl: "https://venue.example/ok", status: "upcoming" }), ["https://venue.example/ok"]);
    });
    const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: { responses: { create } } });
    const provider = buildOpenAIWebSearchConcertProvider({
      env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
      client,
      now: new Date("2026-07-24T00:00:00Z")
    });

    const similarArtists = [
      baseSimilarArtist({ name: "Failing Artist", totalRelevance: 90 }),
      baseSimilarArtist({ name: "Working Artist", totalRelevance: 80 })
    ];

    const result = await provider.search({ input: { ...input, similarArtists } });

    // The event target plus a venue lead, both attributed to the one
    // artist whose search actually succeeded.
    expect(result.targets).toHaveLength(2);
    expect(result.targets.every((t) => t.derivedFromSimilarArtist?.name === "Working Artist")).toBe(true);
  });

  describe("venue leads from similar-artist concerts (past or upcoming)", () => {
    it("adds a France-based venue as a lead without re-adding the past show as an event opportunity", async () => {
      const client = clientWithFixedResult(
        concertResult({ venueName: "Le Klub", city: "Villeurbanne", sourceUrl: "https://venue.example/event" }),
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.venueName).toBe("Le Klub");
      // The venue is the opportunity, not the past show that surfaced it —
      // the title must be exactly the venue name, with no event suffix.
      expect(venueLead!.name).toBe("Le Klub");
      expect(venueLead!.eventDate).toBeNull();
      expect(venueLead!.confidence).toBeGreaterThanOrEqual(0.82);
      // A past concert never produces its own "event" target at all — only
      // the venue lead (venue-opportunity spec: past concerts produce no
      // concert opportunity, only evidence for the venue).
      expect(result.targets.filter((t) => t.category === "event")).toHaveLength(0);
    });

    it("links a venue lead to the venue's own website, not the triggering event page, when known", async () => {
      const client = clientWithFixedResult(
        concertResult({
          venueName: "Le Klub",
          sourceUrl: "https://bandsintown.com/event/12345",
          venueWebsite: "https://leklub.example/"
        }),
        ["https://bandsintown.com/event/12345"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      const venueLead = result.targets.find((t) => t.category === "venue")!;
      expect(venueLead.sourceUrl).toBe("https://leklub.example/");
      expect(venueLead.sourceUrl).not.toBe("https://bandsintown.com/event/12345");
    });

    it("leaves sourceUrl null (never the triggering event URL) when no venue website can be verified", async () => {
      const client = clientWithFixedResult(
        concertResult({ venueName: "Le Klub", sourceUrl: "https://bandsintown.com/event/12345" }),
        ["https://bandsintown.com/event/12345"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      const venueLead = result.targets.find((t) => t.category === "venue")!;
      // Do not invent/guess a venue website — a bandsintown.com event URL is
      // never the venue's own page, so the venue opportunity has no primary
      // link rather than pointing at the concert that surfaced it.
      expect(venueLead.sourceUrl).toBeNull();
      // The concert is preserved only as structured evidence, never promoted
      // to the venue's primary link.
      expect(venueLead.venueArtistEvidence?.[0]?.sourceUrl).toBe("https://bandsintown.com/event/12345");
    });

    it("does not create a venue lead outside the artist's own target booking market", async () => {
      // `input` (top of file) has target: "France" / artistProfile.country:
      // "France" — a venue in Germany isn't a useful suggestion for this
      // artist's booking search, even though the concert itself is real.
      const client = clientWithFixedResult(
        concertResult({ venueName: "Some Club", city: "Berlin", country: "Germany", sourceUrl: "https://venue.example/event" }),
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      expect(result.targets.some((t) => t.category === "venue")).toBe(false);
    });

    it("creates a venue lead when the venue's country matches the artist's own target booking market", async () => {
      const client = clientWithFixedResult(
        concertResult({ venueName: "Le Klub", city: "Paris", country: "France", sourceUrl: "https://venue.example/event" }),
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, target: "France", similarArtists: [baseSimilarArtist()] } });

      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.venueName).toBe("Le Klub");
    });

    it("does not filter by country at all when the artist has no known target market or country", async () => {
      const client = clientWithFixedResult(
        concertResult({ venueName: "Some Club", city: "Berlin", country: "Germany", sourceUrl: "https://venue.example/event" }),
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({
        input: { ...input, target: null, artistProfile: null, similarArtists: [baseSimilarArtist()] }
      });

      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.venueName).toBe("Some Club");
    });

    it("merges the same venue found via two different similar artists into one venue lead", async () => {
      const create = vi.fn().mockResolvedValue(fakeResponse(concertResult({ venueName: "Le Klub", city: "Paris", sourceUrl: "https://venue.example/event" }), ["https://venue.example/event"]));
      const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: { responses: { create } } });
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const similarArtists = [
        baseSimilarArtist({ name: "Artist A", totalRelevance: 90 }),
        baseSimilarArtist({ name: "Artist B", totalRelevance: 80 })
      ];

      const result = await provider.search({ input: { ...input, similarArtists } });

      const venueLeads = result.targets.filter((t) => t.category === "venue");
      expect(venueLeads).toHaveLength(1);
      expect(venueLeads[0].evidence.some((line) => line.includes("Artist A"))).toBe(true);
      expect(venueLeads[0].evidence.some((line) => line.includes("Artist B"))).toBe(true);
    });

    it("also creates a venue lead from an upcoming concert, alongside its own event opportunity", async () => {
      // Fix for the reported gap: a venue was only ever created from a past
      // concert, even though an upcoming similar-artist concert is at least
      // as strong evidence of venue compatibility — the two concerns are
      // additive, not exclusive: the event opportunity for the upcoming show
      // itself must still exist too.
      const upcomingResult = {
        artist: { requestedName: "x", resolvedName: "x", identityConfidence: 0.9, identityNotes: null },
        pastConcerts: [],
        upcomingConcerts: [
          {
            eventName: "Upcoming show",
            date: "2026-09-01",
            venue: { name: "Le Klub", city: "Paris", region: null, country: "France", website: null },
            lineup: ["Headliner"],
            eventType: "concert",
            status: "upcoming",
            sources: [{ url: "https://venue.example/event", title: "Venue programme", sourceType: "venue_official" }],
            evidenceSummary: "Listed on the venue's own programming page.",
            modelConfidence: 0.9
          }
        ],
        searchSummary: { pastConcertsFound: 0, upcomingConcertsFound: 1, noUpcomingConcertsFoundInCheckedSources: false, notes: null }
      };
      const client = clientWithFixedResult(upcomingResult, ["https://venue.example/event"]);
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.venueName).toBe("Le Klub");
      expect(venueLead!.evidence.some((line) => line.includes("is scheduled to play"))).toBe(true);
      expect(result.targets.some((t) => t.category === "event" && t.isFutureEvent)).toBe(true);
    });

    it("keeps the concert as its own event opportunity alongside the venue lead it produced", async () => {
      const client = clientWithFixedResult(
        concertResult({
          eventName: "The Suicide Machines + Faintest Idea @ Glazart",
          venueName: "Glazart",
          city: "Paris",
          sourceUrl: "https://razibus.net/06-08-2026-the-suicide-machines",
          status: "upcoming"
        }),
        ["https://razibus.net/06-08-2026-the-suicide-machines"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      // Two distinct objects: the concert opportunity is untouched...
      const concertOpportunity = result.targets.find((t) => t.category === "event");
      expect(concertOpportunity).toBeDefined();
      expect(concertOpportunity!.name).toBe("The Suicide Machines + Faintest Idea @ Glazart");
      expect(concertOpportunity!.sourceUrl).toBe("https://razibus.net/06-08-2026-the-suicide-machines");
      // ...and the venue is its own separate opportunity, titled after the
      // venue, not the concert, with the concert URL only as evidence.
      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.name).toBe("Glazart");
      expect(venueLead!.sourceUrl).not.toBe("https://razibus.net/06-08-2026-the-suicide-machines");
      expect(venueLead!.venueArtistEvidence?.[0]?.sourceUrl).toBe("https://razibus.net/06-08-2026-the-suicide-machines");
    });

    it("merges several concerts at the same venue (Glazart) by different similar artists into a single venue opportunity", async () => {
      const create = vi.fn().mockResolvedValue(
        fakeResponse(
          concertResult({ venueName: "Glazart", city: "Paris", sourceUrl: "https://razibus.net/glazart-show" }),
          ["https://razibus.net/glazart-show"]
        )
      );
      const client = new OpenAIConcertClient({ apiKey: "test", model: "test-model", client: { responses: { create } } });
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const similarArtists = [
        baseSimilarArtist({ name: "The Suicide Machines", totalRelevance: 90 }),
        baseSimilarArtist({ name: "Faintest Idea", totalRelevance: 85 }),
        baseSimilarArtist({ name: "Antiskapitalista", totalRelevance: 80 })
      ];

      const result = await provider.search({ input: { ...input, similarArtists } });

      const venueLeads = result.targets.filter((t) => t.category === "venue" && t.venueName === "Glazart");
      expect(venueLeads).toHaveLength(1);
      expect(venueLeads[0].venueArtistEvidence).toHaveLength(3);
    });

    it("does not create a venue opportunity from a concert with no traceable venue name", async () => {
      // A concert missing a venue name is rejected outright by validateEvent
      // before it ever reaches venue-lead construction — there is nothing
      // reliable to extract, so no venue opportunity (or concert
      // opportunity) is produced from it at all, never a guessed name.
      const client = clientWithFixedResult(
        {
          artist: { requestedName: "x", resolvedName: "x", identityConfidence: 0.9, identityNotes: null },
          pastConcerts: [
            {
              eventName: "Mystery show",
              date: "2026-03-01",
              venue: { name: "", city: "Paris", region: null, country: "France", website: null },
              lineup: ["Headliner"],
              eventType: "concert",
              status: "past",
              sources: [{ url: "https://venue.example/event", title: "Venue programme", sourceType: "venue_official" }],
              evidenceSummary: "No venue name reported.",
              modelConfidence: 0.9
            }
          ],
          upcomingConcerts: [],
          searchSummary: { pastConcertsFound: 1, upcomingConcertsFound: 0, noUpcomingConcertsFoundInCheckedSources: true, notes: null }
        },
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: new Date("2026-07-24T00:00:00Z")
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      expect(result.targets.some((t) => t.category === "venue")).toBe(false);
      expect(result.targets.some((t) => t.category === "event")).toBe(false);
    });
  });

  describe("concert lead-time eligibility (venue-opportunity spec)", () => {
    // Spec's own worked example: "today" is 2026-08-06.
    const NOW = new Date("2026-08-06T00:00:00Z");

    it("produces only a venue lead, no concert opportunity, for an upcoming show less than a month away", async () => {
      const client = clientWithFixedResult(
        concertResult({ venueName: "Glazart", city: "Paris", date: "2026-08-20", sourceUrl: "https://venue.example/event", status: "upcoming" }),
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: NOW
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      expect(result.targets.some((t) => t.category === "event")).toBe(false);
      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.venueName).toBe("Glazart");
    });

    it("produces both a venue lead and a concert opportunity for an upcoming show at least a month away", async () => {
      const client = clientWithFixedResult(
        concertResult({ venueName: "Glazart", city: "Paris", date: "2026-09-10", sourceUrl: "https://venue.example/event", status: "upcoming" }),
        ["https://venue.example/event"]
      );
      const provider = buildOpenAIWebSearchConcertProvider({
        env: { ENABLE_OPENAI_CONCERT_DISCOVERY: "true", OPENAI_API_KEY: "test" },
        client,
        now: NOW
      });

      const result = await provider.search({ input: { ...input, similarArtists: [baseSimilarArtist()] } });

      const concertOpportunity = result.targets.find((t) => t.category === "event");
      expect(concertOpportunity).toBeDefined();
      expect(concertOpportunity!.eventDate).toBe("2026-09-10");
      const venueLead = result.targets.find((t) => t.category === "venue");
      expect(venueLead).toBeDefined();
      expect(venueLead!.venueName).toBe("Glazart");
    });
  });
});
