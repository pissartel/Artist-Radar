import { z } from "zod";
import { ORGANIZATION_OPPORTUNITY_TYPES, OptionalUrlSchema } from "../schemas.js";

export const OrganizationEntityTypeSchema = z.enum(ORGANIZATION_OPPORTUNITY_TYPES);
export type OrganizationEntityType = z.infer<typeof OrganizationEntityTypeSchema>;

export const OrganizationSourceTypeSchema = z.enum([
  "musicbrainz",
  "wikidata",
  "internal_venue",
  "internal_event",
  "trusted_directory"
]);
export type OrganizationSourceType = z.infer<typeof OrganizationSourceTypeSchema>;

export const OrganizationReliabilityScoreSchema = z.number().min(0).max(1);

// One organization's contribution from a single source, kept verbatim so
// conflicting values across sources stay attributable (issue #125).
export const OrganizationSourceRecordSchema = z.object({
  sourceType: OrganizationSourceTypeSchema,
  sourceName: z.string().trim().min(1),
  // Every imported organization must carry its originating URL.
  sourceUrl: z.string().trim().url(),
  extractedAt: z.string().trim().min(1),
  reliabilityScore: OrganizationReliabilityScoreSchema,
  name: z.string().trim().min(1),
  organizationType: OrganizationEntityTypeSchema,
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  websiteUrl: OptionalUrlSchema,
  // Public contact information only; null means "uncertain", never fabricated.
  contactEmail: z.string().trim().email().nullable(),
  contactFormUrl: OptionalUrlSchema,
  // Related organizations surfaced by the source (e.g. MusicBrainz label
  // relationships such as parent/subsidiary labels).
  relatedOrganizations: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().min(1).nullable().optional()
});
export type OrganizationSourceRecord = z.infer<typeof OrganizationSourceRecordSchema>;
export type NewOrganizationSourceRecord = Omit<OrganizationSourceRecord, "extractedAt" | "relatedOrganizations"> & {
  extractedAt?: string;
  relatedOrganizations?: string[];
};

// Merged, deduplicated organization as stored before RAG ingestion. Canonical
// fields are picked from the highest-reliability contributing source, while
// `sources` retains every source's raw values for attribution.
export const MergedOrganizationSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  organizationType: OrganizationEntityTypeSchema,
  city: z.string().trim().min(1).nullable(),
  country: z.string().trim().min(1).nullable(),
  websiteUrl: OptionalUrlSchema,
  contactEmail: z.string().trim().email().nullable(),
  contactFormUrl: OptionalUrlSchema,
  sources: z.array(OrganizationSourceRecordSchema).min(1),
  mergedAt: z.string().trim().min(1)
});
export type MergedOrganization = z.infer<typeof MergedOrganizationSchema>;

export interface OrganizationFilter {
  organizationType?: OrganizationEntityType;
  city?: string;
  country?: string;
}

export function parseOrganizationSourceRecord(input: unknown): OrganizationSourceRecord {
  return OrganizationSourceRecordSchema.parse(input);
}

export function parseMergedOrganization(input: unknown): MergedOrganization {
  return MergedOrganizationSchema.parse(input);
}
