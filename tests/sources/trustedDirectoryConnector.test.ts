import { describe, expect, it } from "vitest";
import { importTrustedDirectoryOrganizations } from "../../src/sources/connectors/trustedDirectoryConnector.js";
import type { TrustedOrganizationSeed } from "../../src/sources/config/trustedOrganizations.js";

const seed: TrustedOrganizationSeed = {
  name: "Example Music Industry Association",
  organizationType: "ASSOCIATION",
  sourceUrl: "https://example-association.org/about",
  websiteUrl: "https://example-association.org",
  city: "Paris",
  country: "France",
  contactEmail: "contact@example-association.org"
};

describe("importTrustedDirectoryOrganizations", () => {
  it("maps configured trusted directory seeds into organization source records", () => {
    const records = importTrustedDirectoryOrganizations([seed]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceType: "trusted_directory",
      sourceUrl: "https://example-association.org/about",
      name: "Example Music Industry Association",
      organizationType: "ASSOCIATION",
      contactEmail: "contact@example-association.org"
    });
  });

  it("falls back to the source URL for the website when none is provided", () => {
    const [record] = importTrustedDirectoryOrganizations([{ ...seed, websiteUrl: undefined }]);
    expect(record?.websiteUrl).toBe(seed.sourceUrl);
  });

  it("returns an empty list for an empty seed list", () => {
    expect(importTrustedDirectoryOrganizations([])).toEqual([]);
  });

  it("rejects a seed without a source URL", () => {
    expect(() => importTrustedDirectoryOrganizations([{ ...seed, sourceUrl: "" }])).toThrow();
  });
});
