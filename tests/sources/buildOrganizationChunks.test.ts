import { describe, expect, it } from "vitest";
import { buildOrganizationChunks } from "../../src/sources/rag/buildOrganizationChunks.js";
import type { MergedOrganization } from "../../src/sources/organization.schema.js";

function makeOrganization(overrides: Partial<MergedOrganization> = {}): MergedOrganization {
  return {
    id: "org-1",
    name: "Le Sonic Booking",
    organizationType: "BOOKER",
    city: "Lyon",
    country: "France",
    websiteUrl: "https://booker.example.com",
    contactEmail: "contact@booker.example.com",
    contactFormUrl: null,
    sources: [
      {
        sourceType: "web_discovery",
        sourceName: "Le Sonic Booking website",
        sourceUrl: "https://booker.example.com/about",
        extractedAt: "2026-07-17T00:00:00.000Z",
        reliabilityScore: 0.6,
        name: "Le Sonic Booking",
        organizationType: "BOOKER",
        city: "Lyon",
        country: "France",
        websiteUrl: "https://booker.example.com",
        contactEmail: "contact@booker.example.com",
        contactFormUrl: null,
        relatedOrganizations: ["Heavy Riff Collective"],
        genres: ["metalcore", "hardcore"],
        services: ["booking", "tour management"],
        territories: ["France", "Belgium"],
        evidence: ["\"We book metalcore and hardcore tours across France and Belgium.\""],
        notes: "Submission policy: send an EPK to the contact form only."
      }
    ],
    mergedAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

describe("buildOrganizationChunks", () => {
  it("builds a chunk carrying the source's own URL for traceability", () => {
    const organization = makeOrganization();

    const chunks = buildOrganizationChunks(organization);

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].organizationId).toBe(organization.id);
    expect(chunks[0].sourceUrl).toBe(organization.sources[0].sourceUrl);
    expect(chunks[0].sourceDomain).toBe("booker.example.com");
  });

  it("carries structured metadata for filtering (opportunityType, location, genres, confidence, verification)", () => {
    const organization = makeOrganization();

    const [chunk] = buildOrganizationChunks(organization);

    expect(chunk.opportunityType).toBe("BOOKER");
    expect(chunk.city).toBe("Lyon");
    expect(chunk.country).toBe("France");
    expect(chunk.genres).toEqual(["metalcore", "hardcore"]);
    expect(chunk.confidenceScore).toBe(0.6);
    expect(chunk.lastVerifiedAt).toBe("2026-07-17T00:00:00.000Z");
  });

  it("includes services, territories, roster and evidence in the indexed text", () => {
    const organization = makeOrganization();

    const chunks = buildOrganizationChunks(organization);
    const combinedText = chunks.map((chunk) => chunk.text).join("\n");

    expect(combinedText).toContain("booking");
    expect(combinedText).toContain("Belgium");
    expect(combinedText).toContain("Heavy Riff Collective");
    expect(combinedText).toContain("book metalcore and hardcore tours");
    expect(combinedText).toContain("Submission policy");
  });

  it("falls back to the organization's city/country when a source record has none", () => {
    const organization = makeOrganization({
      sources: [
        {
          ...makeOrganization().sources[0],
          city: null,
          country: null
        }
      ]
    });

    const [chunk] = buildOrganizationChunks(organization);

    expect(chunk.city).toBe("Lyon");
    expect(chunk.country).toBe("France");
  });

  it("produces one chunk set per source record", () => {
    const organization = makeOrganization({
      sources: [
        makeOrganization().sources[0],
        {
          ...makeOrganization().sources[0],
          sourceUrl: "https://directory.example.com/le-sonic-booking",
          sourceType: "trusted_directory",
          reliabilityScore: 0.5
        }
      ]
    });

    const chunks = buildOrganizationChunks(organization);
    const sourceUrls = new Set(chunks.map((chunk) => chunk.sourceUrl));

    expect(sourceUrls.size).toBe(2);
  });

  it("produces deterministic chunk ids for unchanged content", () => {
    const organization = makeOrganization();

    const first = buildOrganizationChunks(organization);
    const second = buildOrganizationChunks(organization);

    expect(first.map((chunk) => chunk.id)).toEqual(second.map((chunk) => chunk.id));
  });
});
