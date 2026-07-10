import { createAnalysisJob } from "@/lib/server/analysisJobStore";
import { parseArtistRadarRequestBody, type RawArtistRadarRequestBody } from "@/lib/server/artistRadarRequest";

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

  const jobId = createAnalysisJob(artistRadarRequest);

  return Response.json({ jobId }, { status: 202 });
}
