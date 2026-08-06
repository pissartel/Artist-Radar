import { describe, expect, it } from "vitest";
import { classifyEventDate } from "../src/booking/relevance.js";
import { searchBookingOpportunities } from "../src/booking/searchBookingOpportunities.js";
import type { BookingSourceProvider } from "../src/booking/providers/BookingSourceProvider.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";

const NOW = new Date("2026-07-11T12:00:00Z");
const RECENT_MONTHS = 24;

const input: BookingSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 5
};

describe("classifyEventDate", () => {
  it("displays a future event as an actionable opportunity", () => {
    const result = classifyEventDate("2026-07-12", RECENT_MONTHS, NOW);
    expect(result.isFutureEvent).toBe(true);
    expect(result.isPastEvent).toBe(false);
    expect(result.dateConfidence).toBe("verified");
    expect(result.opportunityKind).toBe("actionable");
  });

  it("displays an event dated today as an actionable opportunity", () => {
    const result = classifyEventDate("2026-07-11", RECENT_MONTHS, NOW);
    expect(result.isFutureEvent).toBe(true);
    expect(result.isPastEvent).toBe(false);
    expect(result.opportunityKind).toBe("actionable");
  });

  it("rejects an event dated yesterday from actionable opportunities", () => {
    const result = classifyEventDate("2026-07-10", RECENT_MONTHS, NOW);
    expect(result.isFutureEvent).toBe(false);
    expect(result.isPastEvent).toBe(true);
    expect(result.opportunityKind).toBe("historical_signal");
  });

  it("rejects a 2025 event when the current date is in 2026", () => {
    const result = classifyEventDate("2025-05-24", RECENT_MONTHS, NOW);
    expect(result.isPastEvent).toBe(true);
    expect(result.opportunityKind).toBe("historical_signal");
  });

  it("marks an unparseable/missing date as needs review, never verified", () => {
    const result = classifyEventDate(null, RECENT_MONTHS, NOW);
    expect(result.dateConfidence).toBe("unclear");
    expect(result.opportunityKind).toBe("historical_signal");
    expect(result.isFutureEvent).toBeNull();
  });
});

describe("searchBookingOpportunities past-event filtering", () => {
  it("excludes past-dated candidates from actionable opportunities while keeping future ones", async () => {
    const provider: BookingSourceProvider = {
      providerName: "qa_past_event_provider",
      async search() {
        const targets: BookingTarget[] = [
          baseTarget({
            name: "Upcoming Pop Punk Show",
            category: "event",
            eventDate: "2026-08-15",
            sourceUrl: "https://example.test/upcoming-show"
          }),
          baseTarget({
            name: "Past Pop Punk Show",
            category: "event",
            eventDate: "2025-05-24",
            sourceUrl: "https://example.test/past-show"
          })
        ];
        return {
          sourceProvider: "qa_past_event_provider",
          searchedQueries: [],
          warnings: [],
          metadata: {},
          targets
        };
      }
    };

    const result = await searchBookingOpportunities(input, { providers: [provider], now: NOW });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["Upcoming Pop Punk Show"]);
    expect(result.opportunities[0]?.opportunityKind).toBe("actionable");
    expect(result.targets.some((target) => target.name === "Past Pop Punk Show" && target.opportunityKind === "historical_signal")).toBe(true);
    expect(result.rejectedByReason.pastEvent).toBeGreaterThanOrEqual(1);
  });

  it("never keeps a past concert detected by the OpenAI web-search provider as an actionable event, even though its derived venue lead stays actionable", async () => {
    // Venue-opportunity spec: a past concert — regardless of how it was
    // discovered — is only ever evidence that a venue is compatible, never
    // a concert opportunity of its own. In practice OpenAIWebSearchConcertProvider
    // never even emits an "event"-category target for a past concert (see
    // its own tests), but this asserts the shared relevance layer enforces
    // the same rule for any provider, so no future OpenAI-specific
    // exemption can quietly reappear here.
    const provider: BookingSourceProvider = {
      providerName: "qa_openai_web_search",
      async search() {
        const targets: BookingTarget[] = [
          baseTarget({
            name: "The Slugz at La Maroquinerie",
            category: "event",
            eventDate: "2025-05-24",
            sourceUrl: "https://example.test/the-slugz-maroquinerie",
            sourceProvider: "openai_web_search"
          }),
          baseTarget({
            name: "La Maroquinerie",
            category: "venue",
            eventDate: null,
            sourceUrl: "https://example.test/la-maroquinerie",
            sourceProvider: "openai_web_search"
          })
        ];
        return {
          sourceProvider: "qa_openai_web_search",
          searchedQueries: [],
          warnings: [],
          metadata: {},
          targets
        };
      }
    };

    const result = await searchBookingOpportunities(input, { providers: [provider], now: NOW });

    expect(result.opportunities.map((opportunity) => opportunity.name)).toEqual(["La Maroquinerie"]);
    expect(
      result.targets.some(
        (target) => target.name === "The Slugz at La Maroquinerie" && target.opportunityKind === "historical_signal"
      )
    ).toBe(true);
  });
});

function baseTarget(overrides: Partial<BookingTarget> = {}): BookingTarget {
  return {
    name: "Pop Punk Venue",
    category: "venue",
    city: "Paris",
    country: "France",
    description: "Salle de concert pop punk punk rock.",
    sourceUrl: "https://example.test/venue",
    sourceType: "mock",
    genres: ["pop punk"],
    estimatedCapacity: null,
    estimatedArtistTier: null,
    contacts: [],
    confidence: 0.85,
    evidence: [],
    ...overrides
  };
}
