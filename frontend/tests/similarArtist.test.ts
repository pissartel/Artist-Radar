import { describe, expect, it } from "vitest";
import {
  getCommercialExplanation,
  getCommercialTierLabel,
  getNotorietyLabel,
  getScaleFitLabel,
  hasKnownCommercialScale,
  sortSimilarArtistsByMatch,
} from "@/lib/similarArtist";
import type { SimilarArtist } from "@/types";
import { describeRelativeArtistScale } from "@/lib/artistScale";

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

describe("describeRelativeArtistScale", () => {
  it("describes larger, similar, and smaller candidates relative to the analyzed artist", () => {
    expect(describeRelativeArtistScale(70, 50)).toContain("larger");
    expect(describeRelativeArtistScale(54, 50)).toContain("Similar");
    expect(describeRelativeArtistScale(30, 50)).toContain("smaller");
  });

  it("is explicit when the analyzed artist scale is unavailable", () => {
    expect(describeRelativeArtistScale(54, null)).toContain("unavailable");
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

describe("hasKnownCommercialScale", () => {
  it("treats missing and scale_unknown tiers as unavailable", () => {
    expect(hasKnownCommercialScale(undefined)).toBe(false);
    expect(hasKnownCommercialScale("scale_unknown")).toBe(false);
  });

  it("treats real commercial relationship tiers as displayable", () => {
    expect(hasKnownCommercialScale("same_level")).toBe(true);
    expect(hasKnownCommercialScale("major_reference")).toBe(true);
  });
});

describe("getNotorietyLabel", () => {
  it("does not render a notoriety label when every scale source is unknown", () => {
    expect(getNotorietyLabel(baseArtist())).toBeNull();
    expect(getNotorietyLabel(baseArtist({ commercialAbsoluteScale: "unknown" }))).toBeNull();
  });

  it("uses absolute commercial scale first when available", () => {
    expect(getNotorietyLabel(baseArtist({ commercialAbsoluteScale: "major", artistTier: "emerging" }))).toBe("Major artist");
    expect(getNotorietyLabel(baseArtist({ commercialAbsoluteScale: "developing" }))).toBe("Developing artist");
  });

  it("does not expose computed artist scale outside the detail view", () => {
    expect(
      getNotorietyLabel(
        baseArtist({
          artistScaleBand: "regional",
          artistScaleScoreConfidence: "medium",
          artistTier: "emerging",
        }),
      ),
    ).toBe("Emerging artist");
  });

  it("falls back to artist tier when no richer scale label is available", () => {
    expect(getNotorietyLabel(baseArtist({ artistTier: "rising" }))).toBe("Rising artist");
  });
});

describe("sortSimilarArtistsByMatch", () => {
  it("orders close peer candidates before larger reference artists", () => {
    const artists = [
      baseArtist({
        id: "as-it-is",
        name: "As It Is",
        matchScore: 82,
        musicalMatchScore: 92,
        commercialTier: "major_reference",
      }),
      baseArtist({
        id: "bad-frequencies",
        name: "Bad Frequencies",
        matchScore: 70,
        musicalMatchScore: 84,
        commercialTier: "scale_unknown",
      }),
      baseArtist({
        id: "broad-peak",
        name: "Broad Peak",
        matchScore: 76,
        musicalMatchScore: 90,
      }),
    ];

    expect(sortSimilarArtistsByMatch(artists).map((artist) => artist.name)).toEqual([
      "Broad Peak",
      "Bad Frequencies",
      "As It Is",
    ]);
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
