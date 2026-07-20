import { describe, expect, it } from "vitest";
import { normalizeLocationParts } from "../src/utils/location.js";

describe("normalizeLocationParts", () => {
  it("nulls the city when it duplicates the country", () => {
    expect(normalizeLocationParts("France", "France")).toEqual({ city: null, country: "France" });
  });

  it("is case-insensitive when detecting a duplicate", () => {
    expect(normalizeLocationParts("france", "France")).toEqual({ city: null, country: "France" });
  });

  it("keeps a real city distinct from its country", () => {
    expect(normalizeLocationParts("Rennes", "France")).toEqual({ city: "Rennes", country: "France" });
  });

  it("handles missing city or country", () => {
    expect(normalizeLocationParts(null, "France")).toEqual({ city: null, country: "France" });
    expect(normalizeLocationParts("Rennes", null)).toEqual({ city: "Rennes", country: null });
    expect(normalizeLocationParts(null, null)).toEqual({ city: null, country: null });
  });

  it("trims whitespace", () => {
    expect(normalizeLocationParts("  Rennes  ", " France ")).toEqual({ city: "Rennes", country: "France" });
  });
});
