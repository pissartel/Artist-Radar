import { afterEach, describe, expect, it, vi } from "vitest";
import { enrichLabelCandidatesWithDiscogs, isDiscogsLabelEnrichmentEnabled } from "../src/labels/providers/DiscogsLabelProvider.js";
import type { RawLabelCandidate } from "../src/labels/types.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function baseCandidate(overrides: Partial<RawLabelCandidate> = {}): RawLabelCandidate {
  return {
    name: "Fake Records",
    url: "https://musicbrainz.org/label/label-1",
    sourceName: "musicbrainz",
    strategy: "similar_artist_release",
    text: "Fake Records is a record label.",
    links: [],
    confidence: 0.8,
    ...overrides
  };
}

describe("isDiscogsLabelEnrichmentEnabled", () => {
  it("is disabled without a token even if the flag is set to true", () => {
    expect(isDiscogsLabelEnrichmentEnabled({ ENABLE_DISCOGS_LABEL_ENRICHMENT: "true" })).toBe(false);
  });

  it("is enabled once a token is configured, unless explicitly disabled", () => {
    expect(isDiscogsLabelEnrichmentEnabled({ DISCOGS_TOKEN: "abc" })).toBe(true);
    expect(isDiscogsLabelEnrichmentEnabled({ DISCOGS_TOKEN: "abc", ENABLE_DISCOGS_LABEL_ENRICHMENT: "false" })).toBe(false);
  });
});

describe("enrichLabelCandidatesWithDiscogs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a no-op (failure-safe passthrough) when Discogs is not configured", async () => {
    const candidates = [baseCandidate()];
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await enrichLabelCandidatesWithDiscogs(candidates, { env: {}, fetchImpl });

    expect(result.candidates).toEqual(candidates);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("enriches a candidate with an exact Discogs label match", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 555, title: "Fake Records", type: "label" }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 555,
          name: "Fake Records",
          profile: "An independent pop punk label.",
          parent_label: { name: "Bigger Label Group" },
          sublabels: [{ name: "Fake Records Sublabel" }],
          urls: ["https://fakerecords.example"]
        })
      );

    const result = await enrichLabelCandidatesWithDiscogs([baseCandidate()], { env: { DISCOGS_TOKEN: "token-123" }, fetchImpl });

    expect(result.metadata.enriched).toBe(1);
    const enriched = result.candidates[0]!;
    expect(enriched.externalIds?.discogsId).toBe(555);
    expect(enriched.text).toContain("Parent label: Bigger Label Group");
    expect(enriched.links).toContain("https://fakerecords.example");
    expect(enriched.evidence?.some((entry) => entry.provider === "discogs")).toBe(true);
  });

  it("rejects an ambiguous match when Discogs returns multiple same-named labels", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        results: [
          { id: 1, title: "Fake Records", type: "label" },
          { id: 2, title: "Fake Records (2)", type: "label" }
        ]
      })
    );

    const result = await enrichLabelCandidatesWithDiscogs([baseCandidate()], { env: { DISCOGS_TOKEN: "token-123" }, fetchImpl });

    expect(result.metadata.ambiguousRejected).toBe(1);
    expect(result.candidates[0]!.externalIds?.discogsId).toBeUndefined();
  });

  it("leaves the candidate untouched when Discogs is rate-limited", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({}, 429));
    const candidate = baseCandidate();

    const result = await enrichLabelCandidatesWithDiscogs([candidate], { env: { DISCOGS_TOKEN: "token-123" }, fetchImpl });

    expect(result.candidates[0]).toEqual(candidate);
    expect(result.warnings).toEqual([]);
  });

  it("isolates a network failure to a single candidate without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));
    const candidate = baseCandidate();

    const result = await enrichLabelCandidatesWithDiscogs([candidate], { env: { DISCOGS_TOKEN: "token-123" }, fetchImpl });

    expect(result.candidates[0]).toEqual(candidate);
    expect(result.warnings[0]).toMatch(/network down/);
  });
});
