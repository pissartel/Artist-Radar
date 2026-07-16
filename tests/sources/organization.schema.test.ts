import { describe, expect, it } from "vitest";
import {
  MergedOrganizationSchema,
  parseMergedOrganization,
  parseOrganizationSourceRecord
} from "../../src/sources/organization.schema.js";

const validSourceRecord = {
  sourceType: "musicbrainz" as const,
  sourceName: "MusicBrainz",
  sourceUrl: "https://musicbrainz.org/label/abc-123",
  extractedAt: "2026-07-17T00:00:00.000Z",
  reliabilityScore: 0.75,
  name: "Because Music",
  organizationType: "LABEL" as const,
  city: "Paris",
  country: "France",
  websiteUrl: "https://because.tm",
  contactEmail: null,
  contactFormUrl: null
};

describe("OrganizationSourceRecordSchema", () => {
  it("parses a valid source record", () => {
    const record = parseOrganizationSourceRecord(validSourceRecord);
    expect(record.name).toBe("Because Music");
    expect(record.relatedOrganizations).toEqual([]);
  });

  it("rejects a record without a source URL", () => {
    expect(() =>
      parseOrganizationSourceRecord({ ...validSourceRecord, sourceUrl: undefined })
    ).toThrow();
  });

  it("rejects an invalid source URL", () => {
    expect(() => parseOrganizationSourceRecord({ ...validSourceRecord, sourceUrl: "not-a-url" })).toThrow();
  });

  it("rejects a fabricated-looking contact email that is not a valid email", () => {
    expect(() =>
      parseOrganizationSourceRecord({ ...validSourceRecord, contactEmail: "not-an-email" })
    ).toThrow();
  });

  it("accepts a null contact email to represent uncertainty", () => {
    const record = parseOrganizationSourceRecord({ ...validSourceRecord, contactEmail: null });
    expect(record.contactEmail).toBeNull();
  });
});

describe("MergedOrganizationSchema", () => {
  it("requires at least one attributed source", () => {
    expect(() =>
      MergedOrganizationSchema.parse({
        id: "org-1",
        name: "Because Music",
        organizationType: "LABEL",
        city: "Paris",
        country: "France",
        websiteUrl: "https://because.tm",
        contactEmail: null,
        contactFormUrl: null,
        sources: [],
        mergedAt: "2026-07-17T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("parses a merged organization with attributed sources", () => {
    const merged = parseMergedOrganization({
      id: "org-1",
      name: "Because Music",
      organizationType: "LABEL",
      city: "Paris",
      country: "France",
      websiteUrl: "https://because.tm",
      contactEmail: null,
      contactFormUrl: null,
      sources: [validSourceRecord],
      mergedAt: "2026-07-17T00:00:00.000Z"
    });

    expect(merged.sources).toHaveLength(1);
  });
});
