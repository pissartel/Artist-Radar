import { mapPipelineResultToArtistRadarResponse } from "@/lib/server/artistRadarMapper";
import { ArtistInputSchema, runOpportunitySearch, warnLog } from "@/lib/server/backendPipeline";
import type { ArtistRadarRequest } from "@/types/artistRadar";

interface RawRequestBody {
  artistName?: unknown;
  genre?: unknown;
  location?: unknown;
  enableBooking?: unknown;
}

function parseArtistRadarRequest(body: RawRequestBody): ArtistRadarRequest | null {
  const { artistName, genre, location, enableBooking } = body;

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

  return {
    artistName: artistName.trim(),
    genre: genre.trim(),
    location: location.trim(),
    enableBooking,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: RawRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const artistRadarRequest = parseArtistRadarRequest(body);
  if (!artistRadarRequest) {
    return Response.json(
      { error: "artistName, genre and location are required strings." },
      { status: 400 }
    );
  }

  try {
    const input = ArtistInputSchema.parse({
      mode: "booking",
      artist: artistRadarRequest.artistName,
      city: artistRadarRequest.location,
      genre: artistRadarRequest.genre,
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
