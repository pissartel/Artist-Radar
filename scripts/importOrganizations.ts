import "dotenv/config";
import { LocalDocumentStore } from "../src/knowledge/localDocumentStore.js";
import { buildDefaultWebExtractProvider, buildDefaultWebSearchProvider } from "../src/providers/web/providers.js";
import { LocalOrganizationStore } from "../src/sources/localOrganizationStore.js";
import { runOrganizationImport } from "../src/sources/importOrganizations.js";

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const musicBrainzLabelQueries = splitList(process.env.MUSICBRAINZ_LABEL_QUERIES);
  const wikidataQueries = splitList(process.env.WIKIDATA_ORGANIZATION_QUERIES);

  const discoveryGenres = splitList(process.env.DISCOVERY_GENRES);
  const discoveryTargetCities = splitList(process.env.DISCOVERY_TARGET_CITIES);
  const discoverySimilarArtists = splitList(process.env.DISCOVERY_SIMILAR_ARTISTS);
  const discoveryKnownOrganizationNames = splitList(process.env.DISCOVERY_KNOWN_ORGANIZATION_NAMES);

  const hasDiscoveryInput =
    discoveryGenres.length > 0 ||
    discoveryTargetCities.length > 0 ||
    discoverySimilarArtists.length > 0 ||
    discoveryKnownOrganizationNames.length > 0;

  const summary = await runOrganizationImport({
    store: new LocalOrganizationStore(),
    documentStore: new LocalDocumentStore(),
    musicBrainzLabelQueries,
    wikidataQueries,
    ...(hasDiscoveryInput
      ? {
          webDiscoveryContext: {
            genres: discoveryGenres,
            artistCity: process.env.DISCOVERY_ARTIST_CITY ?? null,
            artistCountry: process.env.DISCOVERY_ARTIST_COUNTRY ?? null,
            targetCities: discoveryTargetCities,
            similarArtistNames: discoverySimilarArtists,
            knownOrganizationNames: discoveryKnownOrganizationNames
          },
          webSearchProvider: buildDefaultWebSearchProvider(),
          webExtractProvider: buildDefaultWebExtractProvider()
        }
      : {})
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
