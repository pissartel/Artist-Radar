import { describe, expect, it } from "vitest";
import { hasCoordinates, locationCacheKey, locationQuery } from "@/lib/mapLocation";

describe("normalized map locations", () => {
  it("creates a stable case-insensitive cache key", () => {
    expect(locationCacheKey({ city: "Paris", country: "France", precision: "city" }))
      .toBe("paris, france");
  });

  it("uses the most precise available query without inventing fields", () => {
    expect(locationQuery({ address: "1 Test St", city: "Leeds", country: "UK", precision: "exact" }))
      .toBe("1 Test St, Leeds, UK");
  });

  it("requires both finite coordinates", () => {
    expect(hasCoordinates({ city: "Berlin", latitude: 52.52, longitude: 13.405, precision: "exact" })).toBe(true);
    expect(hasCoordinates({ country: "Germany", latitude: 52.52, precision: "country" })).toBe(false);
  });
});
