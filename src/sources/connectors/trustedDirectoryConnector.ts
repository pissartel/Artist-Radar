import { TRUSTED_ORGANIZATION_SEEDS, type TrustedOrganizationSeed } from "../config/trustedOrganizations.js";
import { parseOrganizationSourceRecord, type OrganizationSourceRecord } from "../organization.schema.js";

const TRUSTED_DIRECTORY_RELIABILITY = 0.9;

export function importTrustedDirectoryOrganizations(
  seeds: TrustedOrganizationSeed[] = TRUSTED_ORGANIZATION_SEEDS
): OrganizationSourceRecord[] {
  return seeds.map((seed) =>
    parseOrganizationSourceRecord({
      sourceType: "trusted_directory",
      sourceName: seed.name,
      sourceUrl: seed.sourceUrl,
      extractedAt: new Date().toISOString(),
      reliabilityScore: TRUSTED_DIRECTORY_RELIABILITY,
      name: seed.name,
      organizationType: seed.organizationType,
      city: seed.city ?? null,
      country: seed.country ?? null,
      websiteUrl: seed.websiteUrl ?? seed.sourceUrl,
      contactEmail: seed.contactEmail ?? null,
      contactFormUrl: seed.contactFormUrl ?? null,
      notes: seed.notes ?? null
    })
  );
}
