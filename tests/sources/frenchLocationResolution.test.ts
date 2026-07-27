import { describe, expect, it } from "vitest";
import {
  isNationwideFranceLocationText,
  resolveCountryCodeFromLocationText,
  resolveSearchLocationCoordinates
} from "../../src/sources/connectors/frenchLocationResolution.js";

describe("resolveCountryCodeFromLocationText", () => {
  it("resolves the bare country name", () => {
    expect(resolveCountryCodeFromLocationText("France")).toBe("FR");
  });

  it("resolves a major French city with no country segment", () => {
    expect(resolveCountryCodeFromLocationText("Paris")).toBe("FR");
    expect(resolveCountryCodeFromLocationText("Bordeaux")).toBe("FR");
  });

  it("resolves a city with an explicit country name segment", () => {
    expect(resolveCountryCodeFromLocationText("Lyon, France")).toBe("FR");
  });

  it("resolves a city with an explicit country code segment", () => {
    expect(resolveCountryCodeFromLocationText("Marseille, FR")).toBe("FR");
  });

  it("is case- and accent-insensitive", () => {
    expect(resolveCountryCodeFromLocationText("bordeaux")).toBe("FR");
    expect(resolveCountryCodeFromLocationText("FRANCE")).toBe("FR");
    expect(resolveCountryCodeFromLocationText("République française")).toBe("FR");
  });

  it("does not run for Brussels, Belgium", () => {
    expect(resolveCountryCodeFromLocationText("Brussels, Belgium")).toBe("BE");
  });

  it("does not run for London, United Kingdom", () => {
    expect(resolveCountryCodeFromLocationText("London, United Kingdom")).toBe("GB");
  });

  it("resolves an unaccompanied non-French known city correctly", () => {
    expect(resolveCountryCodeFromLocationText("Brussels")).toBe("BE");
    expect(resolveCountryCodeFromLocationText("London")).toBe("GB");
  });

  it("returns null when the country cannot be determined", () => {
    expect(resolveCountryCodeFromLocationText("Some Unknown Town")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(resolveCountryCodeFromLocationText("")).toBeNull();
    expect(resolveCountryCodeFromLocationText("   ")).toBeNull();
  });
});

describe("resolveSearchLocationCoordinates", () => {
  it("resolves coordinates for a known major city", () => {
    const coords = resolveSearchLocationCoordinates("Bordeaux");
    expect(coords).not.toBeNull();
    expect(coords?.latitude).toBeCloseTo(44.8378, 1);
    expect(coords?.longitude).toBeCloseTo(-0.5792, 1);
  });

  it("resolves coordinates ignoring an explicit country segment", () => {
    const coords = resolveSearchLocationCoordinates("Lyon, France");
    expect(coords).not.toBeNull();
    expect(coords?.latitude).toBeCloseTo(45.764, 1);
  });

  it("returns null for a city not in the static table", () => {
    expect(resolveSearchLocationCoordinates("Some Unknown Town")).toBeNull();
  });

  it("returns null for a non-French city", () => {
    expect(resolveSearchLocationCoordinates("Brussels")).toBeNull();
  });
});

describe("isNationwideFranceLocationText", () => {
  it("is true for the bare country name/code", () => {
    expect(isNationwideFranceLocationText("France")).toBe(true);
    expect(isNationwideFranceLocationText("FR")).toBe(true);
  });

  it("is false for a specific city", () => {
    expect(isNationwideFranceLocationText("Bordeaux")).toBe(false);
    expect(isNationwideFranceLocationText("Lyon, France")).toBe(false);
  });
});
