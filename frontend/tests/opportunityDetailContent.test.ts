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

  it("renders the header location only once instead of appending city and country again", () => {
    expect(source).toMatch(/\{opportunity\.location\}/);
    expect(source).not.toMatch(/<span> · \{opportunity\.city\}, \{opportunity\.country\}<\/span>/);
  });

  it("renders a dedicated Line-up section", () => {
    expect(source).toMatch(/Line-up/);
  });

  it("renders a dedicated Contact section without technical provenance or verification chips", () => {
    expect(source).toMatch(/<SectionTitle>Contact<\/SectionTitle>/);
    expect(source).toMatch(/No public contact found yet\./);
    expect(source).not.toMatch(/>Verified</);
    expect(source).not.toMatch(/>Unverified</);
    expect(source).not.toMatch(/via \{contact\.source\}/);
  });

  it("shows a contact shimmer while venue enrichment is loading", () => {
    expect(source).toMatch(/isEnrichmentLoading/);
    expect(source).toMatch(/animate-pulse space-y-2/);
    expect(source).toMatch(/<SectionTitle>Contact<\/SectionTitle>[\s\S]*?<div className="animate-pulse/);
  });

  it("renders concise, actionable match-analysis sections", () => {
    expect(source).toMatch(/Why it matches/);
    expect(source).toMatch(/Things to consider/);
    expect(source).toMatch(/Missing or unverified information/);
    expect(source).not.toMatch(/Recommended action/);
  });

  it("links similar-artist names mentioned in Why it matches to their detail page", () => {
    expect(source).toMatch(/LinkedArtistText/);
    expect(source).toMatch(/href={\`\/similar-artists\/\${artist\.id}\`}/);
    expect(source).toMatch(/<WhyItMatchesSection factors={positiveFactors} relatedArtists={relatedArtists} \/>/);
  });

  it("shows useful opportunity signals but hides the generic venue-contact banner", () => {
    expect(source).toMatch(/OpportunitySignalBanner/);
    expect(source).toMatch(/signal\.kind === "venue_contact"/);
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

  it("does not render technical source sections on the detail page", () => {
    expect(source).not.toMatch(/Source and ticketing/);
    expect(source).not.toMatch(/Source evidence/);
    expect(source).not.toMatch(/openai_web_search/);
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

  it("does not repeat venue similar-artist evidence after the match factor", () => {
    expect(source).toMatch(/<WhyItMatchesSection factors={positiveFactors} relatedArtists={relatedArtists} \/>/);
    expect(source).not.toMatch(/Similar artist evidence/);
    expect(source).not.toMatch(/href={item\.sourceUrl}/);
  });

  it("enriches the single venue information card with the cached venue pipeline", () => {
    expect(source).toMatch(/VenueOpportunityInformationSection/);
    expect(source).toMatch(/useVenueEnrichment\(venueForEnrichment\)/);
    expect(source).not.toMatch(/Official venue presence/);
    expect(source).toMatch(/<SectionTitle>Venue information<\/SectionTitle>/);
    expect(source).toMatch(/VenueEnrichmentSkeleton/);
    expect(source).toMatch(/Live music programming:/);
    expect(source).toMatch(/Books emerging artists:/);
    expect(source).toMatch(/enrichment\?\.programmingUrl/);
    expect(source).toMatch(/enrichment\?\.contactUrl/);
    expect(source).toMatch(/<InfoRow label="Website"/);
  });

  it("updates debug raw data with enrichment status and supports copying the complete payload", () => {
    expect(source).toMatch(/venueEnrichment:/);
    expect(source).toMatch(/cacheHit:/);
    expect(source).toMatch(/isFetching:/);
    expect(source).toMatch(/navigator\.clipboard\.writeText\(serialized\)/);
    expect(source).toMatch(/Copy raw data/);
  });

  it("shows the real enrichment error and a deliberate retry action instead of an empty venue card", () => {
    expect(source).toMatch(/Venue enrichment failed\./);
    expect(source).toMatch(/Retry enrichment/);
    expect(source).toMatch(/Contact enrichment unavailable because the venue lookup failed\./);
  });

  it("hides stale missing capacity/contact factors until enrichment finishes and removes resolved ones", () => {
    expect(source).toMatch(/const resolvedNeutralFactors = family !== "venue"/);
    expect(source).toMatch(/!venueEnrichmentQuery\.data/);
    expect(source).toMatch(/factor\.code === "capacity_fit"/);
    expect(source).toMatch(/factor\.code === "contact_available"/);
    expect(source).toMatch(/factors={resolvedNeutralFactors}/);
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

describe("BookingExplorer content", () => {
  const source = readSource("src/components/dashboard/BookingExplorer.tsx");

  it("does not expose source-provider filtering in the user-facing opportunity list", () => {
    expect(source).not.toMatch(/All sources/);
    expect(source).not.toMatch(/getOpportunitySource/);
  });
});

describe("VenueDetail content", () => {
  const source = readSource("src/components/dashboard/VenueDetail.tsx");

  it("keeps enrichment sources out of the venue detail UI", () => {
    expect(source).not.toMatch(/<SectionTitle>Sources<\/SectionTitle>/);
    expect(source).not.toMatch(/enrichment\.sources\.map/);
  });

  it("renders a dedicated official venue presence link only when one exists", () => {
    expect(source).toMatch(/getOfficialVenueLink\(enrichment, website\)/);
    expect(source).toMatch(/Official website/);
    expect(source).toMatch(/Official page/);
    expect(source).toMatch(/Venue page/);
  });

  it("keeps social links inside Venue information and uses one as fallback when no website exists", () => {
    expect(source).not.toMatch(/<SectionTitle>Official links<\/SectionTitle>/);
    expect(source).toMatch(/const primaryLink = officialLink \?\?/);
    expect(source).toMatch(/secondaryLinks\.map/);
    expect(source).toMatch(/<InfoRow label="Location"/);
  });

  it("uses a shimmer skeleton while venue enrichment is loading", () => {
    expect(source).toMatch(/function VenueEnrichmentSkeleton/);
    expect(source).toMatch(/animate-pulse/);
    expect(source).toMatch(/enrichmentQuery\.isLoading && <VenueEnrichmentSkeleton \/>/);
    expect(source).toMatch(/enrichmentQuery\.isLoading && <VenueContactSkeleton \/>/);
  });

  it("keeps Venue information strictly sourced from enrichment and does not list programmed artists", () => {
    expect(source).toMatch(/enrichment\?\.description/);
    expect(source).not.toMatch(/enrichment\?\.description \?\? venue\.description/);
    expect(source).not.toMatch(/enrichment\.programmedArtists\.slice/);
    expect(source).not.toMatch(/venue\.contacts \?\? \[\]/);
  });
});
