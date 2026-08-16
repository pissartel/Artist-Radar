import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("overview opportunity panel", () => {
  const source = readFileSync(
    path.resolve(__dirname, "..", "src/components/dashboard/BookingTabs.tsx"),
    "utf-8",
  );

  it("caps the opportunities rendered in each overview tab", () => {
    expect(source).toContain('import { OVERVIEW_OPPORTUNITY_LIMIT } from "@/lib/overviewSelection"');
    expect(source).toContain("activeOpportunities.slice(0, OVERVIEW_OPPORTUNITY_LIMIT)");
  });

  it("keeps the results panel height stable and scrolls its contents", () => {
    expect(source).toContain("h-[min(70vh,640px)]");
    expect(source).toContain("lg:absolute lg:inset-0 lg:flex lg:flex-col");
    expect(source).toContain("lg:h-auto lg:min-h-0 lg:flex-1");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("overscroll-contain");
    expect(source).toContain('role="region"');
    expect(source).toContain("tabIndex={0}");
  });
});
