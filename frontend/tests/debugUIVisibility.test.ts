import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// Issue #201 follow-up: the debug UI (Heads Up warnings panel, Raw JSON
// tab) was observed live in Production. This checks source wiring
// directly (no jsdom/RTL in this project — see analyzingPageFlow.test.ts):
// every consumer must read the server-derived debugUIVisible value from
// ProductFeaturesProvider, never a client-computed productFeatures flag.
describe("debug UI visibility wiring (issue #201 follow-up)", () => {
  const root = path.resolve(__dirname, "..", "src");
  const files = [
    "app/layout.tsx",
    "lib/productFeatures.ts",
    "components/dashboard/WarningsBanner.tsx",
    "components/dashboard/OpportunityDetail.tsx",
    "components/dashboard/SimilarArtistDetail.tsx",
    "components/dashboard/BookingTabs.tsx",
  ];
  const source = Object.fromEntries(files.map((file) => [file, readFileSync(path.join(root, file), "utf-8")]));

  it("computes debug UI visibility server-side in the root layout and passes it into the provider", () => {
    expect(source["app/layout.tsx"]).toMatch(/isDebugUIVisible/);
    expect(source["app/layout.tsx"]).toMatch(/debugUIVisible={isDebugUIVisible\(\)}/);
  });

  it("no longer exposes a client-computed rawJson/debugWarnings flag from productFeatures", () => {
    expect(source["lib/productFeatures.ts"]).not.toMatch(/rawJson:/);
    expect(source["lib/productFeatures.ts"]).not.toMatch(/debugWarnings:/);
    // The var name may still appear in an explanatory comment; it must never
    // be actively read via process.env in this client-bundled module.
    expect(source["lib/productFeatures.ts"]).not.toMatch(/process\.env\.NEXT_PUBLIC_ENABLE_DEBUG_UI/);
  });

  it("every debug-UI consumer reads from useProductFeatures(), not a client-computed productFeatures flag", () => {
    for (const file of ["components/dashboard/WarningsBanner.tsx", "components/dashboard/OpportunityDetail.tsx", "components/dashboard/SimilarArtistDetail.tsx", "components/dashboard/BookingTabs.tsx"]) {
      expect(source[file]).toMatch(/useProductFeatures/);
      expect(source[file]).not.toMatch(/productFeatures\.(rawJson|debugWarnings)/);
    }
  });
});
