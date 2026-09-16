import { z } from "zod";
import type { GenericOpportunity, SimilarArtist } from "../schemas.js";

export const IndustryOrganizationTypeSchema = z.enum([
  "booker", "booking_agency", "promoter", "manager", "management_company", "label"
]);
export type IndustryOrganizationType = z.infer<typeof IndustryOrganizationTypeSchema>;

export const IndustrySourceSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1).nullable().optional(),
  sourceType: z.enum(["official", "artist", "musicbrainz", "industry", "directory", "web_search"]),
  confidence: z.number().min(0).max(1),
  lastVerifiedAt: z.string().datetime().nullable().optional()
});

export const IndustryContactSchema = z.object({
  name: z.string().trim().min(1).nullable().optional(),
  role: z.string().trim().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  publicProfileUrl: z.string().url().nullable().optional(),
  sourceUrl: z.string().url(),
  lastVerifiedAt: z.string().datetime().nullable().optional()
}).refine((value) => Boolean(value.email || value.publicProfileUrl), "a public contact method is required");

export const IndustryArtistRelationSchema = z.object({
  artistName: z.string().trim().min(1),
  artistExternalId: z.string().trim().min(1).nullable().optional(),
  spotifyId: z.string().trim().min(1).nullable().optional(),
  musicBrainzId: z.string().uuid().nullable().optional(),
  relationshipType: z.enum(["booking", "management", "label"]),
  active: z.boolean().nullable().optional(),
  sourceUrl: z.string().url(),
  firstSeenAt: z.string().datetime().nullable().optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
  lastVerifiedAt: z.string().datetime().nullable().optional()
});

export const IndustryOrganizationSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  normalizedName: z.string().trim().min(1),
  organizationType: IndustryOrganizationTypeSchema,
  country: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1).nullable().optional(),
  website: z.string().url().nullable().optional(),
  instagram: z.string().url().nullable().optional(),
  genres: z.array(z.string().trim().min(1)).default([]),
  submissionUrl: z.string().url().nullable().optional(),
  confidenceScore: z.number().min(0).max(1),
  contacts: z.array(IndustryContactSchema).default([]),
  artistRelations: z.array(IndustryArtistRelationSchema).default([]),
  sources: z.array(IndustrySourceSchema).min(1),
  firstSeenAt: z.string().datetime().nullable().optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
  lastVerifiedAt: z.string().datetime().nullable().optional()
});
export type IndustryOrganization = z.infer<typeof IndustryOrganizationSchema>;

export interface IndustrySearchContext {
  artistName: string;
  country: string | null;
  city: string | null;
  genres: string[];
  normalizedGenres: string[];
  careerStage: string | null;
  popularity: number | null;
  similarArtists: SimilarArtist[];
}

export interface IndustryKnowledgeRepository {
  search(context: IndustrySearchContext, limit: number): Promise<IndustryOrganization[]>;
  upsert(organizations: IndustryOrganization[]): Promise<IndustryOrganization[]>;
}

export interface IndustryDiscoveryResult {
  opportunities: GenericOpportunity[];
  organizations: IndustryOrganization[];
  source: "persistent" | "persistent_and_dynamic" | "dynamic";
  warnings: string[];
}
