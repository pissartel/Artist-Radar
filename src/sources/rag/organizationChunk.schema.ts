import { z } from "zod";
import { OrganizationEntityTypeSchema } from "../organization.schema.js";

// Indexed, citable slice of a single organization source record (issue #127).
// Every chunk keeps the metadata needed to filter before/alongside vector
// retrieval and to trace a claim back to the exact source it came from.
export const OrganizationChunkSchema = z.object({
  id: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  organizationName: z.string().trim().min(1),
  opportunityType: OrganizationEntityTypeSchema,
  country: z.string().trim().min(1).nullable(),
  city: z.string().trim().min(1).nullable(),
  genres: z.array(z.string().trim().min(1)).default([]),
  sourceDomain: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  lastVerifiedAt: z.string().trim().min(1),
  confidenceScore: z.number().min(0).max(1),
  text: z.string().trim().min(1),
  embedding: z.array(z.number()).optional(),
  createdAt: z.string().trim().min(1)
});

export type OrganizationChunk = z.infer<typeof OrganizationChunkSchema>;

export function parseOrganizationChunk(input: unknown): OrganizationChunk {
  return OrganizationChunkSchema.parse(input);
}
