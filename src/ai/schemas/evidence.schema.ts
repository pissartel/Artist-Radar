import { z } from "zod";

/**
 * Shared evidence schema used by every AI output schema. An AI result is
 * only as trustworthy as the sources it cites, so every domain schema
 * (booking, similar artists, and future domains) embeds an `evidence[]`
 * field built from this shape instead of inventing its own.
 */
export const AiEvidenceSchema = z.object({
  source: z.string().trim().min(1),
  sourceUrl: z.string().trim().url().nullable(),
  snippet: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export type AiEvidence = z.infer<typeof AiEvidenceSchema>;
