import { describe, expect, it } from "vitest";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";
import type { BookingSourceProvider } from "../src/booking/providers/BookingSourceProvider.js";

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: null,
  links: [],
  limit: 10,
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

function target(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Paris Peer One at La Maroquinerie",
    category: "event",
    city: "Paris",
    country: "France",
    sourceUrl: "https://example.com/a",
    sourceType: "event_page",
    sourceProvider: "provider-a",
    genres: ["pop punk"],
    venueName: "La Maroquinerie",
    eventDate: "2026-11-04",
    isFutureEvent: true,
    isPastEvent: false,
    dateConfidence: "verified",
    opportunityKind: "actionable",
    contacts: [],
    confidence: 0.7,
    evidence: ["Found via provider A."],
    ...overrides
  };
}

function providerReturning(name: string, targets: BookingTarget[]): BookingSourceProvider {
  return {
    providerName: name,
    async search() {
      return { targets, sourceProvider: name, searchedQueries: [], warnings: [], metadata: {} };
    }
  };
}

describe("cross-provider booking target deduplication", () => {
  it("merges the same event/venue from two different providers with different source URLs", async () => {
    const providerA = providerReturning("provider-a", [target({ sourceUrl: "https://a.example/event", sourceProvider: "openagenda_booking" })]);
    const providerB = providerReturning("provider-b", [target({
      sourceUrl: "https://b.example/event",
      sourceProvider: "ticketmaster",
      imageUrl: "https://b.example/image.jpg",
      ticketUrl: "https://b.example/tickets"
    })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    const events = result.targets.filter((item) => item.category === "event");
    const venues = result.targets.filter((item) => item.category === "venue");
    expect(events).toHaveLength(1);
    expect(venues).toHaveLength(1);
    expect(result.rejectedByReason.duplicate).toBe(2);
    // Richer fields from the second source are preserved, not discarded.
    expect(events[0]?.imageUrl).toBe("https://b.example/image.jpg");
    expect(events[0]?.ticketUrl).toBe("https://b.example/tickets");
    // The second source's URL is preserved as evidence rather than dropped.
    expect(events[0]?.evidence.join(" ")).toContain("https://b.example/event");
  });

  it("does not merge the same date at a different venue", async () => {
    const providerA = providerReturning("provider-a", [target({ venueName: "La Maroquinerie" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", venueName: "Le Bikini", city: "Toulouse" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets.filter((item) => item.category === "event")).toHaveLength(2);
    expect(result.targets.filter((item) => item.category === "venue")).toHaveLength(2);
  });

  it("does not merge the same venue on a different date", async () => {
    const providerA = providerReturning("provider-a", [target({ eventDate: "2026-11-04" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", eventDate: "2026-11-20" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets.filter((item) => item.category === "event")).toHaveLength(2);
    expect(result.targets.filter((item) => item.category === "venue")).toHaveLength(1);
  });

  it("normalizes venue-name variants (leading article) across providers before merging", async () => {
    const providerA = providerReturning("provider-a", [target({ venueName: "Le Krakatoa" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", venueName: "Krakatoa" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets.filter((item) => item.category === "event")).toHaveLength(1);
    expect(result.targets.filter((item) => item.category === "venue")).toHaveLength(1);
  });

  it("keeps two different same-day, same-city events separate when neither the venue nor the event name matches (uncertain match)", async () => {
    const providerA = providerReturning("provider-a", [target({ name: "Event One", venueName: "Venue Alpha" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", name: "Event Two", venueName: "Venue Beta" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets.filter((item) => item.category === "event")).toHaveLength(2);
    expect(result.targets.filter((item) => item.category === "venue")).toHaveLength(2);
  });
});

function venueTarget(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Quai M",
    category: "venue",
    city: "Nantes",
    country: "France",
    sourceUrl: null,
    sourceType: "similar_artist_live_history",
    sourceProvider: "similar_artist_event_history",
    genres: ["pop punk"],
    venueName: "Quai M",
    eventDate: null,
    isFutureEvent: null,
    isPastEvent: null,
    dateConfidence: null,
    opportunityKind: "actionable",
    contacts: [],
    confidence: 0.85,
    evidence: [],
    ...overrides
  };
}

describe("venue opportunities discovered from similar-artist concerts", () => {
  it("merges multiple concerts at the same venue into a single deduplicated venue opportunity", async () => {
    const providerA = providerReturning("provider-a", [
      venueTarget({ sourceUrl: null, evidence: ["Similar artist Artist A played here."] })
    ]);
    const providerB = providerReturning("provider-b", [
      venueTarget({ sourceUrl: null, evidence: ["Similar artist Artist B played here."] })
    ]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    const venues = result.targets.filter((t) => t.category === "venue");
    expect(venues).toHaveLength(1);
    expect(venues[0]?.evidence.join(" ")).toContain("Artist A");
    expect(venues[0]?.evidence.join(" ")).toContain("Artist B");
  });

  it("does not overwrite an existing official venue website when a concert-derived candidate for the same venue merges in later", async () => {
    const officialSite = providerReturning("provider-official", [
      venueTarget({ sourceUrl: "https://quai-m.fr", sourceType: "official_site", sourceProvider: "web_search_booking" })
    ]);
    const concertDerived = providerReturning("provider-concert-history", [
      venueTarget({ sourceUrl: null, sourceType: "similar_artist_live_history", evidence: ["Similar artist Artist A played here."] })
    ]);

    const result = await searchBookingOpportunities(input, { providers: [officialSite, concertDerived] });

    const venue = result.targets.find((t) => t.category === "venue");
    expect(venue?.sourceUrl).toBe("https://quai-m.fr");

    // Order must not matter — the official site must win even if the
    // concert-derived candidate is discovered first.
    const reversedResult = await searchBookingOpportunities(input, { providers: [concertDerived, officialSite] });
    const reversedVenue = reversedResult.targets.find((t) => t.category === "venue");
    expect(reversedVenue?.sourceUrl).toBe("https://quai-m.fr");
  });

  it("has no primary URL, rather than an event URL, when no candidate for the venue can be verified", async () => {
    const providerA = providerReturning("provider-a", [venueTarget({ sourceUrl: null })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA] });

    const venue = result.targets.find((t) => t.category === "venue");
    expect(venue?.sourceUrl).toBeNull();
  });

  it("does not create a venue opportunity from a generic genre-matched concert with no similar-artist link", async () => {
    // A concert surfaced only by genre/location search (e.g. a broad
    // "punk hardcore concerts France" query), with no derivedFromSimilarArtist
    // — the frontend would render this as relatedArtist: null. Matching
    // genre alone is not sufficient evidence to also spawn a venue
    // opportunity for it (only the dedicated similar-artist-concert
    // discovery paths do that, and only for a concert they resolved
    // against one of the selected similar artists).
    const genericConcert = providerReturning("provider-generic-search", [
      target({
        name: "Fossilization / Phobocosm / Grotesquerie le 16 août 2026 à Vaulx-en-Velin",
        venueName: null,
        sourceUrl: "https://razibus.net/16-08-2026-fossilization-phobocosm-grotesquerie",
        derivedFromSimilarArtist: null
      })
    ]);

    const result = await searchBookingOpportunities(input, { providers: [genericConcert] });

    expect(result.targets.some((t) => t.category === "venue")).toBe(false);
    const concert = result.targets.find((t) => t.category === "event");
    expect(concert).toBeDefined();
    expect(concert?.derivedFromSimilarArtist).toBeNull();
  });
});
