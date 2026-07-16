import type { DocumentStore } from "../knowledge/documentStore.js";
import { debugLog, warnLog } from "../utils/logger.js";
import { importInternalVenueEventOrganizations } from "./connectors/internalVenueEventConnector.js";
import { importTrustedDirectoryOrganizations } from "./connectors/trustedDirectoryConnector.js";
import { searchMusicBrainzLabelsByName } from "./connectors/musicBrainzLabelConnector.js";
import { searchWikidataOrganizationsByName } from "./connectors/wikidataOrganizationConnector.js";
import type { TrustedOrganizationSeed } from "./config/trustedOrganizations.js";
import type { NewOrganizationSourceRecord } from "./organization.schema.js";
import type { OrganizationStore } from "./organizationStore.js";

export interface OrganizationImportOptions {
  store: OrganizationStore;
  musicBrainzLabelQueries?: string[];
  wikidataQueries?: string[];
  documentStore?: DocumentStore;
  trustedOrganizationSeeds?: TrustedOrganizationSeed[];
  env?: { APP_USER_AGENT?: string };
  fetchImpl?: typeof fetch;
}

export interface OrganizationImportSummary {
  organizationsImported: number;
  sourceRecordsFetched: number;
  warnings: string[];
}

export async function runOrganizationImport(options: OrganizationImportOptions): Promise<OrganizationImportSummary> {
  const warnings: string[] = [];
  const records: NewOrganizationSourceRecord[] = [];

  for (const query of options.musicBrainzLabelQueries ?? []) {
    try {
      const found = await searchMusicBrainzLabelsByName(query, options.env, options.fetchImpl);
      records.push(...found);
    } catch (error) {
      warnings.push(`MusicBrainz label import failed for "${query}": ${errorMessage(error)}`);
    }
  }

  for (const query of options.wikidataQueries ?? []) {
    try {
      const found = await searchWikidataOrganizationsByName(query, options.fetchImpl);
      records.push(...found);
    } catch (error) {
      warnings.push(`Wikidata import failed for "${query}": ${errorMessage(error)}`);
    }
  }

  if (options.documentStore) {
    try {
      const found = await importInternalVenueEventOrganizations(options.documentStore);
      records.push(...found);
    } catch (error) {
      warnings.push(`Internal venue/event import failed: ${errorMessage(error)}`);
    }
  }

  try {
    records.push(...importTrustedDirectoryOrganizations(options.trustedOrganizationSeeds));
  } catch (error) {
    warnings.push(`Trusted directory import failed: ${errorMessage(error)}`);
  }

  debugLog("sources", "organization import fetched records", { count: records.length });

  const merged = await options.store.upsertMany(records);

  if (warnings.length > 0) {
    warnLog("sources", "organization import completed with warnings", { warningCount: warnings.length });
  }

  return {
    organizationsImported: merged.length,
    sourceRecordsFetched: records.length,
    warnings
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
