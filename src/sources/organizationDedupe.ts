import type { MergedOrganization, OrganizationSourceRecord } from "./organization.schema.js";

export function computeOrganizationDedupeKey(
  name: string,
  city: string | null,
  country: string | null
): string {
  return [normalize(name), normalize(city ?? ""), normalize(country ?? "")].join("|");
}

export function mergeOrganizationSourceRecords(
  existing: OrganizationSourceRecord[],
  incoming: OrganizationSourceRecord[]
): OrganizationSourceRecord[] {
  const bySourceUrl = new Map(existing.map((record) => [record.sourceUrl, record]));
  for (const record of incoming) {
    bySourceUrl.set(record.sourceUrl, record);
  }
  return Array.from(bySourceUrl.values());
}

type CanonicalFields = Pick<
  MergedOrganization,
  "name" | "organizationType" | "city" | "country" | "websiteUrl" | "contactEmail" | "contactFormUrl"
>;

export function pickCanonicalOrganizationFields(sources: OrganizationSourceRecord[]): CanonicalFields {
  const ranked = [...sources].sort((a, b) => b.reliabilityScore - a.reliabilityScore);
  const primary = ranked[0];

  return {
    name: primary.name,
    organizationType: primary.organizationType,
    city: firstNonNull(ranked.map((record) => record.city)),
    country: firstNonNull(ranked.map((record) => record.country)),
    websiteUrl: firstNonNull(ranked.map((record) => record.websiteUrl ?? null)),
    contactEmail: firstNonNull(ranked.map((record) => record.contactEmail)),
    contactFormUrl: firstNonNull(ranked.map((record) => record.contactFormUrl ?? null))
  };
}

function firstNonNull<T>(values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
