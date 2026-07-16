import { afterEach, describe, expect, it, vi } from "vitest";
import { searchMusicBrainzLabelsByName } from "../../src/sources/connectors/musicBrainzLabelConnector.js";

function responseWithJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("searchMusicBrainzLabelsByName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes a label search result into an organization source record with a source URL", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWithJson({
          labels: [{ id: "label-1", name: "Because Music", country: "FR", area: { name: "Paris" } }]
        })
      )
      .mockResolvedValueOnce(
        responseWithJson({
          id: "label-1",
          name: "Because Music",
          country: "FR",
          area: { name: "Paris" },
          relations: [
            { type: "official homepage", url: { resource: "https://because.tm" } },
            { type: "label rels", label: { name: "Because Editions" } }
          ]
        })
      );

    const records = await searchMusicBrainzLabelsByName(
      "Because Music",
      { APP_USER_AGENT: "ArtistRadar/1.0 (test)" },
      fetchImpl
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceType: "musicbrainz",
      sourceUrl: "https://musicbrainz.org/label/label-1",
      name: "Because Music",
      organizationType: "LABEL",
      city: "Paris",
      country: "France",
      websiteUrl: "https://because.tm",
      contactEmail: null,
      relatedOrganizations: ["Because Editions"]
    });
  });

  it("returns an empty list when the search request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(responseWithJson({}, 503));

    const records = await searchMusicBrainzLabelsByName("Unknown Label", {}, fetchImpl);
    expect(records).toEqual([]);
  });

  it("returns an empty list for a blank query without making a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const records = await searchMusicBrainzLabelsByName("   ", {}, fetchImpl);
    expect(records).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
