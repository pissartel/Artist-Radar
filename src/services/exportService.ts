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
  artistJsonPath?: string;
  similarArtistsJsonPath?: string;
  bookingJsonPath?: string;
  bookingSummary?: BookingOutputSummary;
}

export interface BookingRequestOutputInput {
  artistData: OpportunitySearchRunResult["artistProfile"];
  similarArtists: OpportunitySearchRunResult["similarArtists"];
  bookingResult: Pick<OpportunitySearchRunResult, "opportunities" | "venueCandidates" | "eventCandidates" | "bookingSearch">;
  outputDir: string;
}

export interface BookingRequestOutputPaths {
  artistJsonPath: string;
  similarArtistsJsonPath: string;
  bookingJsonPath: string;
  summary: BookingOutputSummary;
}

export interface BookingOutputSummary {
  similarArtistsCount: number;
  bookingOpportunitiesCount: number;
  sourcesUsedCount: number;
  warningsCount: number;
}

export class BookingOutputWriteError extends Error {
  constructor(
    readonly file: "artist.json" | "similar-artists.json" | "booking.json",
    readonly intendedPath: string,
    readonly originalError: unknown
  ) {
    const originalMessage = originalError instanceof Error ? originalError.message : String(originalError);
    super(`Failed to write ${file} at ${intendedPath}: ${originalMessage}`);
    this.name = "BookingOutputWriteError";
  }
}

interface ArtistBookingOutput {
  artist: {
    name: string | null;
    genres: string[];
    location: string | null;
    country: string | null;
    monthlyListeners: number | null;
    bandSize: number | null;
    sourceUrls: string[];
    confidenceScore: number;
    imageUrl: string | null;
    imageSource: string | null;
    imageConfidence: number | null;
  };
  warnings: string[];
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

  let finalJsonPath = jsonPath;
  let bookingRequestPaths: BookingRequestOutputPaths | null = null;
  if (!Array.isArray(result) && isBookingMode(input)) {
    bookingRequestPaths = await writeBookingRequestOutputs({
      artistData: result.artistProfile,
      similarArtists: result.similarArtists,
      bookingResult: result,
      outputDir: path.join(outputDir, "booking", baseName)
    });
    finalJsonPath = bookingRequestPaths.bookingJsonPath;
    debugLog("pipeline", "booking export paths", {
      jsonPath: finalJsonPath,
      artistJsonPath: bookingRequestPaths.artistJsonPath,
      similarArtistsJsonPath: bookingRequestPaths.similarArtistsJsonPath,
      bookingJsonPath: bookingRequestPaths.bookingJsonPath,
      bookingSummary: bookingRequestPaths.summary
    });

    return {
      jsonPath: finalJsonPath,
      csvPath: "",
      opportunitiesCsvPath: "",
      similarArtistsCsvPath: "",
      eventsCsvPath: "",
      artistJsonPath: bookingRequestPaths.artistJsonPath,
      similarArtistsJsonPath: bookingRequestPaths.similarArtistsJsonPath,
      bookingJsonPath: bookingRequestPaths.bookingJsonPath,
      bookingSummary: bookingRequestPaths.summary
    };
  } else {
    const exportResult = Array.isArray(result) || shouldExportDebugEvidence()
      ? normalizedResult
      : compactOpportunitySearchRunResult(result);
    await writeFile(jsonPath, JSON.stringify({ input, ...exportResult }, null, 2), "utf8");
  }

  await writeFile(opportunitiesCsvPath, opportunitiesToCsv(normalizedResult.opportunities), "utf8");
  await writeFile(similarArtistsCsvPath, similarArtistsToCsv(flattenSimilarArtists(normalizedResult.similarArtists)), "utf8");
  await writeFile(eventsCsvPath, eventsToCsv(normalizedResult.eventCandidates), "utf8");
  debugLog("pipeline", "export paths", {
    jsonPath: finalJsonPath,
    opportunitiesCsvPath,
    similarArtistsCsvPath,
    eventsCsvPath
  });

  return {
    jsonPath: finalJsonPath,
    csvPath: opportunitiesCsvPath,
    opportunitiesCsvPath,
    similarArtistsCsvPath,
    eventsCsvPath
  };
}

export async function writeBookingRequestOutputs({
  artistData,
  similarArtists,
  bookingResult,
  outputDir
}: BookingRequestOutputInput): Promise<BookingRequestOutputPaths> {
  await mkdir(outputDir, { recursive: true });

  const artistJsonPath = path.join(outputDir, "artist.json");
  const similarArtistsJsonPath = path.join(outputDir, "similar-artists.json");
  const bookingJsonPath = path.join(outputDir, "booking.json");
  const flattenedSimilarArtists = flattenSimilarArtists(similarArtists);
  const bookingOpportunities = bookingResult.bookingSearch?.opportunities ?? bookingResult.opportunities;
  const bookingWarnings = bookingResult.bookingSearch?.warnings ?? [];
  const sourceMetadata = bookingResult.bookingSearch?.sourceMetadata ?? [];
  const sourcesUsed = bookingResult.bookingSearch?.sourcesUsed ?? collectSourcesUsed(bookingResult.opportunities);
  const artistOutput = buildArtistOutput(artistData);
  const similarArtistsOutput = {
    similarArtists: flattenedSimilarArtists.map(mapSimilarArtistForBookingOutput),
    warnings: []
  };
  const bookingOutput = {
    booking: {
      opportunities: bookingOpportunities,
      sourcesUsed,
      warnings: bookingWarnings,
      sourceMetadata
    }
  };

  await writeBookingJsonFile("artist.json", artistJsonPath, artistOutput);
  await writeBookingJsonFile("similar-artists.json", similarArtistsJsonPath, similarArtistsOutput);
  await writeBookingJsonFile("booking.json", bookingJsonPath, bookingOutput);

  return {
    artistJsonPath,
    similarArtistsJsonPath,
    bookingJsonPath,
    summary: {
      similarArtistsCount: flattenedSimilarArtists.length,
      bookingOpportunitiesCount: bookingOpportunities.length,
      sourcesUsedCount: sourcesUsed.length,
      warningsCount: artistOutput.warnings.length + similarArtistsOutput.warnings.length + bookingOutput.booking.warnings.length
    }
  };
}

export function formatBookingOutputLog(paths: Required<Pick<ExportPaths, "artistJsonPath" | "similarArtistsJsonPath" | "bookingJsonPath" | "bookingSummary">>): string {
  return [
    "Booking outputs written:",
    `- Artist data JSON: ${paths.artistJsonPath}`,
    `- Similar artists JSON: ${paths.similarArtistsJsonPath}`,
    `- Booking opportunities JSON: ${paths.bookingJsonPath}`,
    "",
    "Booking output summary:",
    `- Similar artists: ${paths.bookingSummary.similarArtistsCount}`,
    `- Booking opportunities: ${paths.bookingSummary.bookingOpportunitiesCount}`,
    `- Sources used: ${paths.bookingSummary.sourcesUsedCount}`,
    `- Warnings: ${paths.bookingSummary.warningsCount}`
  ].join("\n");
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

function isBookingMode(input: ArtistInput): boolean {
  return input.mode === "booking";
}

async function writeBookingJsonFile(
  file: "artist.json" | "similar-artists.json" | "booking.json",
  intendedPath: string,
  content: unknown
): Promise<void> {
  try {
    await writeFile(intendedPath, JSON.stringify(content, null, 2), "utf8");
  } catch (error) {
    throw new BookingOutputWriteError(file, intendedPath, error);
  }
}

function buildArtistOutput(artistProfile: OpportunitySearchRunResult["artistProfile"]): ArtistBookingOutput {
  return {
    artist: {
      name: artistProfile.artistName ?? null,
      genres: artistProfile.genres,
      location: artistProfile.city ?? null,
      country: artistProfile.country ?? null,
      monthlyListeners: artistProfile.platformStats.spotifyFollowers ?? null,
      bandSize: null,
      sourceUrls: collectArtistSourceUrls(artistProfile),
      confidenceScore: Math.round(artistProfile.confidence * 100),
      imageUrl: artistProfile.imageUrl ?? null,
      imageSource: artistProfile.imageSource ?? null,
      imageConfidence: artistProfile.imageConfidence ?? null
    },
    warnings: artistProfile.notes
  };
}

function mapSimilarArtistForBookingOutput(artist: SimilarArtist): Record<string, unknown> {
  return {
    name: artist.name,
    genres: artist.genres,
    location: artist.city,
    country: artist.country,
    score: artist.totalRelevance,
    reasons: artist.evidenceNotes.length > 0 ? artist.evidenceNotes : [artist.reason],
    sourceUrls: artist.sourceUrls,
    imageUrl: artist.imageUrl ?? null,
    imageSource: artist.imageSource ?? null,
    imageConfidence: artist.imageConfidence ?? null
  };
}

function collectSourcesUsed(opportunities: OpportunitySearchRunResult["opportunities"]): string[] {
  return Array.from(new Set(opportunities.map((opportunity) => opportunity.source_url).filter((url): url is string => Boolean(url))));
}

function collectArtistSourceUrls(artistProfile: OpportunitySearchRunResult["artistProfile"]): string[] {
  return [
    artistProfile.socialLinks.spotifyUrl,
    artistProfile.socialLinks.youtubeUrl,
    artistProfile.socialLinks.instagramUrl
  ].filter((url): url is string => Boolean(url));
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
