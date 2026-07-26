import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverLabelCandidatesFromMusicBrainz,
  matchMusicBrainzArtist,
  resetMusicBrainzLabelProviderCaches
} from "../src/labels/providers/MusicBrainzLabelProvider.js";
import { TtlCache } from "../src/utils/ttlCache.js";
import type { LabelSearchInput } from "../src/labels/types.js";
import type { SimilarArtist } from "../src/schemas.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function similarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return {
    name: "Thru It All",
    url: null,
    spotifyId: null,
    genres: ["pop punk"],
    city: null,
    country: "France",
    source: "mock",
    sources: ["mock"],
    reason: "test fixture",
    confidence: 0.9,
    artistTier: "small",
    bookingCategory: "local_peer",
    estimatedFollowers: null,
    estimatedPopularity: null,
    sizeSignalSource: "manual",
    genreRelevance: 90,
    localRelevance: 0,
    sizeRelevance: 0,
    sceneRelevance: 0,
    totalRelevance: 90,
    relevanceToUserArtist: 90,
    possibleUse: "booking_research",
    estimatedLevel: "emerging",
    evidenceNotes: [],
    sourceUrls: [],
    genreEvidence: [],
    locationEvidence: [],
    sizeEvidence: [],
    verificationStatus: "verified",
    popularity: { estimatedLevel: "small", confidence: 0.8, sizeSignalSource: "manual", platforms: {} },
    discardedTags: [],
    spotify: null,
    imageUrl: null,
    imageSource: null,
    imageConfidence: null,
    ...overrides
  } as SimilarArtist;
}

const baseInput: LabelSearchInput = {
  artist: "Tuesday Fall",
  city: "Paris",
  genre: "pop punk",
  target: "France",
  limit: 10
};

function fetchByUrlPattern(handlers: Array<{ match: RegExp; response: () => Response }>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const handler = handlers.find((entry) => entry.match.test(url));
    if (!handler) {
      throw new Error(`Unexpected MusicBrainz request: ${url}`);
    }
    return handler.response();
  }) as unknown as typeof fetch;
}

describe("matchMusicBrainzArtist", () => {
  it("resolves an exact-name artist match with high confidence", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: "a1", name: "Thru It All", score: 100 }] }));

    const match = await matchMusicBrainzArtist({ name: "Thru It All", country: "France" }, {}, fetchImpl);

    expect(match?.musicBrainzId).toBe("a1");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("rejects an ambiguous same-name artist without a corroborating signal", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        artists: [
          { id: "a1", name: "The Distance", score: 80, country: null },
          { id: "a2", name: "The Distance", score: 79, country: null }
        ]
      })
    );

    const match = await matchMusicBrainzArtist({ name: "The Distance", country: "France" }, {}, fetchImpl);

    expect(match).toBeNull();
  });

  it("retries once after a 429 rate-limit response and then succeeds", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({}, 429))
        .mockResolvedValueOnce(jsonResponse({ artists: [{ id: "a1", name: "Thru It All", score: 100 }] }));

      const promise = matchMusicBrainzArtist({ name: "Thru It All", country: null }, {}, fetchImpl);
      await vi.advanceTimersByTimeAsync(2000);
      const match = await promise;

      expect(match?.musicBrainzId).toBe("a1");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("discoverLabelCandidatesFromMusicBrainz", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers a label credited on a similar artist's release, preserving artist/release provenance", async () => {
    const fetchImpl = fetchByUrlPattern([
      { match: /\/ws\/2\/artist\?/, response: () => jsonResponse({ artists: [{ id: "a1", name: "Thru It All", score: 100 }] }) },
      {
        match: /\/ws\/2\/release\?/,
        response: () =>
          jsonResponse({
            releases: [{ id: "rel-1", title: "Debut EP", date: "2023-05-01", "label-info": [{ label: { id: "label-1", name: "Fake Records" } }] }]
          })
      },
      {
        match: /\/ws\/2\/label\/label-1/,
        response: () =>
          jsonResponse({
            id: "label-1",
            name: "Fake Records",
            country: "FR",
            type: "Independent",
            "life-span": { begin: "2015", end: null, ended: false },
            disambiguation: "French pop punk label",
            relations: [{ type: "official homepage", url: { resource: "https://fakerecords.example" } }]
          })
      }
    ]);

    const result = await discoverLabelCandidatesFromMusicBrainz(
      { ...baseInput, similarArtists: [similarArtist()] },
      {
        fetchImpl,
        env: { ENABLE_MUSICBRAINZ_LABEL_DISCOVERY: "true" },
        artistMatchCache: new TtlCache(60_000),
        releaseCache: new TtlCache(60_000),
        labelCache: new TtlCache(60_000)
      }
    );

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0]!;
    expect(candidate.name).toBe("Fake Records");
    expect(candidate.url).toBe("https://fakerecords.example");
    expect(candidate.country).toBe("France");
    expect(candidate.externalIds?.musicBrainzId).toBe("label-1");
    expect(candidate.evidence?.[0]).toMatchObject({
      provider: "musicbrainz",
      similarArtistName: "Thru It All",
      releaseTitle: "Debut EP",
      releaseId: "rel-1"
    });
    expect(candidate.text).toContain("Thru It All");
    expect(candidate.text).toContain("Debut EP");
  });

  it("does not produce a candidate from a release with no credited label", async () => {
    const fetchImpl = fetchByUrlPattern([
      { match: /\/ws\/2\/artist\?/, response: () => jsonResponse({ artists: [{ id: "a1", name: "Thru It All", score: 100 }] }) },
      { match: /\/ws\/2\/release\?/, response: () => jsonResponse({ releases: [{ id: "rel-1", title: "Self-released Single", "label-info": [] }] }) }
    ]);

    const result = await discoverLabelCandidatesFromMusicBrainz(
      { ...baseInput, similarArtists: [similarArtist()] },
      {
        fetchImpl,
        env: { ENABLE_MUSICBRAINZ_LABEL_DISCOVERY: "true" },
        artistMatchCache: new TtlCache(60_000),
        releaseCache: new TtlCache(60_000),
        labelCache: new TtlCache(60_000)
      }
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.metadata.releasesInspected).toBe(1);
  });

  it("merges evidence when a label is credited across multiple similar artists, looking it up only once", async () => {
    const labelLookupCalls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/ws/2/artist") && url.includes("Artist+A")) {
        return jsonResponse({ artists: [{ id: "a1", name: "Artist A", score: 100 }] });
      }
      if (url.includes("/ws/2/artist") && url.includes("Artist+B")) {
        return jsonResponse({ artists: [{ id: "b1", name: "Artist B", score: 100 }] });
      }
      if (/\/ws\/2\/release\?artist=a1/.test(url)) {
        return jsonResponse({ releases: [{ id: "rel-a", title: "Artist A EP", "label-info": [{ label: { id: "label-1", name: "Shared Label" } }] }] });
      }
      if (/\/ws\/2\/release\?artist=b1/.test(url)) {
        return jsonResponse({ releases: [{ id: "rel-b", title: "Artist B EP", "label-info": [{ label: { id: "label-1", name: "Shared Label" } }] }] });
      }
      if (/\/ws\/2\/label\/label-1/.test(url)) {
        labelLookupCalls.push(url);
        return jsonResponse({ id: "label-1", name: "Shared Label", country: "FR" });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const result = await discoverLabelCandidatesFromMusicBrainz(
      {
        ...baseInput,
        similarArtists: [similarArtist({ name: "Artist A" }), similarArtist({ name: "Artist B" })]
      },
      {
        fetchImpl,
        env: { ENABLE_MUSICBRAINZ_LABEL_DISCOVERY: "true" },
        artistMatchCache: new TtlCache(60_000),
        releaseCache: new TtlCache(60_000),
        labelCache: new TtlCache(60_000)
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(labelLookupCalls).toHaveLength(1);
    const evidenceArtists = result.candidates[0]!.evidence?.map((entry) => entry.similarArtistName);
    expect(evidenceArtists).toContain("Artist A");
    expect(evidenceArtists).toContain("Artist B");
  });

  it("reuses cached lookups across separate discovery calls", async () => {
    resetMusicBrainzLabelProviderCaches();
    const fetchImpl = fetchByUrlPattern([
      { match: /\/ws\/2\/artist\?/, response: () => jsonResponse({ artists: [{ id: "a1", name: "Thru It All", score: 100 }] }) },
      {
        match: /\/ws\/2\/release\?/,
        response: () => jsonResponse({ releases: [{ id: "rel-1", title: "Debut EP", "label-info": [{ label: { id: "label-1", name: "Fake Records" } }] }] })
      },
      { match: /\/ws\/2\/label\/label-1/, response: () => jsonResponse({ id: "label-1", name: "Fake Records", country: "FR" }) }
    ]);

    await discoverLabelCandidatesFromMusicBrainz(
      { ...baseInput, similarArtists: [similarArtist()] },
      { fetchImpl, env: { ENABLE_MUSICBRAINZ_LABEL_DISCOVERY: "true" } }
    );
    await discoverLabelCandidatesFromMusicBrainz(
      { ...baseInput, similarArtists: [similarArtist()] },
      { fetchImpl, env: { ENABLE_MUSICBRAINZ_LABEL_DISCOVERY: "true" } }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("is a no-op when disabled via ENABLE_MUSICBRAINZ_LABEL_DISCOVERY=false", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await discoverLabelCandidatesFromMusicBrainz(
      { ...baseInput, similarArtists: [similarArtist()] },
      { fetchImpl, env: { ENABLE_MUSICBRAINZ_LABEL_DISCOVERY: "false" } }
    );

    expect(result.candidates).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
