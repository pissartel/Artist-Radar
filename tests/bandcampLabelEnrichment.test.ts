import { describe, expect, it, vi } from "vitest";
import { enrichLabelCandidatesFromOfficialSources, looksLikeBandcampLabel } from "../src/labels/officialSourceEnrichment.js";
import type { WebExtractProvider, WebExtractResult } from "../src/providers/web/WebExtractProvider.js";
import type { RawLabelCandidate } from "../src/labels/types.js";

function extractResult(url: string, text: string): WebExtractResult {
  return { url, title: null, text, markdown: null, sourceProvider: "test", statusCode: 200 };
}

function mockExtractProvider(byUrl: Record<string, string | null>): WebExtractProvider {
  return {
    providerName: "test-extract",
    async extract(url: string) {
      const text = byUrl[url];
      return text === undefined || text === null ? null : extractResult(url, text);
    }
  };
}

function baseCandidate(overrides: Partial<RawLabelCandidate> = {}): RawLabelCandidate {
  return {
    name: "Fake Records",
    url: "https://fakerecords.example",
    sourceName: "musicbrainz",
    strategy: "similar_artist_release",
    text: "Fake Records is a record label.",
    links: [],
    confidence: 0.8,
    ...overrides
  };
}

describe("looksLikeBandcampLabel", () => {
  it("requires at least two independent label signals", () => {
    expect(looksLikeBandcampLabel("This is my music, listen to my new single.")).toBe(false);
    expect(looksLikeBandcampLabel("An independent label with our roster of artists.")).toBe(true);
    expect(looksLikeBandcampLabel("Various Artists compilation, catalogue number FR001.")).toBe(true);
  });

  it("does not classify a lone mention of 'label' as enough evidence", () => {
    expect(looksLikeBandcampLabel("Check out my clothing label merch drop.")).toBe(false);
  });
});

describe("enrichLabelCandidatesFromOfficialSources", () => {
  it("extracts priority pages from an official homepage and merges evidence", async () => {
    const provider = mockExtractProvider({
      "https://fakerecords.example": "Fake Records official site.",
      "https://fakerecords.example/about": "About Fake Records, founded in 2015.",
      "https://fakerecords.example/roster": "Our roster includes several pop punk artists."
    });

    const result = await enrichLabelCandidatesFromOfficialSources([baseCandidate()], {
      webExtractProvider: provider,
      maxPagesPerLabel: 3
    });

    const enriched = result.candidates[0]!;
    expect(enriched.text).toContain("founded in 2015");
    expect(enriched.text).toContain("roster includes");
    expect(enriched.links).toContain("https://fakerecords.example/about");
    expect(enriched.evidence?.filter((entry) => entry.provider === "official_website").length).toBeGreaterThan(0);
    expect(result.metadata.pagesExtracted).toBeGreaterThan(0);
  });

  it("accepts a Bandcamp page carrying multiple independent label signals", async () => {
    const candidate = baseCandidate({
      url: null,
      links: ["https://fakerecords.bandcamp.com"]
    });
    const provider = mockExtractProvider({
      "https://fakerecords.bandcamp.com": "Fake Records is an independent record label. Browse our roster of artists below."
    });

    const result = await enrichLabelCandidatesFromOfficialSources([candidate], { webExtractProvider: provider });

    const enriched = result.candidates[0]!;
    expect(enriched.evidence?.some((entry) => entry.provider === "bandcamp")).toBe(true);
    expect(result.metadata.bandcampRejected).toBe(0);
  });

  it("rejects a single-artist Bandcamp page lacking label evidence", async () => {
    const candidate = baseCandidate({
      url: null,
      links: ["https://onepersonband.bandcamp.com"]
    });
    const provider = mockExtractProvider({
      "https://onepersonband.bandcamp.com": "Listen to my new single, out now. Thanks for the support!"
    });

    const result = await enrichLabelCandidatesFromOfficialSources([candidate], { webExtractProvider: provider });

    const enriched = result.candidates[0]!;
    expect(enriched.evidence?.some((entry) => entry.provider === "bandcamp")).toBeFalsy();
    expect(result.metadata.bandcampRejected).toBe(1);
  });

  it("trusts a Bandcamp page already backed by MusicBrainz relationship evidence, skipping the heuristic gate", async () => {
    const candidate = baseCandidate({
      url: null,
      links: ["https://fakerecords.bandcamp.com"],
      externalIds: { musicBrainzId: "label-1" },
      evidence: [{ provider: "musicbrainz", sourceUrl: "https://musicbrainz.org/label/label-1", confidence: 0.8 }]
    });
    const provider = mockExtractProvider({
      "https://fakerecords.bandcamp.com": "Listen to our latest drop."
    });

    const result = await enrichLabelCandidatesFromOfficialSources([candidate], { webExtractProvider: provider });

    const enriched = result.candidates[0]!;
    expect(enriched.evidence?.some((entry) => entry.provider === "bandcamp")).toBe(true);
    expect(result.metadata.bandcampRejected).toBe(0);
  });

  it("skips Bandcamp entirely when ENABLE_BANDCAMP_LABEL_ENRICHMENT=false, but still enriches the official site", async () => {
    const candidate = baseCandidate({ links: ["https://fakerecords.bandcamp.com"] });
    const extract = vi.fn(async (url: string) => (url === "https://fakerecords.example" ? extractResult(url, "Fake Records official site.") : null));
    const provider: WebExtractProvider = { providerName: "test-extract", extract };

    await enrichLabelCandidatesFromOfficialSources([candidate], {
      webExtractProvider: provider,
      env: { ENABLE_BANDCAMP_LABEL_ENRICHMENT: "false" }
    });

    expect(extract).not.toHaveBeenCalledWith("https://fakerecords.bandcamp.com");
  });

  it("is a passthrough when no web extract provider is configured", async () => {
    const candidates = [baseCandidate()];
    const result = await enrichLabelCandidatesFromOfficialSources(candidates, { webExtractProvider: null });

    expect(result.candidates).toEqual(candidates);
    expect(result.metadata.pagesExtracted).toBe(0);
  });
});
