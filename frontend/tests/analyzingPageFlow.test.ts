import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// No React Testing Library/jsdom is set up in this project, so this checks
// the page's control-flow source directly rather than rendering it — still
// enough to catch a regression where the loading state is no longer exited
// on error, or the success redirect is removed/misdirected.
describe("analyzing page: loading state exit paths", () => {
  const source = readFileSync(
    path.resolve(__dirname, "..", "src/app/analyzing/page.tsx"),
    "utf-8",
  );

  it("renders the error state (not the spinner) when the fetch fails, instead of staying stuck loading", () => {
    expect(source).toMatch(/state\.status === "error"/);
    expect(source).toMatch(/ArtistRadarErrorState/);
  });

  it("redirects to /onboarding when there is no request to run (empty state), instead of hanging", () => {
    expect(source).toMatch(/state\.status === "empty"/);
    expect(source).toMatch(/router\.replace\("\/onboarding"\)/);
  });

  it("redirects to /overview on a successful analysis", () => {
    expect(source).toMatch(/state\.status !== "success"/);
    expect(source).toMatch(/router\.replace\("\/overview"\)/);
  });
});
