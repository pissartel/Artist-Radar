import { describe, expect, it } from "vitest";
import {
  isGenericTicketmasterClassification,
  mapGenreToTicketmasterClassifications,
  ticketmasterGenreMappings
} from "../../../src/providers/ticketmaster/genreMapping.js";

describe("ticketmaster genre mapping", () => {
  it("maps a known genre to its Ticketmaster classifications, most specific first", () => {
    expect(mapGenreToTicketmasterClassifications("pop punk")).toEqual(["Punk", "Alternative Rock", "Rock"]);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapGenreToTicketmasterClassifications("  Pop Punk  ")).toEqual(ticketmasterGenreMappings["pop punk"]);
  });

  it("falls back to a substring match against known keys", () => {
    expect(mapGenreToTicketmasterClassifications("melodic punk rock hybrid")).toEqual(
      expect.arrayContaining(["Punk"])
    );
  });

  it("returns an empty array (no confident mapping) for an unmapped genre rather than guessing", () => {
    expect(mapGenreToTicketmasterClassifications("shoegaze")).toEqual([]);
  });

  it("returns an empty array for an empty genre string", () => {
    expect(mapGenreToTicketmasterClassifications("")).toEqual([]);
  });

  it("identifies generic classifications that should score lower than a specific match", () => {
    expect(isGenericTicketmasterClassification("Rock")).toBe(true);
    expect(isGenericTicketmasterClassification("Pop")).toBe(true);
    expect(isGenericTicketmasterClassification("Punk")).toBe(false);
    expect(isGenericTicketmasterClassification("Alternative Rock")).toBe(false);
  });

  it("is documented as non-exhaustive by construction (not every genre needs an entry)", () => {
    expect(Object.keys(ticketmasterGenreMappings).length).toBeGreaterThan(0);
    expect(ticketmasterGenreMappings["some genre nobody uses"]).toBeUndefined();
  });
});
