import { describe, expect, it } from "vitest";
import { mergeAndDeduplicateLabelCandidates } from "../src/labels/labelCandidateMerge.js";
import type { RawLabelCandidate } from "../src/labels/types.js";

function candidate(overrides: Partial<RawLabelCandidate> = {}): RawLabelCandidate {
  return {
    name: "Fake Records",
    url: null,
    sourceName: "web_search",
    strategy: "genre_specialization",
    text: "Fake Records is a record label.",
    links: [],
    confidence: 0.6,
    ...overrides
  };
}

describe("mergeAndDeduplicateLabelCandidates", () => {
  it("does not merge two distinct labels that only share a name", () => {
    const a = candidate({ name: "Impact Records", url: "https://example.test/a", confidence: 0.5 });
    const b = candidate({ name: "Impact Records", url: "https://example.test/b", confidence: 0.7 });

    const result = mergeAndDeduplicateLabelCandidates([a, b]);

    expect(result).toHaveLength(2);
  });

  it("merges candidates sharing a stable MusicBrainz ID, keeping provenance from both", () => {
    const fromMusicBrainz = candidate({
      name: "Fake Records",
      url: "https://musicbrainz.org/label/label-1",
      sourceName: "musicbrainz",
      externalIds: { musicBrainzId: "label-1" },
      evidence: [{ provider: "musicbrainz", sourceUrl: "https://musicbrainz.org/release/rel-1", similarArtistName: "Thru It All", confidence: 0.8 }]
    });
    const fromOfficialSite = candidate({
      name: "Fake Records",
      url: "https://fakerecords.example",
      sourceName: "musicbrainz",
      externalIds: { musicBrainzId: "label-1" },
      evidence: [{ provider: "official_website", sourceUrl: "https://fakerecords.example/demo", confidence: 0.85 }]
    });

    const result = mergeAndDeduplicateLabelCandidates([fromMusicBrainz, fromOfficialSite]);

    expect(result).toHaveLength(1);
    const merged = result[0]!;
    expect(merged.url).toBe("https://fakerecords.example");
    expect(merged.evidence).toHaveLength(2);
    expect(merged.evidence?.map((entry) => entry.provider).sort()).toEqual(["musicbrainz", "official_website"]);
  });

  it("merges candidates that resolve to the same official domain, when both carry structured provenance", () => {
    const a = candidate({
      name: "Fake Records",
      url: "https://fakerecords.example/news",
      externalIds: { musicBrainzId: "label-1" },
      evidence: [{ provider: "musicbrainz", sourceUrl: "https://musicbrainz.org/release/rel-1", confidence: 0.8 }]
    });
    const b = candidate({
      name: "Fake Records Official",
      url: "https://fakerecords.example/about",
      externalIds: { discogsId: 42 },
      evidence: [{ provider: "discogs", sourceUrl: "https://www.discogs.com/label/42", confidence: 0.7 }]
    });

    const result = mergeAndDeduplicateLabelCandidates([a, b]);

    expect(result).toHaveLength(1);
  });

  it("does not merge two plain web-search candidates sharing only a domain (no structured provenance)", () => {
    const a = candidate({ name: "Local Label", url: "https://example.test/local-label" });
    const b = candidate({ name: "Worldwide Label", url: "https://example.test/worldwide-label" });

    const result = mergeAndDeduplicateLabelCandidates([a, b]);

    expect(result).toHaveLength(2);
  });

  it("merges same-name candidates sharing a country", () => {
    const a = candidate({ name: "Impact Records", country: "France", confidence: 0.5 });
    const b = candidate({ name: "Impact Records", country: "France", confidence: 0.8, sourceName: "musicbrainz" });

    const result = mergeAndDeduplicateLabelCandidates([a, b]);

    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.8);
  });

  it("does not merge same-name candidates from different countries", () => {
    const a = candidate({ name: "Impact Records", country: "France" });
    const b = candidate({ name: "Impact Records", country: "Germany" });

    const result = mergeAndDeduplicateLabelCandidates([a, b]);

    expect(result).toHaveLength(2);
  });

  it("merges same-name candidates that share an overlapping roster artist", () => {
    const a = candidate({
      name: "Impact Records",
      evidence: [{ provider: "musicbrainz", sourceUrl: null, similarArtistName: "Thru It All", confidence: 0.7 }]
    });
    const b = candidate({
      name: "Impact Records",
      sourceName: "label_discovery",
      evidence: [{ provider: "web_search", sourceUrl: "https://example.test", similarArtistName: "Thru It All", confidence: 0.5 }]
    });

    const result = mergeAndDeduplicateLabelCandidates([a, b]);

    expect(result).toHaveLength(1);
  });

  it("preserves distinct candidates from MusicBrainz, Discogs-only and web search that share no evidence", () => {
    const musicBrainzOnly = candidate({ name: "Label One", externalIds: { musicBrainzId: "mb-1" } });
    const discogsOnly = candidate({ name: "Label Two", externalIds: { discogsId: 99 } });
    const webOnly = candidate({ name: "Label Three", url: "https://example.test/label-three" });

    const result = mergeAndDeduplicateLabelCandidates([musicBrainzOnly, discogsOnly, webOnly]);

    expect(result).toHaveLength(3);
  });
});
