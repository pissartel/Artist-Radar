import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpportunitySearch } from "../src/pipeline.js";
import type { ArtistInput, OpportunitySearchResult } from "../src/schemas.js";
import type { OpportunityGenerator } from "../src/services/openaiService.js";
import type { ArtistEnrichmentProvider, ArtistEnrichmentResult } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";

const promoInput: ArtistInput = {
  mode: "promo",
  artist: "Fake Band",
  city: "Lyon",
  genre: "metalcore",
  target: null,
  links: [],
  limit: 1
};

const validResult: OpportunitySearchResult = { opportunities: [] };

function generatorReturning(result: OpportunitySearchResult): OpportunityGenerator {
  return { async generate() { return result; } };
}

describe("runOpportunitySearch Chartmetric integration (issue #142)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes the injected Chartmetric provider's result on the pipeline output", async () => {
    const chartmetricResult: ArtistEnrichmentResult = {
      provider: "chartmetric",
      status: "success",
      matchMethod: "spotify_id",
      matchConfidence: "exact",
      metrics: {
        chartmetricArtistId: "1",
        spotifyMonthlyListeners: 4200,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        matchConfidence: "exact",
        source: "chartmetric"
      }
    };
    const chartmetricProvider: ArtistEnrichmentProvider = {
      enrichArtist: vi.fn().mockResolvedValue(chartmetricResult)
    };

    const result = await runOpportunitySearch(promoInput, {
      generator: generatorReturning(validResult),
      seedCandidates: [],
      chartmetricProvider
    });

    expect(result.chartmetric).toEqual(chartmetricResult);
    expect(chartmetricProvider.enrichArtist).toHaveBeenCalledTimes(1);
  });

  it("completes the analysis normally when the Chartmetric provider throws (safe fallback)", async () => {
    const throwingProvider: ArtistEnrichmentProvider = {
      enrichArtist: vi.fn().mockRejectedValue(new Error("provider exploded"))
    };

    const result = await runOpportunitySearch(promoInput, {
      generator: generatorReturning(validResult),
      seedCandidates: [],
      chartmetricProvider: throwingProvider
    });

    expect(result.opportunities).toEqual([]);
    expect(result.chartmetric).toEqual({ provider: "chartmetric", status: "error", reason: "unexpected_error" });
  });

  it("defaults to a real provider that safely reports missing_credentials when unconfigured", async () => {
    vi.stubEnv("CHARTMETRIC_REFRESH_TOKEN", "");

    const result = await runOpportunitySearch(promoInput, {
      generator: generatorReturning(validResult),
      seedCandidates: []
    });

    expect(result.chartmetric?.status).toBe("skipped");
    expect(result.chartmetric?.reason).toBe("missing_credentials");
  });
});
