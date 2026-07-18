import type { OrganizationEntityType } from "../organization.schema.js";

// Structured metadata filters (issue #127) applied before/alongside vector
// retrieval, so results are scoped to a relevant candidate pool up front.
export interface OrganizationChunkFilter {
  organizationId?: string;
  opportunityType?: OrganizationEntityType;
  country?: string;
  city?: string;
  genre?: string;
  sourceDomain?: string;
  verifiedAfter?: string;
  minConfidenceScore?: number;
}
