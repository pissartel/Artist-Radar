import { claimAnonymousAnalysis } from "@/lib/server/analysisPersistence";

export async function POST(): Promise<Response> {
  try {
    const claimed = await claimAnonymousAnalysis();
    return Response.json({ claimed });
  } catch {
    return Response.json({ claimed: false }, { status: 500 });
  }
}
