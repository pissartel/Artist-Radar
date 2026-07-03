import { z } from "zod";

/**
 * Raw AI output schema for a single judge verdict (issue #48). The judge
 * explains/validates a deterministic score; it never produces a score of
 * its own, so no numeric score field exists here.
 */
export const AiJudgeVerdictSchema = z.object({
  itemName: z.string().trim().min(1),
  relevance: z.enum(["high", "medium", "low"]),
  realism: z.enum(["realistic", "questionable", "unrealistic"]),
  missingEvidence: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string().trim().min(1)).default([]),
  recommendedNextAction: z.string().trim().min(1),
  explanation: z.string().trim().min(1)
});

export type AiJudgeVerdict = z.infer<typeof AiJudgeVerdictSchema>;

export const AiJudgeResponseSchema = z.object({
  verdicts: z.array(AiJudgeVerdictSchema)
});

export type AiJudgeResponse = z.infer<typeof AiJudgeResponseSchema>;
