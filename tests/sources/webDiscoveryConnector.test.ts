import { describe, expect, it } from "vitest";
import { discoverOrganizationsFromWeb } from "../../src/sources/connectors/webDiscoveryConnector.js";
import type { WebExtractProvider } from "../../src/providers/web/WebExtractProvider.js";
import type { WebSearchOptions, WebSearchProvider, WebSearchResult } from "../../src/providers/web/WebSearchProvider.js";

function stubSearchProvider(resultsByQuery: Record<string, WebSearchResult[]>): WebSearchProvider {
  return {
    providerName: "stub",
    async search(query: string, _options?: WebSearchOptions): Promise<WebSearchResult[]> {
      return resultsByQuery[query] ?? [];
    }
  };
}

const context = {
  genres: ["pop punk"],
  artistCity: "Bordeaux",
  artistCountry: "France"
};

describe("discoverOrganizationsFromWeb", () => {
  it("accepts a search result with a traceable official site and extracts services/genres/territory/evidence", async () => {
    const searchProvider = stubSearchProvider({
      "pop punk booking agency Bordeaux": [
        {
          title: "Exemple Booking Agency",
          url: "https://exemple-booking.fr",
          snippet: "Booking agency for pop punk and emo bands, based in Bordeaux, touring France.",
          sourceProvider: "stub",
          confidence: 0.8,
          links: []
        }
      ]
    });

    const result = await discoverOrganizationsFromWeb(context, {
      searchProvider,
      maxResultsPerQuery: 5
    });

    expect(result.warnings).toEqual([]);
    const record = result.records.find((entry) => entry.sourceUrl === "https://exemple-booking.fr");
    expect(record).toBeDefined();
    expect(record?.organizationType).toBe("BOOKER");
    expect(record?.genres).toEqual(expect.arrayContaining(["pop punk"]));
    expect(record?.territories).toEqual(expect.arrayContaining(["Bordeaux", "France"]));
    expect(record?.evidence.length).toBeGreaterThan(0);
    expect(record?.contactEmail).toBeNull();
  });

  it("rejects a result with no URL (no traceable official source)", async () => {
    const searchProvider = stubSearchProvider({
      "pop punk booking agency Bordeaux": [
        { title: "No link", url: null, snippet: "booking agency", sourceProvider: "stub", confidence: 0.8 }
      ]
    });

    const result = await discoverOrganizationsFromWeb(context, { searchProvider });
    expect(result.records).toEqual([]);
  });

  it("rejects a result from a known generic directory/aggregator domain", async () => {
    const searchProvider = stubSearchProvider({
      "pop punk booking agency Bordeaux": [
        {
          title: "Some page",
          url: "https://www.facebook.com/some-agency",
          snippet: "booking agency",
          sourceProvider: "stub",
          confidence: 0.8
        }
      ]
    });

    const result = await discoverOrganizationsFromWeb(context, { searchProvider });
    expect(result.records).toEqual([]);
  });

  it("rejects a result that cannot be classified from either page content or a query hint", async () => {
    const searchProvider = stubSearchProvider({
      "Exemple Fest organizer contact": [
        {
          title: "Random unrelated page",
          url: "https://random-example.fr",
          snippet: "Contact us for more information.",
          sourceProvider: "stub",
          confidence: 0.8
        }
      ]
    });

    const result = await discoverOrganizationsFromWeb(
      { ...context, genres: [], artistCity: null, artistCountry: null, knownOrganizationNames: ["Exemple Fest"] },
      { searchProvider }
    );
    expect(result.records).toEqual([]);
  });

  it("marks a result as low confidence when the discovery query's type hint is not confirmed by page content", async () => {
    const searchProvider = stubSearchProvider({
      "pop punk booking agency Bordeaux": [
        {
          title: "Unconfirmed page",
          url: "https://unconfirmed-example.fr",
          snippet: "Contact us for more information.",
          sourceProvider: "stub",
          confidence: 0.8
        }
      ]
    });

    const result = await discoverOrganizationsFromWeb(context, { searchProvider });
    const record = result.records.find((entry) => entry.sourceUrl === "https://unconfirmed-example.fr");
    expect(record?.organizationType).toBe("BOOKER");
    expect(record?.reliabilityScore).toBeLessThan(0.35);
    expect(record?.evidence[0]).toContain("not confirmed by page content");
  });

  it("only extracts a contact email if one literally appears in the page text, never fabricating one", async () => {
    const searchProvider = stubSearchProvider({
      "pop punk booking agency Bordeaux": [
        {
          title: "Exemple Booking Agency",
          url: "https://exemple-booking.fr",
          snippet: "Booking agency for pop punk bands. Contact booking@exemple-booking.fr for shows.",
          sourceProvider: "stub",
          confidence: 0.8
        }
      ]
    });

    const result = await discoverOrganizationsFromWeb(context, { searchProvider });
    const record = result.records.find((entry) => entry.sourceUrl === "https://exemple-booking.fr");
    expect(record?.contactEmail).toBe("booking@exemple-booking.fr");
  });

  it("gives a higher reliability score when the official site was visited and verified", async () => {
    const searchProvider = stubSearchProvider({
      "pop punk booking agency Bordeaux": [
        {
          title: "Exemple Booking Agency",
          url: "https://exemple-booking.fr",
          snippet: "booking agency",
          sourceProvider: "stub",
          confidence: 0.8
        }
      ]
    });

    const extractProvider: WebExtractProvider = {
      providerName: "stub-extract",
      async extract(url: string) {
        return {
          url,
          title: "Exemple Booking Agency",
          text: "We are a booking agency for pop punk bands based in Bordeaux.",
          markdown: null,
          sourceProvider: "stub-extract",
          statusCode: 200
        };
      }
    };

    const withoutExtract = await discoverOrganizationsFromWeb(context, { searchProvider });
    const withExtract = await discoverOrganizationsFromWeb(context, { searchProvider, extractProvider });

    const scoreWithout = withoutExtract.records[0]?.reliabilityScore ?? 0;
    const scoreWith = withExtract.records[0]?.reliabilityScore ?? 0;
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it("records a warning and continues when the search provider throws", async () => {
    const searchProvider: WebSearchProvider = {
      providerName: "stub",
      async search() {
        throw new Error("provider unavailable");
      }
    };

    const result = await discoverOrganizationsFromWeb(context, { searchProvider });
    expect(result.records).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("provider unavailable"))).toBe(true);
  });
});
