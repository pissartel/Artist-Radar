import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_MUSIC_SEARCH_RADIUS_KM,
  allSearchLocations,
  distanceKm,
  isWithinRadiusKm,
  resolveGeographicSearchScope,
  resolveLiveMusicSearchRadiusKm
} from "../../../src/sources/liveMusicEntities/geoDiscoveryConfig.js";

describe("resolveLiveMusicSearchRadiusKm", () => {
  it("uses the explicit override when provided", () => {
    expect(resolveLiveMusicSearchRadiusKm(50, {})).toBe(50);
  });

  it("falls back to the env var when no override is given", () => {
    expect(resolveLiveMusicSearchRadiusKm(undefined, { LIVE_MUSIC_DISCOVERY_RADIUS_KM: "40" })).toBe(40);
  });

  it("falls back to the documented default when neither override nor env is set", () => {
    expect(resolveLiveMusicSearchRadiusKm(undefined, {})).toBe(DEFAULT_LIVE_MUSIC_SEARCH_RADIUS_KM);
  });

  it("ignores a non-positive override", () => {
    expect(resolveLiveMusicSearchRadiusKm(-5, {})).toBe(DEFAULT_LIVE_MUSIC_SEARCH_RADIUS_KM);
  });
});

describe("resolveGeographicSearchScope", () => {
  it("carries surrounding cities and does not include the region unless asked", () => {
    const scope = resolveGeographicSearchScope({
      city: "Bordeaux",
      surroundingCities: ["Mérignac", "Pessac"],
      region: "Nouvelle-Aquitaine"
    }, {});
    expect(scope.surroundingCities).toEqual(["Mérignac", "Pessac"]);
    expect(scope.includeRegion).toBe(false);
  });
});

describe("allSearchLocations", () => {
  it("includes the city, surrounding cities, and the region only when includeRegion is true", () => {
    const scope = resolveGeographicSearchScope({
      city: "Bordeaux",
      surroundingCities: ["Mérignac"],
      includeRegion: true,
      region: "Nouvelle-Aquitaine"
    }, {});
    expect(allSearchLocations(scope)).toEqual(["Bordeaux", "Mérignac", "Nouvelle-Aquitaine"]);
  });

  it("excludes the region when includeRegion is false", () => {
    const scope = resolveGeographicSearchScope({ city: "Bordeaux", region: "Nouvelle-Aquitaine" }, {});
    expect(allSearchLocations(scope)).toEqual(["Bordeaux"]);
  });
});

describe("distanceKm / isWithinRadiusKm", () => {
  it("computes ~0km distance for identical points", () => {
    const point = { latitude: 44.8378, longitude: -0.5792 };
    expect(distanceKm(point, point)).toBeCloseTo(0, 5);
  });

  it("computes a plausible distance between Bordeaux and Mérignac", () => {
    const bordeaux = { latitude: 44.8378, longitude: -0.5792 };
    const merignac = { latitude: 44.8422, longitude: -0.6514 };
    const km = distanceKm(bordeaux, merignac);
    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(10);
  });

  it("isWithinRadiusKm respects the given radius", () => {
    const bordeaux = { latitude: 44.8378, longitude: -0.5792 };
    const merignac = { latitude: 44.8422, longitude: -0.6514 };
    expect(isWithinRadiusKm(bordeaux, merignac, 20)).toBe(true);
    expect(isWithinRadiusKm(bordeaux, merignac, 1)).toBe(false);
  });
});
