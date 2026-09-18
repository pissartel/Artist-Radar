import { describe, expect, it } from "vitest";
import { isInTargetMarket } from "../src/booking/targetCountry.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";

const input = {
  artist: "Tuesday Fall",
  city: "France",
  genre: "pop punk",
  target: "France",
  links: [],
  limit: 20,
} as BookingSearchInput;

function target(city: string, country: string | null): BookingTarget {
  return {
    name: "Candidate",
    category: "venue",
    city,
    country,
    sourceUrl: "https://example.test",
    sourceType: "search_result",
    genres: ["pop punk"],
    contacts: [],
    confidence: 0.8,
    evidence: [],
  };
}

describe("country-wide booking target filtering", () => {
  it("keeps a city returned without a country by a country-scoped search", () => {
    expect(isInTargetMarket(input, target("Paris", null), "france")).toBe(true);
  });

  it("still rejects an explicitly different country", () => {
    expect(isInTargetMarket(input, target("Berlin", "Germany"), "france")).toBe(false);
  });
});
