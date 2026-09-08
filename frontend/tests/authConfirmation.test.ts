import { beforeEach, describe, expect, it, vi } from "vitest";
import { authCallbackUrl } from "@/lib/auth/redirect";

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
  ])("builds an origin-specific callback for %s", (origin) => {
    expect(authCallbackUrl(origin, "/opportunities?tab=booking")).toBe(
      `${origin}/auth/callback?next=%2Fopportunities%3Ftab%3Dbooking`,
    );
  });

  it("falls back to a safe internal next route", () => {
    expect(authCallbackUrl("https://next-stage.io", "https://attacker.example")).toBe(
      "https://next-stage.io/auth/callback?next=%2Foverview",
    );
  });

  it("exchanges the PKCE code and redirects to the intended route", async () => {
    const response = await GET(new Request(
      "https://next-stage.io/auth/callback?code=fresh-confirmation-code&next=%2Fopportunities",
    ));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("fresh-confirmation-code");
    expect(claimAnonymousAnalysis).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("https://next-stage.io/opportunities");
  });
});
