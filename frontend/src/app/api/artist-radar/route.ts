import { mapPipelineResultToArtistRadarResponse } from "@/lib/server/artistRadarMapper";
import { ArtistInputSchema, runOpportunitySearch, warnLog } from "@/lib/server/backendPipeline";
import { parseArtistRadarRequestBody, type RawArtistRadarRequestBody } from "@/lib/server/artistRadarRequest";

function logBookingProviderDiagnostics(): void {
  warnLog("artist-radar-api", "Booking provider diagnostics", {
    enableOpenAgenda: process.env.ENABLE_OPENAGENDA === "true",
    openAgendaApiKeyPresent: Boolean(process.env.OPENAGENDA_API_KEY),
    enableFirecrawlBooking: process.env.ENABLE_FIRECRAWL_BOOKING === "true",
    firecrawlApiKeyPresent: Boolean(process.env.FIRECRAWL_API_KEY),
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: RawArtistRadarRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const artistRadarRequest = parseArtistRadarRequestBody(body);
  if (!artistRadarRequest) {
    return Response.json(
      { error: "artistName, genre and location are required strings." },
      { status: 400 }
    );
  }

  logBookingProviderDiagnostics();

  try {
    const input = ArtistInputSchema.parse({
      mode: "booking",
      artist: artistRadarRequest.artistName,
      city: artistRadarRequest.location,
      genre: artistRadarRequest.genre,
      spotifyUrl: artistRadarRequest.spotifyUrl,
    });

    const result = await runOpportunitySearch(input);
    const response = mapPipelineResultToArtistRadarResponse(result, artistRadarRequest);

    return Response.json(response, { status: 200 });
  } catch (error) {
    warnLog("pipeline", "artist-radar API request failed", {
      artist: artistRadarRequest.artistName,
      error,
    });
    return Response.json(
      { error: "Failed to generate Artist Radar results. Please try again." },
      { status: 500 }
    );
  }
}
