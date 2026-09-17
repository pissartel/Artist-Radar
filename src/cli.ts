#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { runOpportunitySearch } from "./pipeline.js";
import { type Mode } from "./schemas.js";
import { buildCliArtistInput } from "./artistInputBuilders.js";
import { BookingOutputWriteError, exportOpportunities, formatBookingOutputLog } from "./services/exportService.js";

interface CliOptions {
  artist: string;
  city?: string;
  genre?: string;
  target?: string;
  links?: string;
  limit?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
  chartmetric?: boolean;
}

const program = new Command();

program
  .name("artist-radar")
  .description("Generate booking and promotion opportunities for music artists.")
  .version("0.1.0");

addOpportunityCommand("booking", "Find venues, festivals, local artists and bookers.");
addOpportunityCommand("promo", "Find playlists, blogs, curators, media and communities.");

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof BookingOutputWriteError) {
    const originalMessage = error.originalError instanceof Error ? error.originalError.message : String(error.originalError);
    console.error("Booking output write failed:");
    console.error(`- File: ${error.file}`);
    console.error(`- Intended path: ${error.intendedPath}`);
    console.error(`- Error: ${originalMessage}`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});

function addOpportunityCommand(mode: Mode, description: string): void {
  program
    .command(mode)
    .description(description)
    .requiredOption("--artist <artist>", "artist name")
    .option("--city <city>", "artist city (auto-detected when omitted)")
    .option("--genre <genre>", "artist genre (auto-detected when omitted)")
    .option("--target <target>", "target region or country")
    .option("--links <links>", "comma-separated artist links")
    .option("--limit <limit>", "maximum number of opportunities", "10")
    .option("--spotify-url <url>", "Spotify artist URL")
    .option("--youtube-url <url>", "YouTube channel or artist URL")
    .option("--instagram-url <url>", "Instagram profile URL")
    .option("--chartmetric", "enable Chartmetric enrichment for this run")
    .action(async (options: CliOptions) => {
      const input = buildCliArtistInput(mode, {
        artist: options.artist,
        city: options.city,
        genre: options.genre,
        target: options.target,
        links: parseLinks(options.links),
        limit: options.limit,
        spotifyUrl: options.spotifyUrl,
        youtubeUrl: options.youtubeUrl,
        instagramUrl: options.instagramUrl
      });

      const result = await runOpportunitySearch(input, {
        ...(options.chartmetric ? { features: { chartmetricArtistEnrichment: true } } : {})
      });
      const paths = await exportOpportunities(input, result);

      if (input.mode === "booking" && paths.artistJsonPath && paths.similarArtistsJsonPath && paths.bookingJsonPath && paths.bookingSummary) {
        console.log(formatBookingOutputLog({
          artistJsonPath: paths.artistJsonPath,
          similarArtistsJsonPath: paths.similarArtistsJsonPath,
          bookingJsonPath: paths.bookingJsonPath,
          bookingSummary: paths.bookingSummary
        }));
      } else {
        console.log(`JSON: ${paths.jsonPath}`);
        console.log(`Opportunities CSV: ${paths.opportunitiesCsvPath}`);
        console.log(`Similar artists CSV: ${paths.similarArtistsCsvPath}`);
        console.log(`Events CSV: ${paths.eventsCsvPath}`);
      }
    });
}

function parseLinks(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((link) => link.trim())
    .filter(Boolean);
}
