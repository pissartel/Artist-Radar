#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { runOpportunitySearch } from "./pipeline.js";
import { ArtistInputSchema, type Mode } from "./schemas.js";
import { exportOpportunities } from "./services/exportService.js";

interface CliOptions {
  artist: string;
  city: string;
  genre: string;
  target?: string;
  links?: string;
  limit?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
  instagramUrl?: string;
}

const program = new Command();

program
  .name("artist-radar")
  .description("Generate booking and promotion opportunities for music artists.")
  .version("0.1.0");

addOpportunityCommand("booking", "Find venues, festivals, local artists and bookers.");
addOpportunityCommand("promo", "Find playlists, blogs, curators, media and communities.");

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});

function addOpportunityCommand(mode: Mode, description: string): void {
  program
    .command(mode)
    .description(description)
    .requiredOption("--artist <artist>", "artist name")
    .requiredOption("--city <city>", "artist city")
    .requiredOption("--genre <genre>", "artist genre")
    .option("--target <target>", "target region or country")
    .option("--links <links>", "comma-separated artist links")
    .option("--limit <limit>", "maximum number of opportunities", "10")
    .option("--spotify-url <url>", "Spotify artist URL")
    .option("--youtube-url <url>", "YouTube channel or artist URL")
    .option("--instagram-url <url>", "Instagram profile URL")
    .action(async (options: CliOptions) => {
      const input = ArtistInputSchema.parse({
        mode,
        artist: options.artist,
        city: options.city,
        genre: options.genre,
        target: options.target ?? null,
        links: parseLinks(options.links),
        limit: options.limit,
        spotifyUrl: options.spotifyUrl ?? null,
        youtubeUrl: options.youtubeUrl ?? null,
        instagramUrl: options.instagramUrl ?? null
      });

      const result = await runOpportunitySearch(input);
      const paths = await exportOpportunities(input, result);

      console.log(`JSON: ${paths.jsonPath}`);
      console.log(`Opportunities CSV: ${paths.opportunitiesCsvPath}`);
      console.log(`Similar artists CSV: ${paths.similarArtistsCsvPath}`);
      console.log(`Events CSV: ${paths.eventsCsvPath}`);
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
