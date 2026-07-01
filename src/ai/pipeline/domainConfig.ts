import type { AiDomainPipelineConfig, AiResearchDomain } from "./types.js";

/**
 * Registry mapping each AI research domain to the pipeline config that
 * implements it. Lets commands look up a domain's pipeline without
 * importing every domain implementation module directly.
 */
const domainPipelineRegistry = new Map<AiResearchDomain, AiDomainPipelineConfig<unknown, unknown, unknown, unknown>>();

export function registerAiDomainPipeline<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>(
  config: AiDomainPipelineConfig<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>
): void {
  domainPipelineRegistry.set(
    config.domain,
    config as AiDomainPipelineConfig<unknown, unknown, unknown, unknown>
  );
}

export function getAiDomainPipeline<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>(
  domain: AiResearchDomain
): AiDomainPipelineConfig<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult> {
  const config = domainPipelineRegistry.get(domain);
  if (!config) {
    throw new Error(
      `No AI pipeline is registered for domain "${domain}". Register one with registerAiDomainPipeline() before running it.`
    );
  }

  return config as AiDomainPipelineConfig<TRawOutput, TValidatedOutput, TScoredOutput, TFinalResult>;
}

export function hasAiDomainPipeline(domain: AiResearchDomain): boolean {
  return domainPipelineRegistry.has(domain);
}

/** Test-only helper to reset the registry between unit tests. */
export function clearAiDomainPipelines(): void {
  domainPipelineRegistry.clear();
}
