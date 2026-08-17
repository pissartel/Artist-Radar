import { mapPipelineResultToArtistRadarResponse } from "@/lib/server/artistRadarMapper";
import { ArtistInputSchema, runOpportunitySearch, warnLog } from "@/lib/server/backendPipeline";
import type { ArtistRadarRequest } from "@/types/artistRadar";

interface RawRequestBody {
  artistName?: unknown;
  genre?: unknown;
  location?: unknown;
  referenceCountry?: unknown;
  enableBooking?: unknown;
  spotifyUrl?: unknown;
  executionId?: unknown;
  features?: unknown;
}

const MAX_EXECUTION_ID_LENGTH = 200;

// Structured, safe error shape returned to the client. Never includes stack
// traces, key names/values, raw provider responses, or prompts — those stay
// server-side via warnLog. `code` is a stable, non-sensitive identifier a
// developer can grep server logs for; `message` is the short user-facing text.
type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "MISSING_REQUIRED_CONFIG"
  | "ARTIST_ANALYSIS_FAILED";

function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function parseArtistRadarRequest(body: RawRequestBody): ArtistRadarRequest | null {
  const { artistName, genre, location, referenceCountry, enableBooking, spotifyUrl, executionId, features } = body;

  if (
    typeof artistName !== "string" || !artistName.trim() ||
    typeof genre !== "string" || !genre.trim() ||
    typeof location !== "string" || !location.trim()
  ) {
    return null;
  }

  if (enableBooking !== undefined && typeof enableBooking !== "boolean") {
    return null;
  }

  if (spotifyUrl !== undefined && typeof spotifyUrl !== "string") {
    return null;
  }

  if (referenceCountry !== undefined && (typeof referenceCountry !== "string" || !referenceCountry.trim())) {
    return null;
  }

  if (
    executionId !== undefined &&
    (typeof executionId !== "string" || !executionId.trim() || executionId.length > MAX_EXECUTION_ID_LENGTH)
  ) {
    return null;
  }

  const chartmetricArtistEnrichment = parseChartmetricToggle(features);
  if (chartmetricArtistEnrichment === INVALID_FEATURES) {
    return null;
  }

  return {
    artistName: artistName.trim(),
    genre: genre.trim(),
    location: location.trim(),
    ...(typeof referenceCountry === "string" ? { referenceCountry: referenceCountry.trim() } : {}),
    enableBooking,
    ...(spotifyUrl?.trim() ? { spotifyUrl: spotifyUrl.trim() } : {}),
    ...(executionId?.trim() ? { executionId: executionId.trim() } : {}),
    ...(chartmetricArtistEnrichment !== undefined ? { features: { chartmetricArtistEnrichment } } : {}),
  };
}

const INVALID_FEATURES = Symbol("invalid-features");

// `features` is optional; when present it must be a plain object whose only
// recognized key is a boolean `chartmetricArtistEnrichment` (issue #142
// section 4). The server never trusts this value alone — see
// resolveChartmetricFeatureFlag in the backend, which ANDs it with the
// server-side flag outside of production and ignores it entirely in
// production.
function parseChartmetricToggle(features: unknown): boolean | undefined | typeof INVALID_FEATURES {
  if (features === undefined) {
    return undefined;
  }
  if (typeof features !== "object" || features === null) {
    return INVALID_FEATURES;
  }
  const value = (features as Record<string, unknown>).chartmetricArtistEnrichment;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    return INVALID_FEATURES;
  }
  return value;
}

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function logBookingProviderDiagnostics(): void {
  warnLog("artist-radar-api", "Booking provider diagnostics", {
    enableOpenAgenda: process.env.ENABLE_OPENAGENDA === "true",
    openAgendaApiKeyPresent: Boolean(process.env.OPENAGENDA_API_KEY),
    enableFirecrawlBooking: process.env.ENABLE_FIRECRAWL_BOOKING === "true",
    firecrawlApiKeyPresent: Boolean(process.env.FIRECRAWL_API_KEY),
  });
}

// The AI pipeline (genre matching, relevance scoring, judging) cannot run at
// all without an OpenAI key — unlike the optional booking-source providers
// (Spotify, Firecrawl, OpenAgenda, ...), which each already degrade
// gracefully on their own when unconfigured. Failing fast here with a clear
// server log turns a missing-Production-env-var deployment mistake into an
// immediately diagnosable error instead of a deep, opaque exception from
// inside the OpenAI SDK.
function getMissingRequiredEnvVars(): string[] {
  const required = ["OPENAI_API_KEY"];
  return required.filter((name) => !process.env[name]);
}

export async function POST(request: Request): Promise<Response> {
  let body: RawRequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const artistRadarRequest = parseArtistRadarRequest(body);
  if (!artistRadarRequest) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "artistName, genre and location are required strings."
    );
  }

  const missingEnvVars = getMissingRequiredEnvVars();
  if (missingEnvVars.length > 0) {
    warnLog("artist-radar-api", "Missing required server configuration", {
      missing: missingEnvVars,
    });
    return errorResponse(
      500,
      "MISSING_REQUIRED_CONFIG",
      "The artist analysis service is not fully configured. Please try again later."
    );
  }

  logBookingProviderDiagnostics();

  try {
    const input = ArtistInputSchema.parse({
      mode: "booking",
      artist: artistRadarRequest.artistName,
      city: artistRadarRequest.location,
      genre: artistRadarRequest.genre,
      spotifyUrl: isValidHttpUrl(artistRadarRequest.spotifyUrl) ? artistRadarRequest.spotifyUrl : undefined,
    });

    const searchOptions = {
      ...(artistRadarRequest.executionId ? { executionId: artistRadarRequest.executionId } : {}),
      ...(artistRadarRequest.features ? { features: artistRadarRequest.features } : {}),
    };
    const result = await runOpportunitySearch(
      input,
      Object.keys(searchOptions).length > 0 ? searchOptions : undefined
    );
    const response = mapPipelineResultToArtistRadarResponse(result, artistRadarRequest);

    return Response.json(response, { status: 200 });
  } catch (error) {
    // Full exception (including any provider stack trace) stays server-side.
    warnLog("pipeline", "artist-radar API request failed", {
      artist: artistRadarRequest.artistName,
      error,
    });
    return errorResponse(
      500,
      "ARTIST_ANALYSIS_FAILED",
      "The artist analysis could not be completed."
    );
  }
}
