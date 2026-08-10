import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, "..", relativePath), "utf-8");
}

describe("OpportunityDetail content (issue #132 review feedback)", () => {
  const source = readSource("src/components/dashboard/OpportunityDetail.tsx");

  it("no longer renders two separate 'Details' cards", () => {
    expect(source).not.toMatch(/<SectionTitle>Details<\/SectionTitle>/);
    expect(source).not.toMatch(/<SectionTitle>Event details<\/SectionTitle>/);
  });

  it("renders a single consolidated Event information section", () => {
    expect(source).toMatch(/Event information/);
  });

  it("uses icon actions with tooltips in the header, not text toggle buttons", () => {
    expect(source).toMatch(/OpportunityActions opportunity={opportunity} variant="compact"/);
  });

  it("never renders the header thumbnail and the full poster from the same source at once", () => {
    expect(source).toMatch(/showPoster \? undefined : opportunity\.imageUrl/);
  });

  it("renders a dedicated Line-up section", () => {
    expect(source).toMatch(/Line-up/);
  });

  it("renders a dedicated Contact information section with a verification label", () => {
    expect(source).toMatch(/Contact information/);
    expect(source).toMatch(/Verified/);
    expect(source).toMatch(/Unverified/);
  });

  it("renders concise, actionable match-analysis sections", () => {
    expect(source).toMatch(/Why it matches/);
    expect(source).toMatch(/Things to consider/);
    expect(source).toMatch(/Missing or unverified information/);
    expect(source).toMatch(/Recommended action/);
  });

  it("renders a dedicated Source evidence section listing every source, not only the first", () => {
    expect(source).toMatch(/Source evidence/);
    expect(source).toMatch(/getSourceEvidenceExcluding\(opportunity, \[eventUrl, ticketAction\?\.href\]\)/);
  });

  it("renders the source attribution as a clickable link, not plain text", () => {
    expect(source).toMatch(/href=\{item\.url\}/);
    expect(source).toMatch(/target="_blank"/);
  });

  it("shows what kind of opportunity this is (support slot, open call, venue contact, or general event)", () => {
    expect(source).toMatch(/OpportunitySignalBanner/);
  });

  it("renders a dedicated Venue section linking to the canonical venue page (issue #213)", () => {
    expect(source).toMatch(/<SectionTitle>Venue<\/SectionTitle>/);
    expect(source).toMatch(/href={`\/venues\/\$\{canonicalVenueId\}`}/);
    expect(source).toMatch(/View venue details/);
  });

  it("only renders the Venue section for a live event opportunity with a resolved venueId", () => {
    expect(source).toMatch(
      /if \(!isLiveEventOpportunity\(opportunity\) \|\| !canonicalVenueId \|\| !opportunity\.venue\) return null;/,
    );
  });

  it("renders a dedicated Source and ticketing section, separate from the Venue section", () => {
    expect(source).toMatch(/Source and ticketing/);
    expect(source).toMatch(/<SourceAndTicketingSection opportunity={opportunity} \/>/);
  });

  it("shows lineup completeness alongside the line-up", () => {
    expect(source).toMatch(/getLineupCompletenessLabel\(opportunity\)/);
  });

  // PR #218 review feedback: any raw URL value shown via InfoRow must render
  // as a clickable link, never plain text.
  it("renders InfoRow values as clickable links when the value is itself a URL", () => {
    expect(source).toMatch(/function isHttpUrl\(value: string\): boolean/);
    expect(source).toMatch(/const href = isHttpUrl\(value\) \? value : null;/);
  });

  // PR #218 review feedback: contacts that are URLs must be clickable even
  // when no separate structured `contact.url` was provided.
  it("renders a contact value as a link when it is itself a URL, not only when contact.url is set", () => {
    expect(source).toMatch(/contact\.url \|\| isHttpUrl\(contact\.value\)/);
  });

  // PR #218 review feedback: "Source evidence" must never repeat a source
  // already shown in "Source and ticketing".
  it("excludes the event/ticket URL already shown in Source and ticketing from Source evidence", () => {
    expect(source).toMatch(/getSourceEvidenceExcluding\(opportunity, \[eventUrl, ticketAction\?\.href\]\)/);
  });

  it("shows venue similar-artist evidence in Why it matches and links artist names internally", () => {
    expect(source).toMatch(/<WhyItMatchesSection factors={positiveFactors} opportunity={opportunity} similarArtists={similarArtists} \/>/);
    expect(source).toMatch(/Similar artist evidence/);
    expect(source).toMatch(/href={`\/similar-artists\/\$\{artist\.id\}`}/);
    expect(source).not.toMatch(/href={item\.sourceUrl}/);
  });
});

describe("OpportunityActions content (issue #130/#132 review feedback)", () => {
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

  it("no longer renders large Interested/Contacted text toggle buttons at the page bottom", () => {
    expect(source).not.toMatch(/TextToggleButton/);
  });
});
