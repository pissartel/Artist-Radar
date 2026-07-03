import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { runSimilarArtistsAiWorkflow } from "../src/similar-artists/similarArtistsAiWorkflow.js";
import type { SimilarArtistRagCandidate, SimilarArtistRagSearchInput } from "../src/similar-artists/types.js";
import {
  buildEvalChunkStore,
  buildEvalEmbeddingProvider,
  checkAccepted,
  checkGenreCompatibilityAtLeast,
  checkHasEvidence,
  checkHasValidSourceUrls,
  checkNoRejectedGenreInTopResults,
  checkNotAccepted,
  printEvalSummary,
  reportPassed,
  type EvalCaseReport,
  type EvalContextDocument,
  type EvalGenreCompatibilityLevel
} from "../src/evals/evalRunner.js";

/**
 * Golden eval dataset for the similar-artists workflow (issue #49): Tuesday
 * Fall / pop punk / Paris / grandes villes françaises. Default tests never
 * call OpenAI — callModel is mocked per case with fixture-defined model
 * output, grounded by a fixture-defined in-memory RAG context.
 */

interface SimilarArtistFixtureCase {
  name: string;
  reason: string;
  candidate: SimilarArtistRagCandidate;
  context: EvalContextDocument;
  modelResponse: Record<string, unknown>;
}

interface SimilarArtistFixture {
  input: { artist: string; genre: string; city: string; target: string };
  similarArtists: {
    positive: SimilarArtistFixtureCase[];
    negative: SimilarArtistFixtureCase[];
  };
}

const fixturePath = new URL("./fixtures/tuesday-fall-pop-punk.json", import.meta.url);
const fixture: SimilarArtistFixture = JSON.parse(readFileSync(fixturePath, "utf-8"));

const goldenCase = fixture.similarArtists.positive[0];
const chansonCase = fixture.similarArtists.negative.find((candidate) => candidate.name === "Chanson Realiste Trio")!;
const genericRockCase = fixture.similarArtists.negative.find((candidate) => candidate.name === "Generic Rock Outfit")!;

function buildSearchInput(candidates: SimilarArtistRagCandidate[]): SimilarArtistRagSearchInput {
  return {
    artist: fixture.input.artist,
    city: fixture.input.city,
    genre: fixture.input.genre,
    target: fixture.input.target,
    links: [],
    limit: 5,
    candidates
  };
}

const reports: EvalCaseReport[] = [];

describe("similar artist golden evals: Tuesday Fall / pop punk / Paris / grandes villes françaises", () => {
  afterAll(() => {
    printEvalSummary("similar artists / Tuesday Fall / pop punk", reports);
  });

  it("accepts a strong-genre, grounded similar artist with evidence and a valid source URL", async () => {
    const chunkStore = buildEvalChunkStore("similar-artists", [goldenCase.context]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ similarArtists: [goldenCase.modelResponse] });

    const result = await runSimilarArtistsAiWorkflow(buildSearchInput([goldenCase.candidate]), {
      chunkStore,
      embeddingProvider,
      callModel
    });
    const accepted = result.similarArtists.find((artist) => artist.name === goldenCase.name);

    const report: EvalCaseReport = {
      caseName: goldenCase.name,
      checks: [
        checkAccepted(result.similarArtists.map((artist) => artist.name), goldenCase.name),
        checkHasEvidence(accepted?.evidence ?? []),
        checkHasValidSourceUrls(accepted?.evidence ?? []),
        checkGenreCompatibilityAtLeast((accepted?.genreCompatibility ?? "reject") as EvalGenreCompatibilityLevel, "strong")
      ]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it("rejects a chanson candidate as genre-incompatible with pop punk", async () => {
    const chunkStore = buildEvalChunkStore("similar-artists", [chansonCase.context]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ similarArtists: [chansonCase.modelResponse] });

    const result = await runSimilarArtistsAiWorkflow(buildSearchInput([chansonCase.candidate]), {
      chunkStore,
      embeddingProvider,
      callModel
    });

    const report: EvalCaseReport = {
      caseName: chansonCase.name,
      checks: [
        checkNotAccepted(result.similarArtists.map((artist) => artist.name), chansonCase.name),
        {
          check: "rejection-reason-recorded",
          passed: result.rejectedCandidates.some((rejected) => rejected.name === chansonCase.name),
          message: result.rejectedCandidates.some((rejected) => rejected.name === chansonCase.name)
            ? `"${chansonCase.name}" has a recorded rejection reason.`
            : `"${chansonCase.name}" is missing from rejectedCandidates — rejections must always be explained.`
        }
      ]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it("downgrades a generic-evidence candidate instead of trusting an inflated strong claim", async () => {
    const chunkStore = buildEvalChunkStore("similar-artists", [genericRockCase.context]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ similarArtists: [genericRockCase.modelResponse] });

    const result = await runSimilarArtistsAiWorkflow(buildSearchInput([genericRockCase.candidate]), {
      chunkStore,
      embeddingProvider,
      callModel
    });
    const accepted = result.similarArtists.find((artist) => artist.name === genericRockCase.name);
    const downgraded = accepted?.genreCompatibility === "weak";

    const report: EvalCaseReport = {
      caseName: genericRockCase.name,
      checks: [
        {
          check: "genre-compatibility-downgrade",
          passed: downgraded,
          message: downgraded
            ? `Model's "strong" claim was correctly downgraded to "weak" based on generic evidence.`
            : `Expected a downgrade to "weak" but got "${accepted?.genreCompatibility ?? "not accepted"}".`
        }
      ]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it("keeps rejected genres out of the top results when several candidates are scored together", async () => {
    const chunkStore = buildEvalChunkStore("similar-artists", [goldenCase.context, genericRockCase.context, chansonCase.context]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () =>
      JSON.stringify({
        similarArtists: [goldenCase.modelResponse, chansonCase.modelResponse, genericRockCase.modelResponse]
      });

    const result = await runSimilarArtistsAiWorkflow(
      buildSearchInput([goldenCase.candidate, chansonCase.candidate, genericRockCase.candidate]),
      { chunkStore, embeddingProvider, callModel }
    );

    const report: EvalCaseReport = {
      caseName: "combined top results",
      checks: [
        checkNotAccepted(result.similarArtists.map((artist) => artist.name), chansonCase.name),
        checkAccepted(result.similarArtists.map((artist) => artist.name), goldenCase.name),
        checkNoRejectedGenreInTopResults(
          result.similarArtists.map((artist) => artist.genreCompatibility as EvalGenreCompatibilityLevel)
        )
      ]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it.skipIf(process.env.EVAL_LIVE !== "true")(
    "[live] runs the real OpenAI model against the golden case (EVAL_LIVE=true only)",
    async () => {
      const chunkStore = buildEvalChunkStore("similar-artists", [goldenCase.context]);
      const embeddingProvider = buildEvalEmbeddingProvider();

      const result = await runSimilarArtistsAiWorkflow(buildSearchInput([goldenCase.candidate]), {
        chunkStore,
        embeddingProvider
      });

      expect(result.similarArtists.length).toBeGreaterThan(0);
    }
  );
});
