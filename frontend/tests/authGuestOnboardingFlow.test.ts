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
