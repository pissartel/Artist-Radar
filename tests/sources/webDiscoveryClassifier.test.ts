import { describe, expect, it } from "vitest";
import {
  classifyOrganizationType,
  extractGenres,
  extractServices,
  extractTerritories
} from "../../src/sources/connectors/webDiscoveryClassifier.js";

describe("classifyOrganizationType", () => {
  it("classifies a booking agency from page text", () => {
    const result = classifyOrganizationType("We are a booking agency representing pop punk bands.", null);
    expect(result).toMatchObject({ type: "BOOKER", matchedFromText: true });
  });

  it("distinguishes a manager from a label and a promoter", () => {
    expect(classifyOrganizationType("Artist management for emerging rock artists.", null)?.type).toBe("MANAGER");
    expect(classifyOrganizationType("Independent record label based in Paris.", null)?.type).toBe("LABEL");
    expect(classifyOrganizationType("We are a concert promoter organizing rock shows.", null)?.type).toBe("PROMOTER");
  });

  it("falls back to the query hint when the text has no classification evidence, but marks it unverified", () => {
    const result = classifyOrganizationType("Contact us for more information.", "ASSOCIATION");
    expect(result).toEqual({ type: "ASSOCIATION", matchedKeywords: [], matchedFromText: false });
  });

  it("rejects (returns null) when neither the text nor a hint gives any evidence", () => {
    expect(classifyOrganizationType("Contact us for more information.", null)).toBeNull();
  });

  it("prefers text-based evidence over the query hint when they disagree", () => {
    const result = classifyOrganizationType("Independent record label based in Lyon.", "PROMOTER");
    expect(result?.type).toBe("LABEL");
    expect(result?.matchedFromText).toBe(true);
  });
});

describe("extractServices", () => {
  it("extracts service keywords mentioned in the text", () => {
    expect(extractServices("We offer booking and artist management services.")).toEqual(
      expect.arrayContaining(["booking", "artist management"])
    );
  });

  it("returns an empty list when no service keyword is present", () => {
    expect(extractServices("Just a random sentence about music.")).toEqual([]);
  });
});

describe("extractGenres", () => {
  it("only returns genres actually mentioned in the text", () => {
    const genres = extractGenres("We book punk rock and emo bands across France.", ["pop punk"]);
    expect(genres).toEqual(expect.arrayContaining(["punk rock", "emo"]));
    expect(genres).not.toContain("metal");
  });

  it("returns an empty list when the text mentions none of the related genres", () => {
    expect(extractGenres("We book jazz ensembles.", ["pop punk"])).toEqual([]);
  });
});

describe("extractTerritories", () => {
  it("only returns known locations actually mentioned in the text", () => {
    const territories = extractTerritories("Based in Bordeaux, touring across France.", ["Bordeaux", "France", "Paris"]);
    expect(territories).toEqual(expect.arrayContaining(["Bordeaux", "France"]));
    expect(territories).not.toContain("Paris");
  });

  it("ignores null/undefined known locations", () => {
    expect(extractTerritories("Based in Bordeaux.", [null, undefined, "Bordeaux"])).toEqual(["Bordeaux"]);
  });
});
