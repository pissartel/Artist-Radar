import { NextResponse } from "next/server";
import { createClient } from "@/lib/auth/server";
import { isAuthConfigured } from "@/lib/auth/config";
import { AUTH_REDIRECT_COOKIE, authRedirectIntent, safeRedirectPath } from "@/lib/auth/redirect";
import { claimAnonymousAnalysis } from "@/lib/server/analysisPersistence";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeRedirectPath(
    url.searchParams.get("next") ?? authRedirectIntent(request.headers.get("cookie")),
  );
  const code = url.searchParams.get("code");
  if (code && isAuthConfigured()) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error) {
      // Authentication should still complete during a temporary persistence
      // outage; WorkspacePersistence retries the claim after navigation.
      await claimAnonymousAnalysis().catch(() => false);
      const response = NextResponse.redirect(new URL(next, url.origin));
      response.cookies.set(AUTH_REDIRECT_COOKIE, "", { maxAge: 0, path: "/auth/callback" });
      return response;
    }
  }
  return NextResponse.redirect(new URL(`/login?error=auth_callback&next=${encodeURIComponent(next)}`, url.origin));
}
