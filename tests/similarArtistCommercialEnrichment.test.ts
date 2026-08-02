import { describe, expect, it, vi } from "vitest";
import { enrichSimilarArtistsWithChartmetric } from "../src/modules/similarArtistCommercialEnrichment.js";
import { SimilarArtistSchema, type ArtistProfile, type SimilarArtist } from "../src/schemas.js";
import { groupSimilarArtistsByTier, type SimilarArtistsByTier } from "../src/modules/similarArtistsFinder.js";
import type { SimilarArtistCandidateEnrichmentResult } from "../src/features/artist-enrichment/chartmetric/chartmetric.types.js";
import type { SimilarArtistCandidateEnrichmentProvider } from "../src/modules/similarArtistCommercialEnrichment.js";

function buildArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return SimilarArtistSchema.parse({
    name: "Broad Peak",
    url: null,
    spotifyId: null,
    genres: ["post-rock"],
    city: "Lyon",
    country: "France",
    source: "seed",
    reason: "genre match",
    confidence: 0.7,
    artistTier: "medium",
    bookingCategory: "local_peer",
    estimatedFollowers: 5000,
    estimatedPopularity: 30,
    sizeSignalSource: "spotify_artist",
    genreRelevance: 80,
    sceneRelevance: 70,
    sizeRelevance: 60,
    totalRelevance: 75,
    relevanceToUserArtist: 75,
    possibleUse: "co_bill",
    estimatedLevel: "developing",
    ...overrides
  });
}

const PROFILE: ArtistProfile = {
  artistName: "Main Artist",
  city: "Lyon",
  country: "France",
  genres: ["post-rock"],
  spotifyGenres: [],
  socialLinks: {},
  platformStats: {},
  estimatedLevel: "developing",
  confidence: 0.8,
  notes: [],
  spotify: { id: "main1", url: null, imageUrl: null, followers: 8000, popularity: 40, genres: [] },
  imageUrl: null,
  imageSource: null,
  imageConfidence: null
};

function fakeProvider(results: SimilarArtistCandidateEnrichmentResult[]): SimilarArtistCandidateEnrichmentProvider {
  return { enrichCandidates: vi.fn().mockResolvedValue(results) };
}

describe("enrichSimilarArtistsWithChartmetric", () => {
  it("is structurally additive: every original identity/platform/ranking field survives byte-for-byte, spread first and never reconstructed", async () => {
    const original = buildArtist({
      name: "Broad Peak",
      url: "https://example.test/broad-peak",
      spotifyId: "broad-peak-spotify-id",
      spotifyUrl: "https://open.spotify.com/artist/broad-peak-spotify-id",
      instagramUrl: "https://instagram.com/broadpeak",
      youtubeUrl: "https://youtube.com/@broadpeak",
      genres: ["post-rock", "shoegaze"],
      city: "Lyon",
      country: "France",
      source: "spotify_search",
      sources: ["spotify_search", "musicbrainz"],
      bookingCategory: "local_peer",
      estimatedFollowers: 5000,
      estimatedPopularity: 30,
      totalRelevance: 75,
      relevanceToUserArtist: 75,
      genreRelevance: 80,
      sceneRelevance: 70,
      sizeRelevance: 60,
      imageUrl: "https://images.example.test/broad-peak.jpg",
      imageSource: "spotify",
      imageConfidence: 0.9,
      spotify: {
        id: "broad-peak-spotify-id",
        url: "https://open.spotify.com/artist/broad-peak-spotify-id",
        imageUrl: "https://images.example.test/broad-peak.jpg",
        followers: 5000,
        popularity: 30,
        genres: ["post-rock", "shoegaze"]
      }
    });
    const grouped = groupSimilarArtistsByTier([original]);
    const provider = fakeProvider([{ provider: "chartmetric", candidateName: "Broad Peak", status: "not_found" }]);

    const result = await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: grouped, provider });
    const enriched = result.local_peer[0]!;

    // Every field on the original artist must be preserved unchanged —
    // additive merge only ever adds chartmetric/commercial* keys on top.
    for (const [key, value] of Object.entries(original)) {
      if (key.startsWith("commercial") || key === "chartmetric" || key === "chartmetricDiagnostics") {
        continue;
      }
      expect((enriched as unknown as Record<string, unknown>)[key]).toEqual(value);
    }
  });

  it("returns the original groups unchanged when there are no candidates", async () => {
    const empty: SimilarArtistsByTier = groupSimilarArtistsByTier([]);
    const provider = fakeProvider([]);

    const result = await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: empty, provider });

    expect(result).toBe(empty);
    expect(provider.enrichCandidates).not.toHaveBeenCalled();
  });

  it("preserves the existing tier grouping while attaching commercial score/tier to every candidate", async () => {
    const localPeer = buildArtist({ name: "Local Peer", bookingCategory: "local_peer" });
    const reference = buildArtist({ name: "Reference Act", bookingCategory: "reference", artistTier: "large" });
    const grouped = groupSimilarArtistsByTier([localPeer, reference]);

    const provider = fakeProvider([
      { provider: "chartmetric", candidateName: "Local Peer", status: "not_found" },
      { provider: "chartmetric", candidateName: "Reference Act", status: "not_found" }
    ]);

    const result = await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: grouped, provider });

    expect(result.local_peer).toHaveLength(1);
    expect(result.reference).toHaveLength(1);
    expect(result.local_peer[0]?.commercialTier).toBeDefined();
    expect(result.reference[0]?.commercialTier).toBeDefined();
    expect(result.local_peer[0]?.commercialScoreBreakdown).toBeDefined();
  });

  it("attaches the full Chartmetric result (status/matchMethod/metrics) when the provider found a match", async () => {
    const artist = buildArtist({ name: "Broad Peak" });
    const grouped = groupSimilarArtistsByTier([artist]);
    const provider = fakeProvider([
      {
        provider: "chartmetric",
        candidateName: "Broad Peak",
        status: "success",
        matchMethod: "spotify_id",
        matchConfidence: "exact",
        metrics: {
          chartmetricArtistId: "42",
          spotifyMonthlyListeners: 6000,
          fetchedAt: "2026-01-01T00:00:00.000Z",
          matchConfidence: "exact",
          source: "chartmetric"
        }
      }
    ]);

    const result = await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: grouped, provider });
    const enriched = result.local_peer[0];

    expect(enriched?.chartmetric?.status).toBe("success");
    expect(enriched?.chartmetric?.matchMethod).toBe("spotify_id");
    expect(enriched?.chartmetric?.metrics?.spotifyMonthlyListeners).toBe(6000);
  });

  it("passes existing relevance as the enrichment priority so the most relevant candidates are ranked first", async () => {
    const low = buildArtist({ name: "Low", totalRelevance: 20, bookingCategory: "to_verify" });
    const high = buildArtist({ name: "High", totalRelevance: 95, bookingCategory: "local_peer" });
    const grouped = groupSimilarArtistsByTier([low, high]);
    const provider = fakeProvider([
      { provider: "chartmetric", candidateName: "Low", status: "not_found" },
      { provider: "chartmetric", candidateName: "High", status: "not_found" }
    ]);

    await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: grouped, provider });

    const call = (provider.enrichCandidates as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const priorities = Object.fromEntries(call.candidates.map((c: { artistName: string; priority: number }) => [c.artistName, c.priority]));
    expect(priorities.High).toBe(95);
    expect(priorities.Low).toBe(20);
  });

  it("still computes a commercialTier when the candidate wasn't returned by the provider at all", async () => {
    const artist = buildArtist({ name: "Missing From Results" });
    const grouped = groupSimilarArtistsByTier([artist]);
    const provider = fakeProvider([]); // provider returned nothing for this candidate

    const result = await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: grouped, provider });
    const enriched = result.local_peer[0];

    expect(enriched?.chartmetric).toBeUndefined();
    expect(enriched?.commercialTier).toBeDefined();
  });

  it("attaches scale_unknown, a null score, and coverage/confidence instead of a fabricated result when Chartmetric found nothing", async () => {
    const artist = buildArtist({ name: "Unresolved Reference", bookingCategory: "reference", estimatedFollowers: null, artistTier: "unknown" });
    const grouped = groupSimilarArtistsByTier([artist]);
    const provider = fakeProvider([{ provider: "chartmetric", candidateName: "Unresolved Reference", status: "not_found" }]);

    const result = await enrichSimilarArtistsWithChartmetric({ profile: { ...PROFILE, spotify: null }, similarArtists: grouped, provider });
    const enriched = result.reference[0];

    expect(enriched?.commercialTier).toBe("scale_unknown");
    expect(enriched?.commercialScore).toBeNull();
    expect(enriched?.commercialScoreCoverage).toBeDefined();
    expect(enriched?.commercialScoreConfidence).toBeDefined();
    expect(enriched?.commercialAbsoluteScale).toBeDefined();
  });

  it("attaches development-only chartmetricDiagnostics reflecting selection, identity presence, and the provider's own result", async () => {
    const selected = buildArtist({ name: "Selected Candidate", totalRelevance: 90, spotifyId: "abc123" });
    const notSelected = buildArtist({ name: "Not Selected Candidate", totalRelevance: 10 });
    const grouped = groupSimilarArtistsByTier([selected, notSelected]);
    const provider = fakeProvider([
      {
        provider: "chartmetric",
        candidateName: "Selected Candidate",
        status: "success",
        matchMethod: "spotify_id",
        matchConfidence: "exact",
        cacheHit: false,
        metrics: {
          chartmetricArtistId: "1",
          spotifyMonthlyListeners: 6000,
          fetchedAt: "2026-01-01T00:00:00.000Z",
          matchConfidence: "exact",
          source: "chartmetric"
        }
      },
      { provider: "chartmetric", candidateName: "Not Selected Candidate", status: "skipped", reason: "not_selected_for_enrichment" }
    ]);

    const result = await enrichSimilarArtistsWithChartmetric({ profile: PROFILE, similarArtists: grouped, provider });
    const selectedResult = result.local_peer.find((a) => a.name === "Selected Candidate");
    const notSelectedResult = result.local_peer.find((a) => a.name === "Not Selected Candidate");

    expect(selectedResult?.chartmetricDiagnostics?.selectedForEnrichment).toBe(true);
    expect(selectedResult?.chartmetricDiagnostics?.spotifyIdPresent).toBe(true);
    expect(selectedResult?.chartmetricDiagnostics?.lookupAttempted).toBe(true);
    expect(selectedResult?.chartmetricDiagnostics?.status).toBe("success");
    expect(selectedResult?.chartmetricDiagnostics?.matchMethod).toBe("spotify_id");
    expect(selectedResult?.chartmetricDiagnostics?.metricsReturned).toBe(true);
    expect(selectedResult?.chartmetricDiagnostics?.cacheHit).toBe(false);

    expect(notSelectedResult?.chartmetricDiagnostics?.selectedForEnrichment).toBe(false);
    expect(notSelectedResult?.chartmetricDiagnostics?.spotifyIdPresent).toBe(false);
    expect(notSelectedResult?.chartmetricDiagnostics?.lookupAttempted).toBe(false);
    expect(notSelectedResult?.chartmetricDiagnostics?.skipReason).toBe("not_selected_for_enrichment");
  });
});
