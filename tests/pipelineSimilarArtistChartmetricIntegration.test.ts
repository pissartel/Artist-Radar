import { afterEach, describe, expect, it, vi } from "vitest";
import { flattenSimilarArtists, runOpportunitySearch } from "../src/pipeline.js";
import type { ArtistInput, OpportunitySearchResult } from "../src/schemas.js";
import type { OpportunityGenerator } from "../src/services/openaiService.js";
import type { SimilarArtistCandidateEnrichmentProvider } from "../src/modules/similarArtistCommercialEnrichment.js";

const promoInput: ArtistInput = {
  mode: "promo",
  artist: "Fake Band",
  city: "Lyon",
  genre: "pop punk",
  target: null,
  links: [],
  limit: 1
};

const validResult: OpportunitySearchResult = { opportunities: [] };

function generatorReturning(result: OpportunitySearchResult): OpportunityGenerator {
  return { async generate() { return result; } };
}

describe("runOpportunitySearch similar-artist Chartmetric integration (issue #201)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends the discovered similar-artist candidates to the injected provider and attaches its results", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const chartmetricSimilarArtistProvider: SimilarArtistCandidateEnrichmentProvider = {
      enrichCandidates: vi.fn().mockImplementation((input: { candidates: { artistName: string }[] }) =>
        Promise.resolve(
          input.candidates.map((candidate) => ({ provider: "chartmetric" as const, candidateName: candidate.artistName, status: "not_found" as const }))
        )
      )
    };

    const result = await runOpportunitySearch(promoInput, {
      generator: generatorReturning(validResult),
      seedCandidates: [],
      chartmetricSimilarArtistProvider
    });

    expect(chartmetricSimilarArtistProvider.enrichCandidates).toHaveBeenCalledTimes(1);
    const flattened = flattenSimilarArtists(result.similarArtists);
    expect(flattened.length).toBeGreaterThan(0);
    expect(flattened.every((artist) => typeof artist.commercialTier === "string")).toBe(true);
  });

  it("keeps the existing similar-artist discovery output when the candidate Chartmetric provider throws", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const throwingProvider: SimilarArtistCandidateEnrichmentProvider = {
      enrichCandidates: vi.fn().mockRejectedValue(new Error("provider exploded"))
    };

    const result = await runOpportunitySearch(promoInput, {
      generator: generatorReturning(validResult),
      seedCandidates: [],
      chartmetricSimilarArtistProvider: throwingProvider
    });

    const flattened = flattenSimilarArtists(result.similarArtists);
    expect(flattened.length).toBeGreaterThan(0);
    expect(flattened.every((artist) => artist.commercialTier === undefined)).toBe(true);
  });
});
