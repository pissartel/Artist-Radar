import type { OrganizationEntityType } from "../organization.schema.js";

export interface TrustedOrganizationSeed {
  name: string;
  organizationType: OrganizationEntityType;
  // The trusted directory or official organization website itself.
  sourceUrl: string;
  websiteUrl?: string;
  city?: string | null;
  country?: string | null;
  contactEmail?: string | null;
  contactFormUrl?: string | null;
  notes?: string;
}

// Configurable list of trusted public directories and official organization
// websites (issue #125). Populate only with manually verified entries —
// never infer sourceUrl or contact details from search-engine snippets.
export const TRUSTED_ORGANIZATION_SEEDS: TrustedOrganizationSeed[] = [];
