import { createAnalysisJob } from "@/lib/server/analysisJobStore";
import { inngest } from "@/lib/server/inngest/client";
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

  let jobId: string;
  try {
    jobId = await createAnalysisJob(artistRadarRequest);
  } catch {
    return Response.json({ error: "Failed to start the analysis. Please try again." }, { status: 500 });
  }

  // The pipeline runs durably via Inngest, not as unawaited work here — this
  // request returns as soon as the job is queued, regardless of how long the
  // real analysis takes or which serverless instance eventually runs it.
  await inngest.send({ name: "artist-radar/analysis.requested", data: { jobId } });

  return Response.json({ jobId }, { status: 202 });
}
