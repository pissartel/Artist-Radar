import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_REDIRECT_COOKIE,
  authCallbackUrl,
  persistAuthRedirectIntent,
} from "@/lib/auth/redirect";

const { exchangeCodeForSession, claimAnonymousAnalysis } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  claimAnonymousAnalysis: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ isAuthConfigured: () => true }));
vi.mock("@/lib/auth/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
vi.mock("@/lib/server/analysisPersistence", () => ({ claimAnonymousAnalysis }));

import { GET } from "@/app/auth/callback/route";

describe("signup email confirmation", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    exchangeCodeForSession.mockResolvedValue({ error: null });
    claimAnonymousAnalysis.mockReset();
    claimAnonymousAnalysis.mockResolvedValue(true);
  });

  it.each([
    "https://next-stage.io",
    "https://artist-radar-git-bigfeature-auth-example.vercel.app",
  ])("builds an exact, allow-listed callback for %s", (origin) => {
    expect(authCallbackUrl(origin)).toBe(`${origin}/auth/callback`);
  });

  it("generates the exact signup/resend redirect and persists next separately", () => {
    vi.stubGlobal("document", { cookie: "" });

    expect(persistAuthRedirectIntent(
      "https://next-stage.io",
      "/opportunities?tab=booking",
    )).toBe("https://next-stage.io/auth/callback");
    expect(document.cookie).toContain(
      `${AUTH_REDIRECT_COOKIE}=%2Fopportunities%3Ftab%3Dbooking`,
    );

    vi.unstubAllGlobals();
  });

  it("exchanges the PKCE code and redirects to the separately persisted intent", async () => {
    const response = await GET(new Request(
      "https://next-stage.io/auth/callback?code=fresh-confirmation-code",
      { headers: { cookie: `${AUTH_REDIRECT_COOKIE}=%2Fopportunities%3Ftab%3Dbooking` } },
    ));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("fresh-confirmation-code");
    expect(claimAnonymousAnalysis).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("https://next-stage.io/opportunities?tab=booking");
    expect(response.headers.get("set-cookie")).toContain(`${AUTH_REDIRECT_COOKIE}=;`);
  });
});
