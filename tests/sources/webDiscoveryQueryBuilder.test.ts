import { describe, expect, it } from "vitest";
import { buildOrganizationDiscoveryQueries } from "../../src/sources/connectors/webDiscoveryQueryBuilder.js";

describe("buildOrganizationDiscoveryQueries", () => {
  it("builds queries from genre and city combinations for the default organization types", () => {
    const queries = buildOrganizationDiscoveryQueries({
      genres: ["pop punk"],
      artistCity: "Bordeaux",
      artistCountry: "France"
    });

    const queryStrings = queries.map((entry) => entry.query);
    expect(queryStrings).toContain("pop punk booking agency Bordeaux");
    expect(queryStrings).toContain("promoter pop punk Bordeaux");
    expect(queryStrings).toContain("association concerts pop punk Bordeaux");
    expect(queryStrings).toContain("management artistes pop punk France");
    expect(queryStrings).toContain("label pop punk France demo submission");
  });

  it("includes target cities alongside the artist's own city", () => {
    const queries = buildOrganizationDiscoveryQueries({
      genres: ["punk"],
      artistCity: "Bordeaux",
      targetCities: ["Paris"]
    });

    const queryStrings = queries.map((entry) => entry.query);
    expect(queryStrings.some((query) => query.includes("Paris"))).toBe(true);
    expect(queryStrings.some((query) => query.includes("Bordeaux"))).toBe(true);
  });

  it("builds a booking query for each similar artist", () => {
    const queries = buildOrganizationDiscoveryQueries({
      genres: [],
      similarArtistNames: ["Example Band"]
    });

    expect(queries).toContainEqual({
      query: "Example Band booking",
      organizationTypeHint: "BOOKER",
      genre: null,
      city: null
    });
  });

  it("builds an organizer-contact query for each known venue/festival name", () => {
    const queries = buildOrganizationDiscoveryQueries({
      genres: [],
      knownOrganizationNames: ["Exemple Fest"]
    });

    expect(queries).toContainEqual({
      query: "Exemple Fest organizer contact",
      organizationTypeHint: null,
      genre: null,
      city: null
    });
  });

  it("restricts generated queries to the requested organization types", () => {
    const queries = buildOrganizationDiscoveryQueries({
      genres: ["metal"],
      artistCity: "Lyon",
      organizationTypes: ["MANAGER"]
    });

    expect(queries.every((entry) => entry.organizationTypeHint === "MANAGER")).toBe(true);
    expect(queries.length).toBeGreaterThan(0);
  });

  it("deduplicates identical queries", () => {
    const queries = buildOrganizationDiscoveryQueries({
      genres: ["punk", "punk"],
      artistCity: "Bordeaux"
    });

    const queryStrings = queries.map((entry) => entry.query);
    expect(new Set(queryStrings).size).toBe(queryStrings.length);
  });

  it("returns an empty list when there is no genre, city or country to build a query from", () => {
    const queries = buildOrganizationDiscoveryQueries({ genres: [] });
    expect(queries).toEqual([]);
  });
});
