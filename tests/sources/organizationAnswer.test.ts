import { describe, expect, it } from "vitest";
import type { MergedOrganization } from "../../src/sources/organization.schema.js";
import { buildOrganizationAnswer } from "../../src/sources/rag/organizationAnswer.js";
import type { RetrievedOrganizationContext } from "../../src/sources/rag/retrieveOrganizationContext.js";

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
        relatedOrganizations: [],
        genres: [],
        services: [],
        territories: [],
        evidence: [],
        notes: null
      }
    ],
    mergedAt: "2026-07-17T00:00:00.000Z",
    ...overrides
  };
}

function makeContext(overrides: Partial<RetrievedOrganizationContext> = {}): RetrievedOrganizationContext {
  return {
    chunkId: "chunk-1",
    organizationId: "org-1",
    organizationName: "Le Sonic Booking",
    opportunityType: "BOOKER",
    sourceUrl: "https://booker.example.com/about",
    sourceDomain: "booker.example.com",
    lastVerifiedAt: "2026-07-17T00:00:00.000Z",
    confidenceScore: 0.6,
    text: "Le Sonic Booking represents metalcore acts across France.",
    similarityScore: 0.9,
    ...overrides
  };
}

describe("buildOrganizationAnswer", () => {
  it("takes contact details from the structured organization record, not from retrieved text", () => {
    const organization = makeOrganization();
    const context = [
      makeContext({ text: "Contact us at fake-llm-guessed@example.com for bookings." })
    ];

    const answer = buildOrganizationAnswer(organization, context);

    expect(answer.contactEmail).toBe("contact@booker.example.com");
    expect(answer.contactEmail).not.toContain("fake-llm-guessed");
  });

  it("returns null contact fields when the structured record has none, never fabricating a value", () => {
    const organization = makeOrganization({ contactEmail: null, contactFormUrl: null });

    const answer = buildOrganizationAnswer(organization, []);

    expect(answer.contactEmail).toBeNull();
    expect(answer.contactFormUrl).toBeNull();
  });

  it("cites the source for each retrieved claim", () => {
    const organization = makeOrganization();
    const context = [
      makeContext({ chunkId: "chunk-1", sourceUrl: "https://booker.example.com/about" }),
      makeContext({ chunkId: "chunk-2", sourceUrl: "https://directory.example.com/le-sonic" })
    ];

    const answer = buildOrganizationAnswer(organization, context);

    expect(answer.citations).toHaveLength(2);
    expect(answer.citations[0]).toMatchObject({ chunkId: "chunk-1", sourceUrl: "https://booker.example.com/about" });
    expect(answer.citations[1]).toMatchObject({ chunkId: "chunk-2", sourceUrl: "https://directory.example.com/le-sonic" });
  });

  it("only includes citations for the requested organization", () => {
    const organization = makeOrganization();
    const context = [
      makeContext({ chunkId: "own-chunk", organizationId: "org-1" }),
      makeContext({ chunkId: "other-chunk", organizationId: "org-2" })
    ];

    const answer = buildOrganizationAnswer(organization, context);

    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0].chunkId).toBe("own-chunk");
  });
});
