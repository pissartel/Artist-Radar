import { serve } from "inngest/next";
import { inngest } from "@/lib/server/inngest/client";
import { runAnalysisJob } from "@/lib/server/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAnalysisJob],
});
