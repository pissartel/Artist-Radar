import { getAnalysisJobResult, getAnalysisJobStatus } from "@/lib/server/analysisJobStore";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

// Lets pages that land with a completed jobId (e.g. /overview?jobId=...) read
// the already-computed dashboard data instead of re-running the pipeline via
// POST /api/artist-radar.
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { jobId } = await params;
  const status = await getAnalysisJobStatus(jobId);

  if (!status) {
    return Response.json({ error: "Analysis job not found." }, { status: 404 });
  }

  if (status.status !== "completed") {
    return Response.json({ error: "Analysis job is not completed yet." }, { status: 409 });
  }

  const result = await getAnalysisJobResult(jobId);
  if (!result) {
    return Response.json({ error: "Analysis job result is unavailable." }, { status: 404 });
  }

  return Response.json(result, { status: 200 });
}
