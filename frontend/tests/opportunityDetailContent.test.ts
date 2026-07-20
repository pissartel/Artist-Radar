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

  it("renders a dedicated Source evidence section, not a generic Sources heading", () => {
    expect(source).toMatch(/Source evidence/);
    expect(source).not.toMatch(/<SectionTitle>Sources<\/SectionTitle>/);
  });

  it("renders the source attribution as a clickable link, not plain text (issue #153 review feedback)", () => {
    expect(source).toMatch(/href=\{url\}/);
    expect(source).toMatch(/target="_blank"/);
  });

  it("renders a third, neutral match-factor section for unknown/unverified information", () => {
    expect(source).toMatch(/Unknown \/ not verified/);
  });

  it("renders the announced lineup when known", () => {
    expect(source).toMatch(/label="Lineup"/);
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
