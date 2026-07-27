import "dotenv/config";
import { Command } from "commander";
import {
  discoverSmacVenuesFromMinistryOfCultureDataset,
  filterSmacCandidatesByLocation,
  resolveCountryCodeFromLocationText
} from "../src/sources/index.js";
import type { LocationFilteredSmacCandidate } from "../src/sources/index.js";

interface CliOptions {
  location: string;
  radius: string;
  json?: boolean;
}

const program = new Command();

program
  .name("test-smac-discovery")
  .description("Inspect official French SMAC venue discovery independently of the full opportunity pipeline.")
  .requiredOption("--location <location>", "Selected search location, e.g. \"Bordeaux\" or \"France\"")
  .option("--radius <km>", "Search radius in kilometers", "100")
  .option("--json", "Print raw JSON instead of a readable list")
  .action(async (options: CliOptions) => {
    const location = options.location;
    const radiusKm = Number.parseFloat(options.radius);

    const countryCode = resolveCountryCodeFromLocationText(location);
    if (countryCode !== "FR") {
      console.log(`Location: ${location}`);
      console.log("[smac] Skipped: selected location is not in France");
      return;
    }
    console.log(`[smac] Enabled for French location: ${location}`);

    const discovery = await discoverSmacVenuesFromMinistryOfCultureDataset();
    const filtered = filterSmacCandidatesByLocation(discovery.candidates, location, radiusKm);

    if (options.json) {
      console.log(JSON.stringify({ discovery, filtered }, null, 2));
      return;
    }

    console.log(`Dataset records fetched: ${discovery.totalDatasetRecords}`);
    console.log(`SMAC records detected: ${discovery.candidates.length}`);
    console.log(`Location: ${location}`);
    console.log(`Radius: ${radiusKm} km`);
    console.log(`Nearby SMACs: ${filtered.candidates.length}`);
    if (discovery.warnings.length > 0) {
      console.log(`Warnings: ${discovery.warnings.join(" | ")}`);
    }
    console.log("");

    filtered.candidates.forEach((entry: LocationFilteredSmacCandidate, index: number) => {
      const { candidate, distanceKm } = entry;
      const raw = candidate.sourceRecords.find((record) => record.sourceType === "official_open_data")?.raw;
      const region = typeof raw?.region === "string" ? raw.region : "unknown";
      const status = raw?.smacStatus === "pending" ? "pending" : "labelled";
      console.log(`${index + 1}. ${candidate.name}`);
      console.log(`   Type: SMAC`);
      console.log(`   City: ${candidate.city ?? "unknown"}`);
      console.log(`   Region: ${region}`);
      console.log(`   Distance: ${distanceKm !== null ? `${distanceKm.toFixed(1)} km` : "unknown"}`);
      console.log(`   Status: ${status}`);
      console.log(`   Official source: yes`);
    });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SMAC discovery test failed: ${message}`);
  process.exitCode = 1;
});
