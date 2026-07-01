import { beforeEach, describe, expect, it } from "vitest";
import { runAiPipeline } from "../src/ai/pipeline/aiPipeline.js";
import {
  clearAiDomainPipelines,
  getAiDomainPipeline,
  hasAiDomainPipeline,
  registerAiDomainPipeline
} from "../src/ai/pipeline/domainConfig.js";
import type {
  AiDomainPipelineConfig,
  AiNormalizedDocument,
  AiPipelineInput,
  AiPromptPayload,
  AiRetrievedContext,
  AiSourceDocument
} from "../src/ai/pipeline/types.js";

const input: AiPipelineInput = {
  domain: "booking",
  artistName: "Fake Band",
  genre: "metalcore",
  city: "Lyon"
};

function buildStagesRecordingCalls(calls: string[]): AiDomainPipelineConfig<
  { raw: true },
  { validated: true },
  { scored: true },
  { formatted: true }
> {
  const sourceDocuments: AiSourceDocument[] = [
    { id: "doc-1", sourceUrl: "https://example.com/a", content: "raw content a" },
    { id: "doc-2", sourceUrl: "https://example.com/a", content: "raw content a duplicate host" },
    { id: "doc-3", sourceUrl: null, content: "raw content without url" }
  ];
  const normalizedDocuments: AiNormalizedDocument[] = sourceDocuments.map((document) => ({
    id: document.id,
    sourceUrl: document.sourceUrl,
    text: document.content.toUpperCase()
  }));
  const context: AiRetrievedContext = { documents: normalizedDocuments, notes: ["low confidence source"] };
  const prompt: AiPromptPayload = { systemPrompt: "system", userPrompt: "user" };

  return {
    domain: "booking",
    stages: {
      collectSources: async (receivedInput) => {
        calls.push("collectSources");
        expect(receivedInput).toBe(input);
        return sourceDocuments;
      },
      normalizeDocuments: async (documents) => {
        calls.push("normalizeDocuments");
        expect(documents).toBe(sourceDocuments);
        return normalizedDocuments;
      },
      retrieveContext: async (documents) => {
        calls.push("retrieveContext");
        expect(documents).toBe(normalizedDocuments);
        return context;
      },
      buildPrompt: async (receivedContext) => {
        calls.push("buildPrompt");
        expect(receivedContext).toBe(context);
        return prompt;
      },
      callModel: async (receivedPrompt) => {
        calls.push("callModel");
        expect(receivedPrompt).toBe(prompt);
        return { raw: true };
      },
      validateOutput: async (rawOutput) => {
        calls.push("validateOutput");
        expect(rawOutput).toEqual({ raw: true });
        return { validated: true };
      },
      scoreResults: async (validatedOutput) => {
        calls.push("scoreResults");
        expect(validatedOutput).toEqual({ validated: true });
        return { scored: true };
      },
      formatResult: async (scoredOutput) => {
        calls.push("formatResult");
        expect(scoredOutput).toEqual({ scored: true });
        return { formatted: true };
      }
    }
  };
}

describe("runAiPipeline", () => {
  it("runs every stage in order and assembles the pipeline result", async () => {
    const calls: string[] = [];
    const config = buildStagesRecordingCalls(calls);

    const result = await runAiPipeline(input, config);

    expect(calls).toEqual([
      "collectSources",
      "normalizeDocuments",
      "retrieveContext",
      "buildPrompt",
      "callModel",
      "validateOutput",
      "scoreResults",
      "formatResult"
    ]);
    expect(result.domain).toBe("booking");
    expect(result.result).toEqual({ formatted: true });
    expect(result.warnings).toEqual(["low confidence source"]);
    expect(result.sourcesUsed).toEqual(["https://example.com/a"]);
    expect(() => new Date(result.generatedAt).toISOString()).not.toThrow();
  });

  it("throws when the config domain does not match the input domain", async () => {
    const calls: string[] = [];
    const config = buildStagesRecordingCalls(calls);

    await expect(runAiPipeline({ ...input, domain: "similar-artists" }, config)).rejects.toThrow(
      /domain mismatch/i
    );
    expect(calls).toEqual([]);
  });
});

describe("AI domain pipeline registry", () => {
  beforeEach(() => {
    clearAiDomainPipelines();
  });

  it("registers and retrieves a config by domain", () => {
    const config = buildStagesRecordingCalls([]);

    expect(hasAiDomainPipeline("booking")).toBe(false);
    registerAiDomainPipeline(config);
    expect(hasAiDomainPipeline("booking")).toBe(true);
    expect(getAiDomainPipeline("booking")).toBe(config);
  });

  it("throws a clear error when no config is registered for a domain", () => {
    expect(() => getAiDomainPipeline("mix-analysis")).toThrow(/no ai pipeline is registered/i);
  });
});
