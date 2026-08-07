import { describe, expect, it } from "vitest";
import {
  explainSimilarArtistVenueEligibility,
  isEligibleSimilarArtistForBookingVenueDiscovery,
  selectEligibleSimilarArtistsForBookingVenueDiscovery
} from "../src/booking/similarArtistEligibility.js";
import { SimilarArtistSchema, type SimilarArtist } from "../src/schemas.js";

function buildSimilarArtist(overrides: Partial<SimilarArtist> = {}): SimilarArtist {
  return SimilarArtistSchema.parse({
    name: "Chartmetric Peer",
    url: null,
    spotifyUrl: "https://open.spotify.com/artist/sp-peer",
    spotifyId: "sp-peer",
    genres: ["pop punk"],
    city: null,
    country: null,
    source: "lastfm_similar",
    sources: ["lastfm_similar"],
    reason: "Last.fm similar artist.",
    confidence: 0.7,
    artistTier: "small",
    bookingCategory: "to_verify",
    estimatedFollowers: 900,
    estimatedPopularity: null,
    sizeSignalSource: "spotify_artist",
    genreRelevance: 55,
    localRelevance: 45,
    sizeRelevance: 80,
    sceneRelevance: 45,
    totalRelevance: 58,
    relevanceToUserArtist: 58,
    possibleUse: "unknown",
    estimatedLevel: "emerging",
    evidenceNotes: ["last.fm similar artists candidate."],
    sourceUrls: ["https://www.last.fm/music/chartmetric+peer"],
    verificationStatus: "needs_verification",
    popularity: {
      estimatedLevel: "small",
      confidence: 0.58,
      sizeSignalSource: "spotify",
      platforms: {
        spotify: {
          followers: 900,
          popularity: null,
          sourceUrl: "https://open.spotify.com/artist/sp-peer"
        }
      }
    },
    ...overrides
  });
}

describe("similar artist booking eligibility", () => {
  it("keeps unresolved to_verify candidates out of booking venue discovery", () => {
    const artist = buildSimilarArtist({ chartmetric: undefined });

    expect(isEligibleSimilarArtistForBookingVenueDiscovery(artist)).toBe(false);
    expect(explainSimilarArtistVenueEligibility(artist).rejectedReason).toBe("not_verified");
  });

  it("allows Chartmetric-backed to_verify candidates as research inputs", () => {
    const artist = buildSimilarArtist({
      name: "TYDEAL",
      chartmetric: {
        status: "success",
        matchMethod: "spotify_id",
        matchConfidence: "exact",
        metrics: {
          chartmetricArtistId: "123",
          spotifyArtistId: "sp-peer",
          spotifyFollowers: 1200,
          spotifyMonthlyListeners: 2500,
          fetchedAt: "2026-08-08T00:00:00.000Z",
          matchConfidence: "exact",
          source: "chartmetric"
        }
      }
    });

    expect(isEligibleSimilarArtistForBookingVenueDiscovery(artist)).toBe(true);
    expect(explainSimilarArtistVenueEligibility(artist).rejectedReason).toBeNull();
  });

  it("allows strong Last.fm to_verify candidates with Spotify identity as research inputs", () => {
    const artist = buildSimilarArtist({
      name: "Bad Frequencies",
      source: "lastfm_similar",
      sources: ["lastfm_similar"],
      genreRelevance: 86,
      totalRelevance: 82,
      sourceConfidence: 0.94,
      spotifyId: "bad-frequencies",
      spotifyUrl: "https://open.spotify.com/artist/bad-frequencies",
      estimatedFollowers: 1200,
      popularity: {
        estimatedLevel: "small",
        confidence: 0.58,
        sizeSignalSource: "spotify",
        platforms: {
          spotify: {
            followers: 1200,
            popularity: null,
            sourceUrl: "https://open.spotify.com/artist/bad-frequencies"
          }
        }
      }
    });

    expect(isEligibleSimilarArtistForBookingVenueDiscovery(artist)).toBe(true);
    expect(explainSimilarArtistVenueEligibility(artist).rejectedReason).toBeNull();
  });

  it("keeps weak Last.fm to_verify candidates out of booking venue discovery", () => {
    const artist = buildSimilarArtist({
      sourceConfidence: 0.72,
      genreRelevance: 55
    });

    expect(isEligibleSimilarArtistForBookingVenueDiscovery(artist)).toBe(false);
    expect(explainSimilarArtistVenueEligibility(artist).rejectedReason).toBe("not_verified");
  });

  it("prioritizes promoted to_verify candidates behind regular regional peers", () => {
    const regional = buildSimilarArtist({
      name: "Mina Warren",
      bookingCategory: "regional_peer",
      genreRelevance: 95,
      totalRelevance: 90,
      verificationStatus: "verified"
    });
    const chartmetricToVerify = buildSimilarArtist({
      name: "Broad Peak",
      genreRelevance: 70,
      totalRelevance: 68,
      chartmetric: {
        status: "success",
        matchMethod: "spotify_id",
        matchConfidence: "high",
        metrics: {
          chartmetricArtistId: "456",
          spotifyFollowers: 1378,
          fetchedAt: "2026-08-08T00:00:00.000Z",
          matchConfidence: "high",
          source: "chartmetric"
        }
      }
    });

    const selected = selectEligibleSimilarArtistsForBookingVenueDiscovery([chartmetricToVerify, regional], 2);

    expect(selected.artists.map((artist) => artist.name)).toEqual(["Mina Warren", "Broad Peak"]);
  });
});
