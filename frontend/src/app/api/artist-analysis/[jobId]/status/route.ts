import { getAnalysisJobStatus } from "@/lib/server/analysisJobStore";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { jobId } = await params;
  const status = await getAnalysisJobStatus(jobId);

  if (!status) {
    return Response.json({ error: "Analysis job not found." }, { status: 404 });
  }

  return Response.json(status, { status: 200 });
}
