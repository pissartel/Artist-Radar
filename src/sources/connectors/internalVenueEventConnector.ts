import type { DocumentStore } from "../../knowledge/documentStore.js";
import type { KnowledgeSourceType } from "../../knowledge/knowledgeDocument.schema.js";
import { parseOrganizationSourceRecord, type OrganizationEntityType, type OrganizationSourceRecord } from "../organization.schema.js";

const INTERNAL_VENUE_RELIABILITY = 0.85;

const ORGANIZATION_TYPE_BY_SOURCE_TYPE: Partial<Record<KnowledgeSourceType, OrganizationEntityType>> = {
  venue: "VENUE",
  festival: "PROMOTER",
  promoter: "PROMOTER"
};

// Reuses the existing internal venue/event knowledge documents (booking
// pipeline) as a first-party organization source, per issue #125.
export async function importInternalVenueEventOrganizations(
  documentStore: DocumentStore
): Promise<OrganizationSourceRecord[]> {
  const documents = await documentStore.list({ domain: "booking" });

  const records: OrganizationSourceRecord[] = [];
  for (const document of documents) {
    const organizationType = ORGANIZATION_TYPE_BY_SOURCE_TYPE[document.sourceType];
    if (!organizationType) {
      continue;
    }

    records.push(
      parseOrganizationSourceRecord({
        sourceType: document.sourceType === "venue" ? "internal_venue" : "internal_event",
        sourceName: document.sourceName,
        sourceUrl: document.url,
        extractedAt: new Date().toISOString(),
        reliabilityScore: INTERNAL_VENUE_RELIABILITY,
        name: document.sourceName,
        organizationType,
        city: document.city ?? null,
        country: document.country ?? null,
        websiteUrl: document.url,
        contactEmail: null,
        contactFormUrl: null,
        notes: null
      })
    );
  }

  return records;
}
