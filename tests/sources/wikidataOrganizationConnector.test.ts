import { describe, expect, it, vi } from "vitest";
import { searchWikidataOrganizationsByName } from "../../src/sources/connectors/wikidataOrganizationConnector.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("searchWikidataOrganizationsByName", () => {
  it("normalizes a Wikidata organization into a source record with resolved city/country", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWithJson({
          search: [{ id: "Q1758864", label: "Because Music", description: "French record label" }]
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          entities: {
            Q1758864: {
              labels: { en: { value: "Because Music" } },
              descriptions: { en: { value: "French record label" } },
              claims: {
                P17: [{ mainsnak: { datavalue: { value: { id: "Q142" } } } }],
                P131: [{ mainsnak: { datavalue: { value: { id: "Q90" } } } }],
                P856: [{ mainsnak: { datavalue: { value: "https://because.tm" } } }]
              }
            }
          }
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          entities: {
            Q142: { labels: { en: { value: "France" } } },
            Q90: { labels: { en: { value: "Paris" } } }
          }
        })
      );

    const records = await searchWikidataOrganizationsByName("Because Music", fetchImpl);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceType: "wikidata",
      sourceUrl: "https://www.wikidata.org/wiki/Q1758864",
      name: "Because Music",
      organizationType: "LABEL",
      city: "Paris",
      country: "France",
      websiteUrl: "https://because.tm"
    });
  });

  it("returns an empty list when there is no match", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(responseWithJson({ search: [] }));

    const records = await searchWikidataOrganizationsByName("Nonexistent Org Xyz", fetchImpl);
    expect(records).toEqual([]);
  });

  it("returns an empty list for a blank query without making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const records = await searchWikidataOrganizationsByName("   ", fetchImpl);
    expect(records).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("infers a venue organization type from the description", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWithJson({
          search: [{ id: "Q123", label: "Le Klub", description: "music venue in Paris" }]
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          entities: {
            Q123: {
              labels: { en: { value: "Le Klub" } },
              descriptions: { en: { value: "music venue in Paris" } },
              claims: {}
            }
          }
        })
      );

    const records = await searchWikidataOrganizationsByName("Le Klub", fetchImpl);
    expect(records[0]?.organizationType).toBe("VENUE");
    expect(records[0]?.city).toBeNull();
  });
});
