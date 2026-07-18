import type { MergedOrganization, OrganizationEntityType } from "../organization.schema.js";
import type { RetrievedOrganizationContext } from "./retrieveOrganizationContext.js";

export interface OrganizationCitation {
  chunkId: string;
  sourceUrl: string;
  sourceDomain: string;
  claim: string;
  confidenceScore: number;
  lastVerifiedAt: string;
}

export interface OrganizationAnswer {
  organizationId: string;
  organizationName: string;
  opportunityType: OrganizationEntityType;
  contactEmail: string | null;
  contactFormUrl: string | null;
  websiteUrl: string | null;
  citations: OrganizationCitation[];
}

/**
 * Assembles a traceable answer for a single organization from retrieved
 * chunks: every claim keeps the source it came from (issue #127), and
 * contact details are copied verbatim from the verified structured
 * organization record rather than generated from retrieved text.
 */
export function buildOrganizationAnswer(
  organization: MergedOrganization,
  retrievedContext: RetrievedOrganizationContext[]
): OrganizationAnswer {
  const citations = retrievedContext
    .filter((chunk) => chunk.organizationId === organization.id)
    .map((chunk) => ({
      chunkId: chunk.chunkId,
      sourceUrl: chunk.sourceUrl,
      sourceDomain: chunk.sourceDomain,
      claim: chunk.text,
      confidenceScore: chunk.confidenceScore,
      lastVerifiedAt: chunk.lastVerifiedAt
    }));

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    opportunityType: organization.organizationType,
    contactEmail: organization.contactEmail,
    contactFormUrl: organization.contactFormUrl ?? null,
    websiteUrl: organization.websiteUrl ?? null,
    citations
  };
}
