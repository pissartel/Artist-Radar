import OpenAI from "openai";
import type { AiPromptPayload } from "../pipeline/types.js";
import { buildJudgePrompt, type BuildJudgePromptInput } from "../prompts/judge.prompt.js";
import { AiJudgeResponseSchema, type AiJudgeVerdict } from "../schemas/judge.schema.js";
import { parseAndValidateAiJson } from "../validation/validateAiOutput.js";

export interface AiJudgeDeps {
  callModel?: (prompt: AiPromptPayload) => Promise<string>;
  openaiClient?: OpenAI;
  model?: string;
  /** Overrides the ENABLE_AI_JUDGE env flag; primarily for tests. */
  enabled?: boolean;
}

export type RunAiJudgeInput = BuildJudgePromptInput;

export interface AiJudgeRunResult {
  enabled: boolean;
  verdictsByItemName: Map<string, AiJudgeVerdict>;
  warnings: string[];
}

/** Reads the ENABLE_AI_JUDGE env flag (issue #48). Defaults to disabled to control API cost. */
export function isAiJudgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ENABLE_AI_JUDGE ?? "").trim().toLowerCase() === "true";
}

/**
 * Runs the optional AI judge pass over already deterministically-scored
 * items. The judge only explains/validates the deterministic score; it
 * never produces a score of its own and must not invent new items or
 * sources. Disabled by default (ENABLE_AI_JUDGE=false) to control API cost.
 */
export async function runAiJudge(input: RunAiJudgeInput, deps: AiJudgeDeps = {}): Promise<AiJudgeRunResult> {
  const enabled = deps.enabled ?? isAiJudgeEnabled();

  if (!enabled || input.items.length === 0) {
    return { enabled: false, verdictsByItemName: new Map(), warnings: [] };
  }

  const prompt = buildJudgePrompt(input);
  const callModel = deps.callModel ?? buildDefaultJudgeCallModel(deps);
  const rawContent = await callModel(prompt);

  const validation = parseAndValidateAiJson(AiJudgeResponseSchema, rawContent, { label: "AI judge output" });
  if (!validation.success || !validation.data) {
    return { enabled: true, verdictsByItemName: new Map(), warnings: validation.warnings };
  }

  const knownNames = new Set(input.items.map((item) => normalizeComparableName(item.name)));
  const warnings: string[] = [];
  const verdictsByItemName = new Map<string, AiJudgeVerdict>();

  for (const verdict of validation.data.verdicts) {
    const normalizedName = normalizeComparableName(verdict.itemName);
    if (!knownNames.has(normalizedName)) {
      warnings.push(`AI judge verdict for unknown item "${verdict.itemName}" was discarded (not part of the scored results).`);
      continue;
    }
    verdictsByItemName.set(normalizedName, verdict);
  }

  return { enabled: true, verdictsByItemName, warnings };
}

function buildDefaultJudgeCallModel(deps: AiJudgeDeps): (prompt: AiPromptPayload) => Promise<string> {
  return async (prompt) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!deps.openaiClient && !apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for the AI judge pass. Add it to .env, or inject a callModel/openaiClient dependency for testing."
      );
    }

    const client = deps.openaiClient ?? new OpenAI({ apiKey });
    const model = deps.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt.systemPrompt },
        { role: "user", content: prompt.userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response for the AI judge call.");
    }

    return content;
  };
}

export function normalizeComparableName(name: string): string {
  return name.trim().toLowerCase();
}

export type { AiJudgeVerdict };
