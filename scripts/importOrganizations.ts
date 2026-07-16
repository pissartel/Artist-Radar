import "dotenv/config";
import { LocalDocumentStore } from "../src/knowledge/localDocumentStore.js";
import { LocalOrganizationStore } from "../src/sources/localOrganizationStore.js";
import { runOrganizationImport } from "../src/sources/importOrganizations.js";

async function main(): Promise<void> {
  const musicBrainzLabelQueries = (process.env.MUSICBRAINZ_LABEL_QUERIES ?? "")
    .split(",")
    .map((query) => query.trim())
    .filter(Boolean);

  const wikidataQueries = (process.env.WIKIDATA_ORGANIZATION_QUERIES ?? "")
    .split(",")
    .map((query) => query.trim())
    .filter(Boolean);

  const summary = await runOrganizationImport({
    store: new LocalOrganizationStore(),
    documentStore: new LocalDocumentStore(),
    musicBrainzLabelQueries,
    wikidataQueries
  });

  console.log(
    `Organization import complete: ${summary.organizationsImported} organization(s) from ${summary.sourceRecordsFetched} source record(s).`
  );
  if (summary.warnings.length > 0) {
    console.warn(`Warnings (${summary.warnings.length}):`);
    for (const warning of summary.warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Organization import failed: ${message}`);
  process.exitCode = 1;
});
