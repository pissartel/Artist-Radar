import { describe, expect, it } from "vitest";
import {
  getCommercialExplanation,
  getCommercialTierLabel,
  getScaleFitLabel,
} from "@/lib/similarArtist";
import type { SimilarArtist } from "@/types";

function baseArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    id: "blink-182",
    name: "blink-182",
    genres: ["pop punk"],
    location: "California, USA",
    matchScore: 46,
    ...overrides,
  };
}

describe("getCommercialTierLabel", () => {
  it("renders Scale unknown when no commercialTier is present, never a scale claim", () => {
    expect(getCommercialTierLabel(undefined)).toBe("Scale unknown");
  });

  it("renders Scale unknown for the scale_unknown tier explicitly", () => {
    expect(getCommercialTierLabel("scale_unknown")).toBe("Scale unknown");
  });

  it("renders Major reference for major_reference (blink-182-style case)", () => {
    expect(getCommercialTierLabel("major_reference")).toBe("Major reference");
  });

  it("never renders Emerging or Same level for missing/unknown data", () => {
    expect(getCommercialTierLabel(undefined)).not.toMatch(/emerging/i);
    expect(getCommercialTierLabel(undefined)).not.toMatch(/same level/i);
    expect(getCommercialTierLabel("scale_unknown")).not.toMatch(/emerging/i);
    expect(getCommercialTierLabel("scale_unknown")).not.toMatch(/same level/i);
  });
});

describe("getScaleFitLabel", () => {
  it("matches the issue's own worked example: major_reference -> Very low", () => {
    expect(getScaleFitLabel("major_reference")).toBe("Very low");
  });

  it("returns Unknown when no commercialTier is present", () => {
    expect(getScaleFitLabel(undefined)).toBe("Unknown");
  });
});

describe("getCommercialExplanation", () => {
  it("returns the required message when commercial scale is unavailable", () => {
    const artist = baseArtist({ commercialTier: undefined });
    expect(getCommercialExplanation(artist)).toBe(
      "Commercial scale could not be verified from the available sources."
    );
  });

  it("returns the same unavailable message for scale_unknown", () => {
    const artist = baseArtist({ commercialTier: "scale_unknown" });
    expect(getCommercialExplanation(artist)).toBe(
      "Commercial scale could not be verified from the available sources."
    );
  });

  it("explains a major_reference candidate as a genre reference rather than a comparable booking-level artist", () => {
    const artist = baseArtist({ commercialTier: "major_reference", genres: ["pop punk"] });
    const explanation = getCommercialExplanation(artist);
    expect(explanation).toContain("pop punk");
    expect(explanation).toContain("substantially larger");
    expect(explanation).toContain("genre reference");
    expect(explanation).not.toMatch(/chartmetric/i);
  });

  it("never mentions the Chartmetric provider name for any tier", () => {
    const tiers: Array<SimilarArtist["commercialTier"]> = [
      "same_level",
      "slightly_larger",
      "aspirational",
      "major_reference",
      "local_compatible_artist",
      "scale_unknown",
      undefined,
    ];
    for (const commercialTier of tiers) {
      expect(getCommercialExplanation(baseArtist({ commercialTier }))).not.toMatch(/chartmetric/i);
    }
  });
});
