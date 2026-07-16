import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeOrganizationDedupeKey, mergeOrganizationSourceRecords, pickCanonicalOrganizationFields } from "./organizationDedupe.js";
import {
  parseMergedOrganization,
  parseOrganizationSourceRecord,
  type MergedOrganization,
  type NewOrganizationSourceRecord,
  type OrganizationFilter
} from "./organization.schema.js";
import type { OrganizationStore } from "./organizationStore.js";

export const DEFAULT_ORGANIZATION_STORE_PATH = path.join("outputs", "sources", "organizations.json");

export class LocalOrganizationStore implements OrganizationStore {
  constructor(private readonly filePath: string = DEFAULT_ORGANIZATION_STORE_PATH) {}

  async upsertMany(records: NewOrganizationSourceRecord[]): Promise<MergedOrganization[]> {
    const byKey = new Map(
      (await this.readAll()).map((organization) => [
        computeOrganizationDedupeKey(organization.name, organization.city, organization.country),
        organization
      ])
    );

    const touchedKeys = new Set<string>();
    for (const input of records) {
      const incoming = parseOrganizationSourceRecord({
        ...input,
        extractedAt: input.extractedAt ?? new Date().toISOString()
      });
      const key = computeOrganizationDedupeKey(incoming.name, incoming.city, incoming.country);
      const existing = byKey.get(key);
      const mergedSources = mergeOrganizationSourceRecords(existing?.sources ?? [], [incoming]);
      const canonical = pickCanonicalOrganizationFields(mergedSources);

      byKey.set(
        key,
        parseMergedOrganization({
          id: existing?.id ?? randomUUID(),
          ...canonical,
          sources: mergedSources,
          mergedAt: new Date().toISOString()
        })
      );
      touchedKeys.add(key);
    }

    await this.writeAll(Array.from(byKey.values()));
    return Array.from(byKey.entries())
      .filter(([key]) => touchedKeys.has(key))
      .map(([, organization]) => organization);
  }

  async list(filter: OrganizationFilter = {}): Promise<MergedOrganization[]> {
    const organizations = await this.readAll();
    return organizations.filter((organization) => matchesFilter(organization, filter));
  }

  async findByDedupeKey(name: string, city: string | null, country: string | null): Promise<MergedOrganization | null> {
    const key = computeOrganizationDedupeKey(name, city, country);
    const organizations = await this.readAll();
    return (
      organizations.find(
        (organization) => computeOrganizationDedupeKey(organization.name, organization.city, organization.country) === key
      ) ?? null
    );
  }

  private async readAll(): Promise<MergedOrganization[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => parseMergedOrganization(entry));
  }

  private async writeAll(organizations: MergedOrganization[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(organizations, null, 2), "utf8");
  }
}

function matchesFilter(organization: MergedOrganization, filter: OrganizationFilter): boolean {
  if (filter.organizationType && organization.organizationType !== filter.organizationType) {
    return false;
  }
  if (filter.city && organization.city !== filter.city) {
    return false;
  }
  if (filter.country && organization.country !== filter.country) {
    return false;
  }
  return true;
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}
