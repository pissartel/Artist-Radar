import { z } from "zod";
import { IndustryContactSchema, IndustryOrganizationTypeSchema } from "./types.js";

export const IndustryExtractionResultSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(1), type: IndustryOrganizationTypeSchema,
    country: z.string().trim().min(1).nullable().optional(), city: z.string().trim().min(1).nullable().optional(),
    website: z.string().url().nullable().optional(), genres: z.array(z.string().trim().min(1)).default([])
  }).nullable().optional(),
  roster: z.array(z.object({ artistName: z.string().trim().min(1), relationship: z.enum(["booking", "management", "label", "unknown"]), sourceUrl: z.string().url() })).default([]),
  contacts: z.array(IndustryContactSchema).default([]),
  submissionUrl: z.string().url().nullable().optional(),
  evidence: z.array(z.object({ statement: z.string().trim().min(1), sourceUrl: z.string().url() })).min(1)
});
export type IndustryExtractionResult = z.infer<typeof IndustryExtractionResultSchema>;
