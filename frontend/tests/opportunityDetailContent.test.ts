import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8");
}

describe("OpportunityDetail content (issue #130 review feedback)", () => {
  const source = readSource("src/components/dashboard/OpportunityDetail.tsx");

  it("no longer renders a 'Why this matches' section", () => {
    expect(source).not.toMatch(/Why this matches/i);
  });

  it("no longer renders a duplicated prominent 'Open source' action", () => {
    expect(source).not.toMatch(/Open source/i);
  });

  it("renders structured Good fit / Things to consider sections instead", () => {
    expect(source).toMatch(/Good fit/);
    expect(source).toMatch(/Things to consider/);
  });

  it("renders a discreet source attribution instead of a separate Sources section", () => {
    expect(source).toMatch(/Source:/);
    expect(source).not.toMatch(/<SectionTitle>Sources<\/SectionTitle>/);
  });
});

describe("OpportunityActions content (issue #130 review feedback)", () => {
  const source = readSource("src/components/dashboard/OpportunityActions.tsx");

  it("uses clear interested/contacted wording, never the vague 'markpage'", () => {
    expect(source).not.toMatch(/markpage/i);
    expect(source).toMatch(/Mark as interested/);
    expect(source).toMatch(/Mark as contacted/);
    expect(source).toMatch(/Remove from interested/);
  });

  it("exposes accessible active states via aria-pressed/aria-label", () => {
    expect(source).toMatch(/aria-pressed/);
    expect(source).toMatch(/aria-label/);
  });

  it("marking as contacted is a deliberate user action, not automatic on link open", () => {
    expect(source).toMatch(/onClick=\{toggleContacted\}/);
  });
});
