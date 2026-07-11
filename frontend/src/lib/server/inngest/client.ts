import { EventSchemas, Inngest } from "inngest";

// Durable background job executor (see issue #101 follow-up): replaces the
// unawaited `void runAnalysisJob(...)` background work, which Vercel does
// not guarantee will keep running after the HTTP response is returned.
// The event only carries the job ID; the function loads the request payload
// from Postgres so Postgres stays the single source of truth for job state.

type AnalysisRequestedEvent = {
  data: { jobId: string };
};

type Events = {
  "artist-radar/analysis.requested": AnalysisRequestedEvent;
};

export const inngest = new Inngest({
  id: "artist-radar",
  schemas: new EventSchemas().fromRecord<Events>(),
});
