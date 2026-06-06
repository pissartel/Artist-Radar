import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Parser } from "json2csv";
import slugify from "slugify";
import type { OpportunitySearchRunResult } from "../pipeline.js";
import type { ArtistInput, EventCandidate, Opportunity, SimilarArtist } from "../schemas.js";
import { debugLog } from "../utils/logger.js";

export interface ExportPaths {
  jsonPath: string;
  csvPath: string;
  opportunitiesCsvPath: string;
  similarArtistsCsvPath: string;
  eventsCsvPath: string;
}

const opportunityCsvFields = [
  "name",
  "type",
  "city",
  "country",
  "source_url",
  "contact",
  "reason",
  "score",
  "suggested_message"
];

const similarArtistCsvFields = [
  "name",
  "url",
  "spotifyId",
  "genres",
  "city",
  "country",
  "source",
  "reason",
  "confidence",
  "artistTier",
  "estimatedFollowers",
  "estimatedPopularity",
  "genreRelevance",
  "sizeRelevance",
  "sceneRelevance",
  "totalRelevance",
  "relevanceToUserArtist",
  "possibleUse",
  "estimatedLevel"
];

const eventCsvFields = [
  "name",
  "date",
  "venueName",
  "city",
  "country",
  "region",
  "lineup",
  "lineupStatus",
  "sourceUrl",
  "ticketUrl",
  "description",
  "confidence"
];

export async function exportOpportunities(
  input: ArtistInput,
  result: OpportunitySearchRunResult | Opportunity[],
  outputDir = "outputs"
): Promise<ExportPaths> {
  await mkdir(outputDir, { recursive: true });

  const baseName = buildOutputBaseName(input);
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const opportunitiesCsvPath = path.join(outputDir, `${baseName}.csv`);
  const similarArtistsCsvPath = path.join(outputDir, `${baseName}-similar-artists.csv`);
  const eventsCsvPath = path.join(outputDir, `${baseName}-events.csv`);
  const normalizedResult = Array.isArray(result)
    ? {
        artistProfile: null,
        similarArtists: [],
        similarArtistsByTier: { small: [], medium: [], large: [], unknown: [] },
        venueCandidates: [],
        eventCandidates: [],
        opportunities: result
      }
    : result;

  await writeFile(jsonPath, JSON.stringify({ input, ...normalizedResult }, null, 2), "utf8");
  await writeFile(opportunitiesCsvPath, opportunitiesToCsv(normalizedResult.opportunities), "utf8");
  await writeFile(similarArtistsCsvPath, similarArtistsToCsv(normalizedResult.similarArtists), "utf8");
  await writeFile(eventsCsvPath, eventsToCsv(normalizedResult.eventCandidates), "utf8");
  debugLog("pipeline", "export paths", {
    jsonPath,
    opportunitiesCsvPath,
    similarArtistsCsvPath,
    eventsCsvPath
  });

  return { jsonPath, csvPath: opportunitiesCsvPath, opportunitiesCsvPath, similarArtistsCsvPath, eventsCsvPath };
}

export function opportunitiesToCsv(opportunities: Opportunity[]): string {
  const parser = new Parser({ fields: opportunityCsvFields });
  return parser.parse(opportunities);
}

export function similarArtistsToCsv(similarArtists: SimilarArtist[]): string {
  const parser = new Parser({
    fields: similarArtistCsvFields,
    transforms: [
      (artist: SimilarArtist) => ({
        ...artist,
        genres: artist.genres.join(", ")
      })
    ]
  });
  return parser.parse(similarArtists);
}

export function eventsToCsv(events: EventCandidate[]): string {
  const parser = new Parser({
    fields: eventCsvFields,
    transforms: [
      (event: EventCandidate) => ({
        ...event,
        lineup: event.lineup.join(", ")
      })
    ]
  });
  return parser.parse(events);
}

export function buildOutputBaseName(input: Pick<ArtistInput, "mode" | "artist" | "city">, date = new Date()): string {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  const slug = slugify(`${input.mode}-${input.artist}-${input.city}`, { lower: true, strict: true });
  return `${slug}-${timestamp}`;
}
