import { NextResponse } from "next/server";
import { createClient } from "@/lib/auth/server";
import { isAuthConfigured } from "@/lib/auth/config";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { claimAnonymousAnalysis } from "@/lib/server/analysisPersistence";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeRedirectPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (code && isAuthConfigured()) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error) {
      // Authentication should still complete during a temporary persistence
      // outage; WorkspacePersistence retries the claim after navigation.
      await claimAnonymousAnalysis().catch(() => false);
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL(`/login?error=auth_callback&next=${encodeURIComponent(next)}`, url.origin));
}
