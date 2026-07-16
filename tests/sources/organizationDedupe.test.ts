import { describe, expect, it } from "vitest";
import {
  computeOrganizationDedupeKey,
  mergeOrganizationSourceRecords,
  pickCanonicalOrganizationFields
} from "../../src/sources/organizationDedupe.js";
import type { OrganizationSourceRecord } from "../../src/sources/organization.schema.js";

function record(overrides: Partial<OrganizationSourceRecord>): OrganizationSourceRecord {
  return {
    sourceType: "musicbrainz",
    sourceName: "MusicBrainz",
    sourceUrl: "https://musicbrainz.org/label/abc-123",
    extractedAt: "2026-07-17T00:00:00.000Z",
    reliabilityScore: 0.75,
    name: "Because Music",
    organizationType: "LABEL",
    city: "Paris",
    country: "France",
    websiteUrl: null,
    contactEmail: null,
    contactFormUrl: null,
    relatedOrganizations: [],
    notes: null,
    ...overrides
  };
}

describe("computeOrganizationDedupeKey", () => {
  it("normalizes case, diacritics and whitespace", () => {
    const a = computeOrganizationDedupeKey("Because Music", "Paris", "France");
    const b = computeOrganizationDedupeKey("  BECAUSE   MUSIC ", "paris", "france");
    expect(a).toBe(b);
  });

  it("treats accented and unaccented names as the same key", () => {
    const a = computeOrganizationDedupeKey("Écurie Records", "Lyon", "France");
    const b = computeOrganizationDedupeKey("Ecurie Records", "Lyon", "France");
    expect(a).toBe(b);
  });

  it("produces different keys for different cities", () => {
    const a = computeOrganizationDedupeKey("Because Music", "Paris", "France");
    const b = computeOrganizationDedupeKey("Because Music", "Lyon", "France");
    expect(a).not.toBe(b);
  });
});

describe("mergeOrganizationSourceRecords", () => {
  it("keeps records from distinct source URLs", () => {
    const existing = [record({ sourceUrl: "https://musicbrainz.org/label/abc-123" })];
    const incoming = [record({ sourceType: "wikidata", sourceUrl: "https://www.wikidata.org/wiki/Q1" })];

    const merged = mergeOrganizationSourceRecords(existing, incoming);
    expect(merged).toHaveLength(2);
  });

  it("replaces the record for a re-imported source URL instead of duplicating it", () => {
    const existing = [record({ sourceUrl: "https://musicbrainz.org/label/abc-123", city: "Paris" })];
    const incoming = [record({ sourceUrl: "https://musicbrainz.org/label/abc-123", city: "Lyon" })];

    const merged = mergeOrganizationSourceRecords(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.city).toBe("Lyon");
  });
});

describe("pickCanonicalOrganizationFields", () => {
  it("prefers the field values of the highest-reliability source", () => {
    const sources = [
      record({ sourceUrl: "https://directory.example.com/because", sourceType: "trusted_directory", reliabilityScore: 0.9, city: "Paris" }),
      record({ sourceUrl: "https://musicbrainz.org/label/abc-123", reliabilityScore: 0.75, city: "Lyon" })
    ];

    const canonical = pickCanonicalOrganizationFields(sources);
    expect(canonical.city).toBe("Paris");
  });

  it("falls back to lower-reliability values for fields the top source leaves null (conflict preserved via attribution)", () => {
    const sources = [
      record({
        sourceUrl: "https://directory.example.com/because",
        sourceType: "trusted_directory",
        reliabilityScore: 0.9,
        contactEmail: null
      }),
      record({
        sourceUrl: "https://musicbrainz.org/label/abc-123",
        reliabilityScore: 0.75,
        contactEmail: "bookings@because.tm"
      })
    ];

    const canonical = pickCanonicalOrganizationFields(sources);
    expect(canonical.contactEmail).toBe("bookings@because.tm");
    expect(sources.map((source) => source.contactEmail)).toContain(null);
  });
});
