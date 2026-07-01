import { z } from "zod";

export const KnowledgeDomainSchema = z.enum(["booking", "similar-artists", "promotion", "mix-analysis"]);

export const KnowledgeSourceTypeSchema = z.enum([
  "artist",
  "venue",
  "agenda",
  "festival",
  "playlist",
  "blog",
  "promoter",
  "producer",
  "studio",
  "unknown"
]);

export const KnowledgeDocumentSchema = z.object({
  id: z.string().trim().min(1),
  domain: KnowledgeDomainSchema,
  sourceName: z.string().trim().min(1),
  sourceType: KnowledgeSourceTypeSchema,
  url: z.string().trim().url(),
  title: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  city: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  genres: z.array(z.string().trim().min(1)).optional(),
  fetchedAt: z.string().trim().min(1)
});

export type KnowledgeDomain = z.infer<typeof KnowledgeDomainSchema>;
export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceTypeSchema>;
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export function parseKnowledgeDocument(input: unknown): KnowledgeDocument {
  return KnowledgeDocumentSchema.parse(input);
}
