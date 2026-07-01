/**
 * Shared AI pipeline types.
 *
 * Every AI-powered research feature (booking, similar artists, promotion,
 * mix analysis, ...) plugs into the same pipeline by providing an
 * `AiDomainPipelineConfig`. The pipeline itself stays domain-agnostic; each
 * domain only supplies the stage implementations relevant to it.
 */

/** Identifies which AI research feature a pipeline run belongs to. */
export type AiResearchDomain = "booking" | "similar-artists" | "promotion" | "mix-analysis";

/** Input shared by every AI research domain. */
export interface AiPipelineInput {
  domain: AiResearchDomain;
  artistName: string;
  genre?: string;
  city?: string;
  target?: string;
  links?: string[];
}

/** Final, domain-agnostic envelope returned by every pipeline run. */
export interface AiPipelineResult<TResult> {
  domain: AiResearchDomain;
  result: TResult;
  sourcesUsed: string[];
  warnings: string[];
  generatedAt: string;
}

/** A raw piece of source material collected before normalization (e.g. a scraped page). */
export interface AiSourceDocument {
  id: string;
  sourceUrl: string | null;
  content: string;
}

/** A source document reduced to clean, LLM-ready text. */
export interface AiNormalizedDocument {
  id: string;
  sourceUrl: string | null;
  text: string;
}

/** The subset of normalized documents and notes selected as prompt context. */
export interface AiRetrievedContext {
  documents: AiNormalizedDocument[];
  notes: string[];
}

/** The system/user prompt pair sent to the model. */
export interface AiPromptPayload {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * The eight pipeline stages every domain must implement:
 * collect sources, normalize documents, retrieve context, build the prompt,
 * call the model, validate its output, score the validated output, and
 * format the final result.
 *
 * Stages may be sync or async; the orchestrator awaits every stage.
 */
export interface AiPipelineStages<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult> {
  collectSources(input: AiPipelineInput): Promise<AiSourceDocument[]> | AiSourceDocument[];
  normalizeDocuments(
    documents: AiSourceDocument[],
    input: AiPipelineInput
  ): Promise<AiNormalizedDocument[]> | AiNormalizedDocument[];
  retrieveContext(
    documents: AiNormalizedDocument[],
    input: AiPipelineInput
  ): Promise<AiRetrievedContext> | AiRetrievedContext;
  buildPrompt(context: AiRetrievedContext, input: AiPipelineInput): Promise<AiPromptPayload> | AiPromptPayload;
  callModel(prompt: AiPromptPayload, input: AiPipelineInput): Promise<TRawOutput> | TRawOutput;
  validateOutput(rawOutput: TRawOutput, input: AiPipelineInput): Promise<TValidatedOutput> | TValidatedOutput;
  scoreResults(
    validatedOutput: TValidatedOutput,
    context: AiRetrievedContext,
    input: AiPipelineInput
  ): Promise<TScoredOutput> | TScoredOutput;
  formatResult(
    scoredOutput: TScoredOutput,
    context: AiRetrievedContext,
    input: AiPipelineInput
  ): Promise<TFinalResult> | TFinalResult;
}

/** Binds a research domain to the stage implementations it plugs into the shared pipeline. */
export interface AiDomainPipelineConfig<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult> {
  domain: AiResearchDomain;
  stages: AiPipelineStages<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>;
}
