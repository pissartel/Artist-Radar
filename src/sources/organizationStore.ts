import type { MergedOrganization, NewOrganizationSourceRecord, OrganizationFilter } from "./organization.schema.js";

export interface OrganizationStore {
  upsertMany(records: NewOrganizationSourceRecord[]): Promise<MergedOrganization[]>;
  list(filter?: OrganizationFilter): Promise<MergedOrganization[]>;
  findByDedupeKey(name: string, city: string | null, country: string | null): Promise<MergedOrganization | null>;
}
