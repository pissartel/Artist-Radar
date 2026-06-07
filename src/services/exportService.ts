import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Parser } from "json2csv";
import slugify from "slugify";
import type { OpportunitySearchRunResult } from "../pipeline.js";
import type { ArtistInput, BookingCategory, EventCandidate, Opportunity, SimilarArtist } from "../schemas.js";
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
  "bookingCategory",
  "possibleUse",
  "genres",
  "city",
  "country",
  "estimatedLevel",
  "popularityConfidence",
  "instagramFollowers",
  "youtubeSubscribers",
  "youtubeViews",
  "spotifyFollowers",
  "spotifyPopularity",
  "lastfmListeners",
  "lastfmPlaycount",
  "spotifyUrl",
  "instagramUrl",
  "youtubeUrl",
  "verificationStatus",
  "totalRelevance",
  "genreRelevance",
  "localRelevance",
  "sizeRelevance",
  "sources",
  "sourceUrls",
  "reason"
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
        similarArtists: emptySimilarArtistsGroup(),
        venueCandidates: [],
        eventCandidates: [],
        opportunities: result
      }
    : result;

  const exportResult = Array.isArray(result) || shouldExportDebugEvidence()
    ? normalizedResult
    : compactOpportunitySearchRunResult(result);
  await writeFile(jsonPath, JSON.stringify({ input, ...exportResult }, null, 2), "utf8");
  await writeFile(opportunitiesCsvPath, opportunitiesToCsv(normalizedResult.opportunities), "utf8");
  await writeFile(similarArtistsCsvPath, similarArtistsToCsv(flattenSimilarArtists(normalizedResult.similarArtists)), "utf8");
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
        genres: artist.genres.join(", "),
        sources: artist.sources.join(", "),
        sourceUrls: artist.sourceUrls.join(", "),
        estimatedLevel: artist.popularity.estimatedLevel,
        popularityConfidence: artist.popularity.confidence,
        instagramFollowers: artist.popularity.platforms.instagram?.followers ?? null,
        youtubeSubscribers: artist.popularity.platforms.youtube?.subscribers ?? null,
        youtubeViews: artist.popularity.platforms.youtube?.views ?? null,
        spotifyFollowers: artist.popularity.platforms.spotify?.followers ?? null,
        spotifyPopularity: artist.popularity.platforms.spotify?.popularity ?? null,
        lastfmListeners: artist.popularity.platforms.lastfm?.listeners ?? null,
        lastfmPlaycount: artist.popularity.platforms.lastfm?.playcount ?? null
      })
    ]
  });
  return parser.parse(similarArtists);
}

export function flattenSimilarArtists(similarArtists: Record<BookingCategory, SimilarArtist[]>): SimilarArtist[] {
  return [
    ...similarArtists.local_peer,
    ...similarArtists.regional_peer,
    ...similarArtists.support_target,
    ...similarArtists.reference,
    ...similarArtists.to_verify,
    ...similarArtists.unknown
  ];
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

function emptySimilarArtistsGroup(): Record<BookingCategory, SimilarArtist[]> {
  return { local_peer: [], regional_peer: [], support_target: [], reference: [], to_verify: [], unknown: [] };
}

function shouldExportDebugEvidence(env = process.env): boolean {
  return env.EXPORT_DEBUG_EVIDENCE === "true";
}

function compactOpportunitySearchRunResult(result: OpportunitySearchRunResult): OpportunitySearchRunResult {
  return {
    ...result,
    similarArtists: {
      local_peer: result.similarArtists.local_peer.map(compactSimilarArtistForOutput) as SimilarArtist[],
      regional_peer: result.similarArtists.regional_peer.map(compactSimilarArtistForOutput) as SimilarArtist[],
      support_target: result.similarArtists.support_target.map(compactSimilarArtistForOutput) as SimilarArtist[],
      reference: result.similarArtists.reference.map(compactSimilarArtistForOutput) as SimilarArtist[],
      to_verify: result.similarArtists.to_verify.map(compactSimilarArtistForOutput) as SimilarArtist[],
      unknown: result.similarArtists.unknown.map(compactSimilarArtistForOutput) as SimilarArtist[]
    }
  };
}

function compactSimilarArtistForOutput(artist: SimilarArtist): Partial<SimilarArtist> {
  return {
    name: artist.name,
    bookingCategory: artist.bookingCategory,
    possibleUse: artist.possibleUse,
    genres: artist.genres,
    city: artist.city,
    country: artist.country,
    spotifyUrl: artist.spotifyUrl ?? null,
    instagramUrl: artist.instagramUrl ?? null,
    instagramHandle: artist.instagramHandle ?? null,
    youtubeUrl: artist.youtubeUrl ?? null,
    popularity: artist.popularity,
    verificationStatus: artist.verificationStatus,
    totalRelevance: artist.totalRelevance,
    genreRelevance: artist.genreRelevance,
    localRelevance: artist.localRelevance,
    sizeRelevance: artist.sizeRelevance,
    sources: artist.sources,
    sourceUrls: artist.sourceUrls,
    reason: artist.reason
  };
}
