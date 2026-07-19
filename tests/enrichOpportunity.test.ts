import { describe, expect, it, vi } from "vitest";
import { clearEnrichmentCache, enrichOpportunity, refreshOpportunityEnrichment } from "../src/enrichment/enrichOpportunity.js";
import type { EnrichableOpportunity } from "../src/enrichment/types.js";
import type { WebExtractProvider, WebExtractResult } from "../src/providers/web/WebExtractProvider.js";

function buildProvider(result: WebExtractResult | null): WebExtractProvider {
  return {
    providerName: "fake",
    extract: vi.fn(async () => result)
  };
}

const baseOpportunity: EnrichableOpportunity = {
  name: "Le Petit Club",
  sourceUrl: "https://lepetitclub.test/programmation",
  sourceType: "venue_official_programming_page",
  contacts: [],
  eventDate: "2026-09-12"
};

describe("enrichOpportunity", () => {
  it("marks details unavailable rather than generated when there is no source URL", async () => {
    clearEnrichmentCache();
    const result = await enrichOpportunity(
      { ...baseOpportunity, sourceUrl: null },
      { webExtractProvider: buildProvider(null), now: new Date("2026-07-20T00:00:00Z") }
    );

    expect(result.sourcePage.value).toBeNull();
    expect(result.officialWebsite.value).toBeNull();
    expect(result.contacts).toEqual([]);
    expect(result.warnings).toContain("No source URL available; contact details could not be verified.");
  });

  it("extracts and classifies contacts found on the fetched source page, with their source", async () => {
    clearEnrichmentCache();
    const markdown = [
      "# Le Petit Club",
      "Booking / Programmation: booking@lepetitclub.test",
      "Press contact: press@lepetitclub.test",
      "Lineup: Band A, Band B, Band C",
      "12 rue de la Paix, 75002 Paris",
      "Send your demo to book with us for next season.",
      "[Buy tickets](https://lepetitclub.test/tickets)",
      "[Instagram](https://instagram.com/lepetitclub)"
    ].join("\n");
    const provider = buildProvider({
      url: baseOpportunity.sourceUrl!,
      title: "Le Petit Club",
      text: markdown,
      markdown,
      sourceProvider: "fake",
      statusCode: 200
    });

    const result = await enrichOpportunity(baseOpportunity, {
      webExtractProvider: provider,
      now: new Date("2026-07-20T00:00:00Z")
    });

    const booking = result.contacts.find((c) => c.value === "booking@lepetitclub.test");
    const press = result.contacts.find((c) => c.value === "press@lepetitclub.test");
    expect(booking).toMatchObject({ role: "BOOKING", verified: true, sourceUrl: baseOpportunity.sourceUrl });
    expect(press).toMatchObject({ role: "PRESS", verified: true });

    expect(result.officialWebsite).toEqual({ value: baseOpportunity.sourceUrl, verified: true, sourceUrl: baseOpportunity.sourceUrl });
    expect(result.socialProfiles).toEqual([
      { value: "https://instagram.com/lepetitclub", verified: true, sourceUrl: baseOpportunity.sourceUrl }
    ]);
    expect(result.ticketUrl).toEqual({ value: "https://lepetitclub.test/tickets", verified: true, sourceUrl: baseOpportunity.sourceUrl });
    expect(result.headliner.value).toEqual(["Band A", "Band B", "Band C"]);
    expect(result.venueAddress.verified).toBe(true);
    expect(result.venueAddress.value).toContain("rue de la Paix");
    expect(result.bookingInstructions.verified).toBe(true);
    expect(result.lastVerifiedAt).toBe("2026-07-20T00:00:00.000Z");
  });

  it("never invents a contact address that is not explicitly published on the page", async () => {
    clearEnrichmentCache();
    const markdown = "# Le Petit Club\nNo public email is listed on this page.";
    const provider = buildProvider({
      url: baseOpportunity.sourceUrl!,
      title: "Le Petit Club",
      text: markdown,
      markdown,
      sourceProvider: "fake",
      statusCode: 200
    });

    const result = await enrichOpportunity(baseOpportunity, { webExtractProvider: provider });

    expect(result.contacts).toEqual([]);
  });

  it("keeps previously known contacts visible but marks them unverified when the page can't be reconfirmed", async () => {
    clearEnrichmentCache();
    const opportunityWithKnownContact: EnrichableOpportunity = {
      ...baseOpportunity,
      contacts: [
        { type: "email", value: "booking@lepetitclub.test", sourceUrl: baseOpportunity.sourceUrl, confidence: 0.9, notes: "Likely booking or programming contact." }
      ]
    };

    const result = await enrichOpportunity(opportunityWithKnownContact, {
      webExtractProvider: buildProvider(null)
    });

    expect(result.contacts).toEqual([
      {
        type: "email",
        value: "booking@lepetitclub.test",
        role: "BOOKING",
        sourceUrl: baseOpportunity.sourceUrl,
        verified: false,
        notes: "Likely booking or programming contact."
      }
    ]);
  });

  it("caches the enrichment result and only refetches on refresh", async () => {
    clearEnrichmentCache();
    const provider = buildProvider({
      url: baseOpportunity.sourceUrl!,
      title: "Le Petit Club",
      text: "# Le Petit Club",
      markdown: "# Le Petit Club",
      sourceProvider: "fake",
      statusCode: 200
    });

    await enrichOpportunity(baseOpportunity, { webExtractProvider: provider });
    await enrichOpportunity(baseOpportunity, { webExtractProvider: provider });
    expect(provider.extract).toHaveBeenCalledTimes(1);

    await refreshOpportunityEnrichment(baseOpportunity, { webExtractProvider: provider });
    expect(provider.extract).toHaveBeenCalledTimes(2);
  });
});
