import { describe, expect, it, vi } from "vitest";
import { runOpportunitySearch } from "../src/pipeline.js";
import type { BookingSourceProvider } from "../src/booking/providers/BookingSourceProvider.js";
import type { SimilarArtistCandidateEnrichmentProvider } from "../src/modules/similarArtistCommercialEnrichment.js";
import type { ArtistInput } from "../src/schemas.js";
import type { SimilarArtistSeedRecord } from "../src/modules/similarArtistSeeds.js";

// Issue #201 follow-up: Chartmetric enrichment must be purely additive to the
// UI/commercial-scoring copy of similar artists and must never change which
// candidates, in which order, feed the existing live-search pipeline (concert
// history, booking search, label discovery). These tests prove that end to
// end through the real runOpportunitySearch entry point, using a recording
// booking provider whose deterministic output is *derived from* the
// similarArtists it receives — so any reordering/count change upstream would
// be visible in the resulting opportunities, not just in an internal list.

const bookingInput: ArtistInput = {
  mode: "booking",
  artist: "Fake Band",
  city: "Lyon",
  genre: "pop punk",
  target: null,
  links: [],
  limit: 10
};

const seedCandidates: SimilarArtistSeedRecord[] = [
  {
    name: "Neon Riot",
    genres: ["pop punk"],
    city: null,
    country: "France",
    url: "https://example.test/alpha",
    source: "seed",
    notes: "Seed fixture.",
    estimatedTier: "medium",
    verified: true
  },
  {
    name: "Broad Peak",
    genres: ["pop punk"],
    city: null,
    country: "France",
    url: "https://example.test/beta",
    source: "seed",
    notes: "Seed fixture.",
    estimatedTier: "small",
    verified: true
  },
  {
    name: "Bad Frequencies",
    genres: ["pop punk"],
    city: null,
    country: "France",
    url: "https://example.test/gamma",
    source: "seed",
    notes: "Seed fixture.",
    estimatedTier: "large",
    verified: true
  }
];

function buildRecordingBookingProvider(capturedNamesPerCall: string[][]): BookingSourceProvider {
  return {
    providerName: "recording_test_provider",
    async search({ input }) {
      const names = (input.similarArtists ?? []).map((artist) => artist.name);
      capturedNamesPerCall.push(names);
      return {
        sourceProvider: "recording_test_provider",
        searchedQueries: [],
        warnings: [],
        metadata: {},
        // Deterministically derived from the similar-artist list itself, so a
        // reordering or count change upstream changes this output too.
        targets: names.map((name, index) => ({
          name: `${name} co-bill night`,
          category: "venue" as const,
          city: input.city,
          country: "France",
          description: `Derived from similar artist ${name}.`,
          sourceUrl: `https://example.test/venue-${index}`,
          sourceType: "mock" as const,
          genres: [input.genre],
          estimatedCapacity: null,
          estimatedArtistTier: null,
          contacts: [],
          confidence: 0.8,
          evidence: []
        }))
      };
    }
  };
}

function workingChartmetricProvider(): SimilarArtistCandidateEnrichmentProvider {
  return {
    enrichCandidates: vi.fn().mockImplementation((input: { candidates: { artistName: string }[] }) =>
      Promise.resolve(
        input.candidates.map((candidate) => ({
          provider: "chartmetric" as const,
          candidateName: candidate.artistName,
          status: "success" as const,
          matchMethod: "spotify_id" as const,
          matchConfidence: "exact" as const,
          metrics: {
            chartmetricArtistId: `cm-${candidate.artistName}`,
            spotifyMonthlyListeners: 12_000,
            fetchedAt: "2026-01-01T00:00:00.000Z",
            matchConfidence: "exact" as const,
            source: "chartmetric" as const
          }
        }))
      )
    )
  };
}

function disabledChartmetricProvider(): SimilarArtistCandidateEnrichmentProvider {
  return { enrichCandidates: vi.fn().mockResolvedValue([]) };
}

describe("Chartmetric enrichment does not affect the live-search pipeline (issue #201 follow-up)", () => {
  it("passes the identical similar-artist order and count to the booking-search provider whether Chartmetric is enabled or disabled", async () => {
    const capturedEnabled: string[][] = [];
    const capturedDisabled: string[][] = [];

    await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: workingChartmetricProvider(),
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedEnabled)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: disabledChartmetricProvider(),
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedDisabled)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    expect(capturedEnabled[0]!.length).toBeGreaterThan(0);
    expect(capturedEnabled[0]).toEqual(capturedDisabled[0]);
  });

  it("produces identical opportunity output (names, order, count) whether Chartmetric is enabled or disabled", async () => {
    const capturedEnabled: string[][] = [];
    const capturedDisabled: string[][] = [];

    const resultEnabled = await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: workingChartmetricProvider(),
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedEnabled)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    const resultDisabled = await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: disabledChartmetricProvider(),
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedDisabled)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    expect(resultEnabled.opportunities.length).toBeGreaterThan(0);
    expect(resultEnabled.opportunities.map((o) => o.name)).toEqual(resultDisabled.opportunities.map((o) => o.name));
    expect(resultEnabled.opportunities).toEqual(resultDisabled.opportunities);
  });

  it("keeps commercial-scoring fields visible on the UI-facing similarArtists result even though live search never saw them", async () => {
    const capturedEnabled: string[][] = [];

    const result = await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: workingChartmetricProvider(),
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedEnabled)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    const allSimilarArtists = [
      ...result.similarArtists.local_peer,
      ...result.similarArtists.regional_peer,
      ...result.similarArtists.support_target,
      ...result.similarArtists.reference,
      ...result.similarArtists.to_verify,
      ...result.similarArtists.unknown
    ];
    expect(allSimilarArtists.length).toBeGreaterThan(0);
    expect(allSimilarArtists.every((artist) => typeof artist.commercialTier === "string")).toBe(true);
  });

  it("leaves opportunity output unchanged when the Chartmetric candidate provider throws", async () => {
    const capturedWorking: string[][] = [];
    const capturedThrowing: string[][] = [];
    const throwingProvider: SimilarArtistCandidateEnrichmentProvider = {
      enrichCandidates: vi.fn().mockRejectedValue(new Error("Chartmetric exploded"))
    };

    const resultWorking = await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: workingChartmetricProvider(),
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedWorking)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    const resultThrowing = await runOpportunitySearch(bookingInput, {
      seedCandidates,
      chartmetricSimilarArtistProvider: throwingProvider,
      bookingSearchOptions: { providers: [buildRecordingBookingProvider(capturedThrowing)] },
      artistConcertProviders: [],
      labelDiscoveryOptions: { providers: [] }
    });

    expect(capturedThrowing[0]).toEqual(capturedWorking[0]);
    expect(resultThrowing.opportunities.map((o) => o.name)).toEqual(resultWorking.opportunities.map((o) => o.name));
  });
});
