import { describe, expect, it } from "vitest";
import { buildMatchFactors } from "../src/booking/matchFactors.js";
import { filterBookingTargetsForRelevance } from "../src/booking/relevance.js";
import { scoreBookingCompatibility } from "../src/booking/scoring.js";
import type { BookingSearchInput, BookingTarget } from "../src/booking/types.js";

const input: BookingSearchInput = { artist: "Tuesday Fall", city: "Paris", genre: "pop punk", target: "France", links: [], limit: 10, artistProfile: { artistName: "Tuesday Fall", city: "Paris", country: "France", genres: ["pop punk"], spotifyArtistName: null, spotifyGenres: [], socialLinks: {}, platformStats: {}, estimatedLevel: "emerging", confidence: .8, notes: [] } };

function venue(overrides: Partial<BookingTarget>): BookingTarget {
  return { name: "Generic location", category: "venue", city: "Paris", country: "France", sourceUrl: null, sourceType: "similar_artist_live_history", sourceProvider: "similar_artist_event_history", genres: [], contacts: [], confidence: .8, evidence: [], programmingEvidence: [], venueArtistEvidence: [], ...overrides };
}

describe("event-derived venue qualification", () => {
  it.each([
    ["church with classical programming", venue({ name: "Église Saint-Test", programmingEvidence: [{ artistName: "Composer", eventName: "Concert Mozart et Bach", sourceUrl: "https://example.test/mozart", genres: [] }] })],
    ["university lecture", venue({ name: "Université Exemple", programmingEvidence: [{ artistName: "Justice", eventName: "Conférence de philosophie", sourceUrl: "https://example.test/lecture", genres: [] }] })],
    ["cinema screening", venue({ name: "Cinéma Exemple", programmingEvidence: [{ artistName: "Justice", eventName: "Projection du film Justice", sourceUrl: "https://example.test/movie", genres: [] }] })],
    ["meeting point", venue({ name: "Rendez-vous devant le bâtiment de la gare SNCF", programmingEvidence: [{ artistName: "Justice", eventName: "Balade urbaine", sourceUrl: "https://example.test/walk", genres: [] }] })]
  ])("rejects %s without positive live-music venue evidence", (_label, target) => {
    expect(filterBookingTargetsForRelevance(input, [target], {}, new Date("2026-09-17T00:00:00Z")).targets).toEqual([]);
  });

  it("keeps an explicitly identified live-music venue with concert history", () => {
    const target = venue({ name: "Example Live Music Club", description: "Live music club with regular concerts", programmingEvidence: [{ artistName: "Peer One", eventName: "Peer One live concert", sourceUrl: "https://example.test/concert", genres: [] }] });
    expect(filterBookingTargetsForRelevance(input, [target], {}, new Date("2026-09-17T00:00:00Z")).targets).toHaveLength(1);
  });

  it("keeps multiple compatible artists as relationship/programming evidence without inventing venue genres", () => {
    const target = venue({ name: "Le Sample", derivedFromSimilarArtist: { name: "Peer One", popularityComparison: "same_tier", matchedGenres: ["pop punk"], sourceUrl: "https://example.test/one" }, programmingEvidence: [
      { artistName: "Peer One", eventName: "Peer One live concert", sourceUrl: "https://example.test/one", genres: [] },
      { artistName: "Peer Two", eventName: "Peer Two punk concert", sourceUrl: "https://example.test/two", genres: [] }
    ], venueArtistEvidence: [
      { venueId: "sample", similarArtistId: "peer-one", sourceUrl: "https://example.test/one", collectedAt: "2026-09-17T00:00:00Z", sourceProvider: "test", confidence: .8 },
      { venueId: "sample", similarArtistId: "peer-two", sourceUrl: "https://example.test/two", collectedAt: "2026-09-17T00:00:00Z", sourceProvider: "test", confidence: .8 }
    ] });
    const kept = filterBookingTargetsForRelevance(input, [target], {}, new Date("2026-09-17T00:00:00Z")).targets[0];
    expect(kept).toBeDefined();
    expect(kept?.genres).toEqual([]);
    expect(kept?.venueArtistEvidence).toHaveLength(2);
  });

  it("does not award or display genre match when venue genre evidence is unknown", () => {
    const target = venue({ name: "Example Live Music Club", description: "Pop punk artist Peer One played this live music club", derivedFromSimilarArtist: { name: "Peer One", popularityComparison: "same_tier", matchedGenres: ["pop punk"], sourceUrl: "https://example.test/one" } });
    const score = scoreBookingCompatibility(input, target);
    const breakdown = buildMatchFactors(input, target, score, { scoreAdjustment: 0, factor: null }, score.total);
    expect(score.genreLevel).toBe("unknown");
    expect(score.genreFit).toBe(25);
    expect(breakdown.positiveFactors.some((factor) => factor.code === "genre_match")).toBe(false);
    expect(breakdown.positiveFactors.some((factor) => factor.code === "similar_artist_signal")).toBe(true);
  });

  it("does not turn Mozart/Bach church programming into a pop-punk genre match", () => {
    const target = venue({ name: "Église Saint-Test", description: "Concert Mozart et Bach", programmingEvidence: [{ artistName: "Orchestre Exemple", eventName: "Concert Mozart et Bach", sourceUrl: "https://example.test/classical", genres: [] }] });
    const score = scoreBookingCompatibility(input, target);
    const breakdown = buildMatchFactors(input, target, score, { scoreAdjustment: 0, factor: null }, score.total);
    expect(score.genreLevel).toBe("unknown");
    expect(breakdown.positiveFactors.some((factor) => factor.code === "genre_match")).toBe(false);
    expect(filterBookingTargetsForRelevance(input, [target], {}, new Date("2026-09-17T00:00:00Z")).targets).toEqual([]);
  });
});
