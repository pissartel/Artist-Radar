import type { AiPromptPayload } from "../pipeline/types.js";

export interface JudgePromptEvidence {
  source: string;
  sourceUrl: string | null;
  snippet: string | null;
}

export interface JudgePromptItem {
  name: string;
  deterministicScore: number;
  reason: string;
  evidence: JudgePromptEvidence[];
}

export interface BuildJudgePromptInput {
  domain: "booking" | "similar-artists";
  artistName: string;
  genre: string;
  items: JudgePromptItem[];
}

const JUDGE_OUTPUT_SHAPE = {
  verdicts: [
    {
      itemName: "string (must exactly match one of the given item names)",
      relevance: "high | medium | low",
      realism: "realistic | questionable | unrealistic",
      missingEvidence: ["string"],
      risks: ["string"],
      recommendedNextAction: "string",
      explanation: "string"
    }
  ]
};

/**
 * Builds the system/user prompt pair for the optional AI judge pass
 * (issue #48). The judge is a quality-control reviewer over an
 * already-computed deterministic score; it explains and validates that
 * score, it does not replace it or search for new sources.
 */
export function buildJudgePrompt(input: BuildJudgePromptInput): AiPromptPayload {
  const domainLabel = input.domain === "booking" ? "booking opportunities" : "similar artist suggestions";

  const systemPrompt = [
    `You are Artist Radar's AI judge, a strict quality-control reviewer for ${domainLabel}.`,
    "Every item you review already has a deterministic relevance score computed in code. You do not change or replace that score.",
    "Your job is to evaluate relevance, realism, missing evidence, risks, and a recommended next action for each item, using only the reason and evidence text given to you.",
    "Do not invent new sources, venues, artists, contacts, or URLs. Do not search for information beyond what is provided.",
    "Every verdict's itemName must exactly match one of the given item names. Do not add or omit items.",
    "Return strict JSON only, matching the requested shape exactly."
  ].join("\n");

  const userPrompt = [
    "Context:",
    `- Artist: ${input.artistName}`,
    `- Genre: ${input.genre}`,
    "",
    `Items to review (${input.items.length}):`,
    ...input.items.flatMap((item, index) => [
      "",
      `[Item ${index + 1}]`,
      `Name: ${item.name}`,
      `Deterministic score: ${item.deterministicScore}/100`,
      `Reason: ${item.reason}`,
      item.evidence.length > 0
        ? "Evidence:"
        : "Evidence: none provided",
      ...item.evidence.map(
        (evidence) => `- ${evidence.source} (${evidence.sourceUrl ?? "no URL"}): ${evidence.snippet ?? "no snippet"}`
      )
    ]),
    "",
    "Return only JSON with this shape:",
    JSON.stringify(JUDGE_OUTPUT_SHAPE, null, 2)
  ].join("\n");

  return { systemPrompt, userPrompt };
}
