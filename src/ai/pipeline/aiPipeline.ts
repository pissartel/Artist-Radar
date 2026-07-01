import type {
  AiDomainPipelineConfig,
  AiNormalizedDocument,
  AiPipelineInput,
  AiPipelineResult
} from "./types.js";

/**
 * Runs the shared AI pipeline for a domain-specific config: collect sources,
 * normalize them, retrieve context, build the prompt, call the model,
 * validate the output, score it, and format the final result.
 *
 * The orchestration logic is identical for every domain; only the stage
 * implementations in `config.stages` differ.
 */
export async function runAiPipeline<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>(
  input: AiPipelineInput,
  config: AiDomainPipelineConfig<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>
): Promise<AiPipelineResult<TFinalResult>> {
  if (config.domain !== input.domain) {
    throw new Error(
      `AI pipeline domain mismatch: config is registered for "${config.domain}" but input requested "${input.domain}".`
    );
  }

  const { stages } = config;

  const sourceDocuments = await stages.collectSources(input);
  const normalizedDocuments = await stages.normalizeDocuments(sourceDocuments, input);
  const context = await stages.retrieveContext(normalizedDocuments, input);
  const prompt = await stages.buildPrompt(context, input);
  const rawOutput = await stages.callModel(prompt, input);
  const validatedOutput = await stages.validateOutput(rawOutput, input);
  const scoredOutput = await stages.scoreResults(validatedOutput, context, input);
  const finalResult = await stages.formatResult(scoredOutput, context, input);

  return {
    domain: input.domain,
    result: finalResult,
    sourcesUsed: collectSourceUrls(normalizedDocuments),
    warnings: [...context.notes],
    generatedAt: new Date().toISOString()
  };
}

function collectSourceUrls(documents: AiNormalizedDocument[]): string[] {
  const urls = documents.map((document) => document.sourceUrl).filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}
