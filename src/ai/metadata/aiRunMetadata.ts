import type { AiResearchDomain } from "../pipeline/types.js";

/** Bumped whenever the shared AI pipeline orchestration (collect/retrieve/prompt/score/format) changes. */
export const AI_PIPELINE_VERSION = "1.0.0";

/**
 * Debug metadata recorded for every AI run (issue #50), so a bad result can be
 * traced back to its source collection, retrieval, prompt, model, validation
 * or scoring stage. Safe to include in normal outputs: it never carries raw
 * prompts, API keys or other secrets.
 */
export interface AiRunMetadata {
  domain: AiResearchDomain;
  model: string;
  embeddingModel?: string;
  promptVersion: string;
  pipelineVersion: string;
  retrievalQuery?: string;
  retrievedChunkCount?: number;
  sourcesUsed: string[];
  warnings: string[];
  generatedAt: string;
}

export type CreateAiRunMetadataInput = Omit<AiRunMetadata, "generatedAt">;

export function createAiRunMetadata(input: CreateAiRunMetadataInput): AiRunMetadata {
  return {
    ...input,
    generatedAt: new Date().toISOString()
  };
}
