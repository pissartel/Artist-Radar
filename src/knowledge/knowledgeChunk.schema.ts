import { z } from "zod";
import { KnowledgeDomainSchema, KnowledgeSourceTypeSchema } from "./knowledgeDocument.schema.js";

export const KnowledgeChunkSchema = z.object({
  id: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  domain: KnowledgeDomainSchema,
  sourceName: z.string().trim().min(1),
  sourceType: KnowledgeSourceTypeSchema,
  url: z.string().trim().url(),
  text: z.string().trim().min(1),
  embedding: z.array(z.number()).optional(),
  createdAt: z.string().trim().min(1)
});

export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

export function parseKnowledgeChunk(input: unknown): KnowledgeChunk {
  return KnowledgeChunkSchema.parse(input);
}
