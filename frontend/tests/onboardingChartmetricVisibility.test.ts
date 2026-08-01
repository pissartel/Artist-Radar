import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// No React Testing Library/jsdom is set up in this project (see
// analyzingPageFlow.test.ts), so this checks source wiring directly: that
// the onboarding page computes checkbox visibility server-side and passes
// it down, rather than any client module re-deriving (and potentially
// getting wrong) a production check on its own.
describe("onboarding page: Chartmetric toggle visibility wiring (issue #142 follow-up)", () => {
  const pagePath = path.resolve(__dirname, "..", "src/app/onboarding/page.tsx");
  const formPath = path.resolve(__dirname, "..", "src/components/onboarding/OnboardingForm.tsx");
  const productFeaturesPath = path.resolve(__dirname, "..", "src/lib/productFeatures.ts");

  const pageSource = readFileSync(pagePath, "utf-8");
  const formSource = readFileSync(formPath, "utf-8");
  const productFeaturesSource = readFileSync(productFeaturesPath, "utf-8");

  it("keeps the onboarding page a Server Component (no \"use client\")", () => {
    expect(pageSource).not.toMatch(/^"use client";/m);
  });

  it("computes visibility via the server-only helper and passes it as a prop", () => {
    expect(pageSource).toMatch(/isChartmetricToggleVisible/);
    expect(pageSource).toMatch(/showChartmetricToggle={isChartmetricToggleVisible\(\)}/);
  });

  it("gates the checkbox on the showChartmetricToggle prop, not a client-computed flag", () => {
    expect(formSource).toMatch(/showChartmetricToggle\s*&&/);
    expect(formSource).not.toMatch(/productFeatures\.chartmetricToggle/);
  });

  it("no longer exposes a client-computed chartmetricToggle flag from productFeatures", () => {
    expect(productFeaturesSource).not.toMatch(/chartmetricToggle:/);
  });
});
