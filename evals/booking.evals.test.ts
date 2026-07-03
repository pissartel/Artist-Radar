import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { runBookingAiWorkflow } from "../src/booking/bookingAiWorkflow.js";
import type { BookingSearchInput } from "../src/booking/types.js";
import { scoreGenreCompatibility } from "../src/scoring/genreCompatibility.js";
import {
  buildEvalChunkStore,
  buildEvalEmbeddingProvider,
  checkAccepted,
  checkGenreCompatibilityAtLeast,
  checkHasEvidence,
  checkHasValidSourceUrls,
  checkNoInventedContact,
  checkNotAccepted,
  printEvalSummary,
  reportPassed,
  type EvalCaseReport,
  type EvalContextDocument
} from "../src/evals/evalRunner.js";

/**
 * Golden eval dataset for the booking workflow (issue #49): Tuesday Fall /
 * pop punk / Paris / grandes villes françaises. Default tests never call
 * OpenAI — callModel is mocked per case with fixture-defined model output,
 * grounded by a fixture-defined in-memory RAG context.
 */

interface BookingFixtureOpportunity {
  name: string;
  type: string;
  city: string | null;
  relevanceScore: number;
  genreCompatibility: number;
  reason: string;
  evidence: { source: string; sourceUrl: string | null; snippet?: string | null }[];
  contact: string | null;
  risks: string[];
}

interface BookingFixtureCase {
  name: string;
  reason: string;
  opportunity: BookingFixtureOpportunity;
  context: EvalContextDocument;
}

interface BookingFixture {
  input: { artist: string; genre: string; city: string; target: string };
  booking: {
    positive: BookingFixtureCase[];
    negative: BookingFixtureCase[];
    contactSafety: BookingFixtureCase[];
  };
}

const fixturePath = new URL("./fixtures/tuesday-fall-pop-punk.json", import.meta.url);
const fixture: BookingFixture = JSON.parse(readFileSync(fixturePath, "utf-8"));

const goldenContext = fixture.booking.positive[0].context;

function buildBookingInput(): BookingSearchInput {
  return {
    artist: fixture.input.artist,
    city: fixture.input.city,
    genre: fixture.input.genre,
    target: fixture.input.target,
    links: [],
    limit: 5
  };
}

const reports: EvalCaseReport[] = [];

describe("booking golden evals: Tuesday Fall / pop punk / Paris / grandes villes françaises", () => {
  afterAll(() => {
    printEvalSummary("booking / Tuesday Fall / pop punk", reports);
  });

  it("accepts a strong-genre, grounded booking opportunity with evidence and a valid source URL", async () => {
    const goldenCase = fixture.booking.positive[0];
    const chunkStore = buildEvalChunkStore("booking", [goldenCase.context]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ opportunities: [goldenCase.opportunity] });

    const result = await runBookingAiWorkflow(buildBookingInput(), { chunkStore, embeddingProvider, callModel });
    const accepted = result.opportunities.find((opportunity) => opportunity.name === goldenCase.name);

    const genreLevel = scoreGenreCompatibility(fixture.input.genre, {
      sourceText: `${accepted?.type ?? ""} ${accepted?.reason ?? ""} ${(accepted?.evidence ?? [])
        .map((evidence) => evidence.snippet ?? "")
        .join(" ")}`
    }).level;

    const report: EvalCaseReport = {
      caseName: goldenCase.name,
      checks: [
        checkAccepted(result.opportunities.map((opportunity) => opportunity.name), goldenCase.name),
        checkHasEvidence(accepted?.evidence ?? []),
        checkHasValidSourceUrls(accepted?.evidence ?? []),
        checkGenreCompatibilityAtLeast(genreLevel, "strong")
      ]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it("rejects an ungrounded booking opportunity as an unsupported source", async () => {
    const badCase = fixture.booking.negative.find((candidate) => candidate.name === "Ungrounded Venue")!;
    const chunkStore = buildEvalChunkStore("booking", [goldenContext]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ opportunities: [badCase.opportunity] });

    const result = await runBookingAiWorkflow(buildBookingInput(), { chunkStore, embeddingProvider, callModel });

    const report: EvalCaseReport = {
      caseName: badCase.name,
      checks: [checkNotAccepted(result.opportunities.map((opportunity) => opportunity.name), badCase.name)]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it("rejects a generic-rock booking opportunity as genre-incompatible with pop punk", async () => {
    const badCase = fixture.booking.negative.find((candidate) => candidate.name === "Generic Rock Bar")!;
    const chunkStore = buildEvalChunkStore("booking", [goldenContext]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ opportunities: [badCase.opportunity] });

    const result = await runBookingAiWorkflow(buildBookingInput(), { chunkStore, embeddingProvider, callModel });

    const report: EvalCaseReport = {
      caseName: badCase.name,
      checks: [checkNotAccepted(result.opportunities.map((opportunity) => opportunity.name), badCase.name)]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it("never invents a contact that is not present in the retrieved context", async () => {
    const contactCase = fixture.booking.contactSafety[0];
    const chunkStore = buildEvalChunkStore("booking", [contactCase.context]);
    const embeddingProvider = buildEvalEmbeddingProvider();
    const callModel = async () => JSON.stringify({ opportunities: [contactCase.opportunity] });

    const result = await runBookingAiWorkflow(buildBookingInput(), { chunkStore, embeddingProvider, callModel });
    const accepted = result.opportunities.find((opportunity) => opportunity.name === contactCase.name);

    const report: EvalCaseReport = {
      caseName: `${contactCase.name} (contact safety)`,
      checks: [checkNoInventedContact(accepted?.contact ?? null, accepted?.evidence ?? [])]
    };
    reports.push(report);

    expect(reportPassed(report)).toBe(true);
  });

  it.skipIf(process.env.EVAL_LIVE !== "true")(
    "[live] runs the real OpenAI model against the golden case (EVAL_LIVE=true only)",
    async () => {
      const goldenCase = fixture.booking.positive[0];
      const chunkStore = buildEvalChunkStore("booking", [goldenCase.context]);
      const embeddingProvider = buildEvalEmbeddingProvider();

      const result = await runBookingAiWorkflow(buildBookingInput(), { chunkStore, embeddingProvider });

      expect(result.opportunities.length).toBeGreaterThan(0);
    }
  );
});
