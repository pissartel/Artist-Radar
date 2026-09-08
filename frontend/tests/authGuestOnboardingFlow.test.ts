import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

describe("issue #255 guest onboarding and conversion", () => {
  it("keeps first use guest-first and routes artist search through identification", () => {
    const landing = source("components/onboarding/GuestLandingSearch.tsx");
    expect(landing).toContain("No card, no signup");
    expect(landing).toContain("/start?q=");
    expect(landing).toContain("Pick up where you left off");
    expect(landing).toContain('<Button type="submit"');
  });

  it("keeps mouse and keyboard submission consistent across onboarding", () => {
    const confirmation = source("components/onboarding/ArtistConfirm.tsx");
    expect(confirmation).toContain('<form onSubmit={submit}');
    expect(confirmation).toContain('<Button type="submit"');
    expect(confirmation).toContain("Analyze my profile");
    expect(confirmation).toContain('role="alert"');
  });

  it("does not block artist confirmation when enrichment has no genre or location", () => {
    const confirmation = source("components/onboarding/ArtistConfirm.tsx");
    expect(confirmation).not.toContain("Add a main genre before continuing.");
    expect(confirmation).not.toContain("Add your city or country before continuing.");
    expect(confirmation).not.toMatch(/<Input required value=\{genre\}/);
    expect(confirmation).toContain('router.push("/analyzing")');
  });

  it("shows a concise artist-search loading state with shimmer placeholders", () => {
    const identify = source("components/onboarding/ArtistIdentify.tsx");
    expect(identify).toContain('role="status"');
    expect(identify).toContain("Checking artist profiles across music platforms. This may take a few seconds.");
    expect(identify).not.toContain("Searching Spotify, Deezer and MusicBrainz");
    expect(identify).not.toContain("Searching for your artist</strong>");
    expect(identify).toContain("animate-ns-sheen");
    expect(identify).toContain("bg-[length:200%_100%]");
  });

  it("validates signup password confirmation and gates OAuth providers", () => {
    const auth = source("components/auth/AuthForm.tsx");
    const config = source("lib/auth/config.ts");
    expect(auth).toContain("Confirm password");
    expect(auth).toContain("Passwords do not match.");
    expect(auth).toContain("setShowPassword");
    expect(auth).toContain("loadingMethod");
    expect(config).toContain("NEXT_PUBLIC_AUTH_GOOGLE_ENABLED");
    expect(config).toContain("NEXT_PUBLIC_AUTH_APPLE_ENABLED");
  });

  it("restores the complete landing page while the video is unavailable", () => {
    const landing = source("app/(marketing)/page.tsx");
    expect(landing).toContain("SHOW_PRODUCT_VIDEO = false");
    expect(landing).toContain('id="features"');
    expect(landing).toContain('id="how-it-works"');
  });

  it("uses real pipeline state and never displays a percentage", () => {
    const analyzing = source("app/analyzing/page.tsx");
    expect(analyzing).toContain("usePipelineProgress");
    expect(analyzing).toContain('role="status"');
    expect(analyzing).not.toMatch(/\{\s*percent(age)?\s*\}/i);
    expect(analyzing).toContain("The analysis keeps running server-side");
  });

  it("claims the anonymous result through the existing endpoint with a recoverable failure", () => {
    const finishing = source("app/signup/finishing/page.tsx");
    expect(finishing).toContain('/api/anonymous-analysis/claim');
    expect(finishing).toContain("Retry now");
    expect(finishing).toContain("Continue without it");
  });

  it("does not expose raw authentication provider errors", () => {
    const auth = source("components/auth/AuthForm.tsx");
    expect(auth).toContain("friendlyError");
    expect(auth).not.toContain("setError(result.error.message)");
    expect(auth).not.toContain("setError(providerError.message)");
  });

  it("resends signup confirmation with the original callback and a cooldown", () => {
    const verify = source("app/signup/verify/page.tsx");
    expect(verify).toContain('type: "signup"');
    expect(verify).toContain("options: { emailRedirectTo }");
    expect(verify).toContain("persistAuthRedirectIntent(window.location.origin, next)");
    expect(verify).toContain("Confirmation email sent again.");
    expect(verify).toContain("RESEND_COOLDOWN_SECONDS");
    expect(verify).toContain("if (!email || resending || cooldown > 0) return");
    expect(verify).toContain("Return to sign up");
  });

  it("implements the approved four-animation system and reduced motion fallback", () => {
    const config = source("../tailwind.config.ts");
    const globals = source("app/globals.css");
    for (const animation of ["ns-spin", "ns-in", "ns-pulse", "ns-sheen"]) {
      expect(config).toContain(animation);
    }
    expect(globals).toContain("prefers-reduced-motion: reduce");
    expect(globals).toContain(".ns-stage-dot--active");
  });
});
