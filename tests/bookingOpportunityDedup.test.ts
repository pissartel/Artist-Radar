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
    eventDate: "2026-09-04",
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

    expect(result.targets).toHaveLength(1);
    expect(result.rejectedByReason.duplicate).toBe(1);
    // Richer fields from the second source are preserved, not discarded.
    expect(result.targets[0]?.imageUrl).toBe("https://b.example/image.jpg");
    expect(result.targets[0]?.ticketUrl).toBe("https://b.example/tickets");
    // The second source's URL is preserved as evidence rather than dropped.
    expect(result.targets[0]?.evidence.join(" ")).toContain("https://b.example/event");
  });

  it("does not merge the same date at a different venue", async () => {
    const providerA = providerReturning("provider-a", [target({ venueName: "La Maroquinerie" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", venueName: "Le Bikini", city: "Toulouse" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets).toHaveLength(2);
  });

  it("does not merge the same venue on a different date", async () => {
    const providerA = providerReturning("provider-a", [target({ eventDate: "2026-09-04" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", eventDate: "2026-11-20" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets).toHaveLength(2);
  });

  it("normalizes venue-name variants (leading article) across providers before merging", async () => {
    const providerA = providerReturning("provider-a", [target({ venueName: "Le Krakatoa" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", venueName: "Krakatoa" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets).toHaveLength(1);
  });

  it("keeps two different same-day, same-city events separate when neither the venue nor the event name matches (uncertain match)", async () => {
    const providerA = providerReturning("provider-a", [target({ name: "Event One", venueName: "Venue Alpha" })]);
    const providerB = providerReturning("provider-b", [target({ sourceUrl: "https://b.example/event", name: "Event Two", venueName: "Venue Beta" })]);

    const result = await searchBookingOpportunities(input, { providers: [providerA, providerB] });

    expect(result.targets).toHaveLength(2);
  });
});
