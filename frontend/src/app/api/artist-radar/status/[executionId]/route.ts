import { getPipelineExecutionState } from "@/lib/server/backendPipeline";

type ErrorCode = "INVALID_REQUEST" | "EXECUTION_NOT_FOUND";

function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

interface RouteContext {
  params: Promise<{ executionId: string }>;
}

// Frontend polls this every few seconds while an artist analysis request
// (POST /api/artist-radar with a matching executionId) is in flight, to
// display real pipeline progress without streaming internal operations or
// LLM tokens. See issue #134.
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { executionId } = await params;

  if (!executionId || !executionId.trim()) {
    return errorResponse(400, "INVALID_REQUEST", "executionId is required.");
  }

  const state = getPipelineExecutionState(executionId);
  if (!state) {
    return errorResponse(
      404,
      "EXECUTION_NOT_FOUND",
      "No pipeline execution was found for this id. It may not have started yet or may have expired."
    );
  }

  return Response.json(state, { status: 200 });
}
