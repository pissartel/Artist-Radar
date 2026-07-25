import { describe, expect, it } from "vitest";
import { resolveGeographicSearchScope } from "../../../src/sources/liveMusicEntities/geoDiscoveryConfig.js";
import { buildLiveMusicEntityDiscoveryQueries } from "../../../src/sources/liveMusicEntities/queryTemplates.js";

describe("buildLiveMusicEntityDiscoveryQueries", () => {
  it("combines genre, structure type and city into a controlled-template query", () => {
    const scope = resolveGeographicSearchScope({ city: "Bordeaux" }, {});
    const queries = buildLiveMusicEntityDiscoveryQueries(
      { genres: ["pop punk"], entityTypes: ["cafe_concert"] },
      scope
    );
    expect(queries).toContain('"pop punk" "café concert" Bordeaux');
  });

  it("generates an association query matching the issue's example", () => {
    const scope = resolveGeographicSearchScope({ city: "Bordeaux" }, {});
    const queries = buildLiveMusicEntityDiscoveryQueries(
      { genres: ["punk rock"], entityTypes: ["association"] },
      scope
    );
    expect(queries).toContain('"punk rock" "association" Bordeaux');
  });

  it("generates a similar-artist query matching the issue's example", () => {
    const scope = resolveGeographicSearchScope({ city: "Bordeaux" }, {});
    const queries = buildLiveMusicEntityDiscoveryQueries(
      { genres: [], similarArtistNames: ["Tuesday Fall"] },
      scope
    );
    expect(queries).toContain('"Tuesday Fall" concert venue');
    expect(queries).toContain('"Tuesday Fall" concert Bordeaux');
  });

  it("expands queries across surrounding cities within the configured radius", () => {
    const scope = resolveGeographicSearchScope(
      { city: "Bordeaux", surroundingCities: ["Mérignac"] },
      {}
    );
    const queries = buildLiveMusicEntityDiscoveryQueries({ genres: ["emo"], entityTypes: ["promoter"] }, scope);
    expect(queries).toContain('"emo" "promoteur concerts" Bordeaux');
    expect(queries).toContain('"emo" "promoteur concerts" Mérignac');
  });

  it("never uses an LLM, only deterministic string templates: same input yields the same output", () => {
    const scope = resolveGeographicSearchScope({ city: "Paris" }, {});
    const context = { genres: ["emo"], entityTypes: ["promoter" as const] };
    expect(buildLiveMusicEntityDiscoveryQueries(context, scope)).toEqual(buildLiveMusicEntityDiscoveryQueries(context, scope));
  });

  it("deduplicates identical queries", () => {
    const scope = resolveGeographicSearchScope({ city: "Bordeaux", surroundingCities: ["Bordeaux"] }, {});
    const queries = buildLiveMusicEntityDiscoveryQueries({ genres: ["punk"], entityTypes: ["bar"] }, scope);
    expect(queries.filter((query) => query === '"punk" "bar" Bordeaux')).toHaveLength(1);
  });
});
