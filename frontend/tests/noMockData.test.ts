import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const PAGES_USING_REAL_DATA = [
  "src/app/overview/page.tsx",
  "src/app/booking/page.tsx",
  "src/app/similar-artists/page.tsx",
  "src/app/opportunities/[id]/page.tsx",
  "src/app/similar-artists/[id]/page.tsx",
];

describe("no mock data used when API data exists", () => {
  it.each(PAGES_USING_REAL_DATA)("%s does not import mock/placeholder dashboard data", (relativePath) => {
    const source = readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8");

    expect(source).not.toMatch(/mockDashboardData/);
    expect(source).not.toMatch(/getDashboardData/);
    expect(source).toMatch(/useArtistRadarData/);
  });
});
