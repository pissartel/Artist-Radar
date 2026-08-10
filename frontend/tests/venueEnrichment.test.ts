import { describe, expect, it, vi } from "vitest";
import {
  buildVenueOfficialPresenceSearchQueries,
  getImportantMissingVenueFields,
  getOrEnrichVenue,
  isRejectedOfficialVenueUrl,
  mergeVenueEnrichment,
  shouldRefreshVenueEnrichment,
  validateOfficialVenueSelection,
  VENUE_ENRICHMENT_NEGATIVE_TTL_MS,
  VENUE_ENRICHMENT_TTL_MS,
  VENUE_ENRICHMENT_VERSION,
} from "@/lib/server/venueEnrichment";
import type { CachedVenueEnrichment, VenueEnrichment } from "@/types/venueEnrichment";

function baseRecord(overrides: Partial<CachedVenueEnrichment> = {}): CachedVenueEnrichment {
  return {
    venueId: "le-sample",
    enrichedAt: "2026-08-01T00:00:00.000Z",
    enrichmentVersion: VENUE_ENRICHMENT_VERSION,
    cacheHit: true,
    enrichment: {
      officialUrl: "https://venue.example/",
      sources: [],
      genres: [],
      otherSocialLinks: [],
      programmedArtists: [],
    },
    ...overrides,
  };
}

function memoryCache(initial: CachedVenueEnrichment | null = null) {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (record: CachedVenueEnrichment) => {
      value = { ...record, cacheHit: true };
    }),
  };
}

describe("venue enrichment cache invalidation", () => {
  it("keeps fresh positive records within the 90 day TTL", () => {
    const record = baseRecord({ enrichedAt: "2026-08-01T00:00:00.000Z" });
    expect(shouldRefreshVenueEnrichment(record, new Date("2026-10-20T00:00:00.000Z"))).toBe(false);
  });

  it("refreshes expired records and old enrichment versions", () => {
    expect(
      shouldRefreshVenueEnrichment(
        baseRecord({ enrichedAt: new Date(Date.now() - VENUE_ENRICHMENT_TTL_MS - 1).toISOString() }),
        new Date(),
      ),
    ).toBe(true);
    expect(shouldRefreshVenueEnrichment(baseRecord({ enrichmentVersion: VENUE_ENRICHMENT_VERSION - 1 }))).toBe(true);
  });

  it("uses a shorter TTL for negative official URL results", () => {
    const record = baseRecord({
      enrichedAt: new Date(Date.now() - VENUE_ENRICHMENT_NEGATIVE_TTL_MS - 1).toISOString(),
      enrichment: { officialUrl: null, sources: [], genres: [], otherSocialLinks: [], programmedArtists: [] },
    });

    expect(shouldRefreshVenueEnrichment(record, new Date())).toBe(true);
  });
});

describe("mergeVenueEnrichment", () => {
  it("does not overwrite reliable primary fields with secondary fallback fields", () => {
    const primary: VenueEnrichment = {
      officialName: "Official Venue",
      capacity: 350,
      website: "https://venue.example/",
      sources: [{ url: "https://venue.example/", fields: ["capacity"] }],
      genres: ["punk"],
      otherSocialLinks: [],
      programmedArtists: [],
    };
    const secondary: VenueEnrichment = {
      officialName: "Third Party Venue Name",
      capacity: 900,
      website: "https://third-party.example/",
      sources: [{ url: "https://venue.example/", fields: ["website"] }],
      genres: ["punk", "emo"],
      otherSocialLinks: [],
      programmedArtists: [],
    };

    expect(mergeVenueEnrichment(primary, secondary)).toMatchObject({
      officialName: "Official Venue",
      capacity: 350,
      website: "https://venue.example/",
      genres: ["punk", "emo"],
      sources: [{ url: "https://venue.example/", fields: ["capacity", "website"] }],
    });
  });
});

describe("getImportantMissingVenueFields", () => {
  it("only requests fallback when important fields are missing", () => {
    expect(
      getImportantMissingVenueFields({
        description: "Independent live music venue.",
        type: "concert hall",
        address: "1 Venue Street",
        officialUrl: "https://venue.example/",
        website: "https://venue.example/",
        capacity: 300,
        bookingEmail: "booking@venue.example",
        programmingUrl: "https://venue.example/agenda",
        instagram: "https://instagram.com/venue",
        genres: ["punk"],
        programsLiveMusic: true,
        sources: [],
      }),
    ).toEqual([]);
  });
});

describe("official venue URL discovery rules", () => {
  it("builds contextual municipality-oriented queries for generic French venue names", () => {
    const queries = buildVenueOfficialPresenceSearchQueries({
      id: "salle-polyvalente-echenon-france",
      name: "Salle Polyvalente",
      city: "Échenon",
      country: "France",
    });

    expect(queries).toContain('"Salle Polyvalente" "Échenon"');
    expect(queries).toContain('"Salle Polyvalente Échenon" officiel');
    expect(queries).toContain('"Salle Polyvalente" "Échenon" mairie');
    expect(queries).not.toContain('"Salle Polyvalente"');
  });

  it("accepts a venue's own official website", () => {
    const result = validateOfficialVenueSelection(
      { id: "krakatoa-merignac-france", name: "Krakatoa", city: "Mérignac", country: "France" },
      {
        officialUrl: "https://www.krakatoa.org/",
        officialUrlType: "venue",
        officialUrlConfidence: 0.92,
        sources: [{ url: "https://www.krakatoa.org/", title: "Krakatoa Merignac", fields: ["officialUrl"] }],
      },
    );

    expect(result.officialUrl).toBe("https://www.krakatoa.org/");
  });

  it("accepts a municipality page as an official presence for a municipal venue", () => {
    const result = validateOfficialVenueSelection(
      { id: "salle-polyvalente-echenon-france", name: "Salle Polyvalente", city: "Échenon", country: "France" },
      {
        officialUrl: "https://www.echenon.fr/location-de-la-salle-polyvalente-dechenon/",
        officialUrlType: "municipality",
        officialOrganizationName: "Mairie d'Échenon",
        officialUrlConfidence: 0.88,
        sources: [{
          url: "https://www.echenon.fr/location-de-la-salle-polyvalente-dechenon/",
          title: "Location de la salle polyvalente d'Echenon",
          fields: ["officialUrl"],
        }],
      },
    );

    expect(result.officialUrl).toBe("https://www.echenon.fr/location-de-la-salle-polyvalente-dechenon/");
    expect(result.officialUrlType).toBe("municipality");
  });

  it("rejects event agenda pages as official venue URLs", () => {
    expect(isRejectedOfficialVenueUrl("https://example.com/agenda/concert-foo")).toBe(true);
    const result = validateOfficialVenueSelection(
      { id: "le-sample-paris-france", name: "Le Sample", city: "Paris", country: "France" },
      {
        officialUrl: "https://example.com/agenda/concert-foo",
        officialUrlType: "other",
        officialUrlConfidence: 0.91,
        sources: [{ url: "https://example.com/agenda/concert-foo", title: "Concert Foo", fields: ["officialUrl"] }],
      },
    );

    expect(result.officialUrl).toBeNull();
  });

  it("rejects ticketing platforms as official venue URLs", () => {
    for (const url of [
      "https://www.ticketmaster.fr/event/foo",
      "https://www.eventbrite.com/e/foo",
      "https://dice.fm/event/foo",
      "https://www.concertarchives.org/bands/two-trains-left",
    ]) {
      expect(isRejectedOfficialVenueUrl(url)).toBe(true);
    }
  });
});

describe("getOrEnrichVenue", () => {
  it("returns a fresh cached record without scraper or OpenAI calls", async () => {
    const cache = memoryCache(baseRecord());
    const scrapePages = vi.fn();
    const extractFromPages = vi.fn();
    const extractWithWebSearch = vi.fn();

    const result = await getOrEnrichVenue(
      { id: "le-sample", name: "Le Sample" },
      { cache, scrapePages, extractFromPages, extractWithWebSearch, now: () => new Date("2026-08-10T00:00:00.000Z") },
    );

    expect(result.cacheHit).toBe(true);
    expect(scrapePages).not.toHaveBeenCalled();
    expect(extractFromPages).not.toHaveBeenCalled();
    expect(extractWithWebSearch).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent enrichment for the same venue", async () => {
    const cache = memoryCache(null);
    const scrapePages = vi.fn(async () => [{ url: "https://venue.example/", title: "Venue", text: "contact booking agenda capacity" }]);
    const extractFromPages = vi.fn(async () => ({
      website: "https://venue.example/",
      capacity: 250,
      bookingEmail: "booking@venue.example",
      programmingUrl: "https://venue.example/agenda",
      instagram: "https://instagram.com/venue",
      description: "Independent live music venue.",
      type: "concert hall",
      address: "1 Venue Street",
      genres: ["punk"],
      programsLiveMusic: true,
      sources: [{ url: "https://venue.example/", fields: ["capacity", "bookingEmail"] }],
    }));
    const extractWithWebSearch = vi.fn(async () => ({ sources: [] }));

    await Promise.all([
      getOrEnrichVenue({ id: "le-sample", name: "Le Sample", website: "https://venue.example/" }, { cache, scrapePages, extractFromPages, extractWithWebSearch }),
      getOrEnrichVenue({ id: "le-sample", name: "Le Sample", website: "https://venue.example/" }, { cache, scrapePages, extractFromPages, extractWithWebSearch }),
    ]);

    expect(scrapePages).toHaveBeenCalledTimes(1);
    expect(extractFromPages).toHaveBeenCalledTimes(1);
    expect(extractWithWebSearch).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it("returns successful enrichment when the serverless cache filesystem is not writable", async () => {
    const cache = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {
        throw new Error("ENOENT: no such file or directory, mkdir '/var/task/.cache'");
      }),
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await getOrEnrichVenue(
      { id: "serverless-room-paris-france", name: "Serverless Room", city: "Paris", country: "France" },
      {
        cache,
        scrapePages: vi.fn(async () => []),
        extractWithWebSearch: vi.fn(async () => ({
          description: "A venue returned by OpenAI.",
          sources: [],
        })),
      },
    );

    expect(result.enrichment.description).toBe("A venue returned by OpenAI.");
    expect(result.cacheHit).toBe(false);
    expect(cache.set).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });

  it("lets OpenAI replace the generic venue category with a specific venue type", async () => {
    const result = await getOrEnrichVenue(
      {
        id: "specific-type-room-lyon-france",
        name: "Specific Type Room",
        city: "Lyon",
        country: "France",
        venueType: "venue",
        venueTypeLabel: "Venue",
      },
      {
        cache: memoryCache(null),
        scrapePages: vi.fn(async () => []),
        extractWithWebSearch: vi.fn(async () => ({
          type: "Bar and concert venue",
          sources: [],
        })),
      },
    );

    expect(result.enrichment.type).toBe("Bar and concert venue");
  });

  it("uses a reliable existing website as the official URL without costly official search", async () => {
    const cache = memoryCache(null);
    const discoverOfficialPresence = vi.fn();
    const scrapePages = vi.fn(async () => []);
    const extractFromPages = vi.fn();
    const extractWithWebSearch = vi.fn(async () => ({ sources: [] }));

    const result = await getOrEnrichVenue(
      { id: "krakatoa-merignac-france", name: "Krakatoa", city: "Mérignac", country: "France", website: "https://www.krakatoa.org/" },
      { cache, scrapePages, extractFromPages, extractWithWebSearch, discoverOfficialPresence },
    );

    expect(result.enrichment.officialUrl).toBe("https://www.krakatoa.org/");
    expect(result.enrichment.enrichmentSource).toBe("existing_data");
    expect(discoverOfficialPresence).not.toHaveBeenCalled();
  });

  it("caches an accepted municipality page found by direct OpenAI web search", async () => {
    const cache = memoryCache(null);
    const extractWithWebSearch = vi.fn(async () => ({
      officialUrl: "https://www.echenon.fr/location-de-la-salle-polyvalente-dechenon/",
      officialUrlType: "municipality" as const,
      officialOrganizationName: "Mairie d'Échenon",
      officialUrlConfidence: 0.88,
      enrichmentSource: "openai_web_search",
      sources: [{ url: "https://www.echenon.fr/location-de-la-salle-polyvalente-dechenon/", fields: ["officialUrl"] }],
      genres: [],
      otherSocialLinks: [],
      programmedArtists: [],
    }));
    const scrapePages = vi.fn(async () => []);

    const result = await getOrEnrichVenue(
      { id: "salle-polyvalente-echenon-france", name: "Salle Polyvalente", city: "Échenon", country: "France" },
      { cache, scrapePages, extractWithWebSearch },
    );

    expect(result.enrichment.officialUrl).toBe("https://www.echenon.fr/location-de-la-salle-polyvalente-dechenon/");
    expect(result.enrichment.officialUrlType).toBe("municipality");
    expect(extractWithWebSearch).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it("caches a negative official URL result so the next visit does not search again", async () => {
    const cache = memoryCache(null);
    const scrapePages = vi.fn(async () => []);
    const extractWithWebSearch = vi.fn(async () => ({ sources: [], genres: [], otherSocialLinks: [], programmedArtists: [], officialUrl: null }));
    const now = () => new Date("2026-08-10T00:00:00.000Z");

    const first = await getOrEnrichVenue(
      { id: "unknown-room-paris-france", name: "Unknown Room", city: "Paris", country: "France" },
      { cache, scrapePages, extractWithWebSearch, now },
    );
    const second = await getOrEnrichVenue(
      { id: "unknown-room-paris-france", name: "Unknown Room", city: "Paris", country: "France" },
      { cache, scrapePages, extractWithWebSearch, now },
    );

    expect(first.enrichment.officialUrl).toBeNull();
    expect(second.cacheHit).toBe(true);
    expect(extractWithWebSearch).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
