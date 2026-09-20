import { describe, expect, it } from "vitest";
import { SimilarArtistSchema, type ArtistProfile } from "../src/schemas.js";
import { ingestEncounteredArtists } from "../src/services/encounteredArtistIngestionService.js";
import type {
  ArtistObservation,
  CanonicalArtistIdentity,
  PersistedSimilarityEdge,
  SimilarityGraphStore
} from "../src/services/artistSimilarityGraphService.js";

const profile: ArtistProfile = {
  artistName: "Tuesday Fall", spotifyArtistName: "Tuesday Fall", city: "Paris", country: "France",
  genres: ["pop punk"], spotifyGenres: ["pop punk"], socialLinks: {}, platformStats: {},
  estimatedLevel: "developing", confidence: 0.9, notes: [],
  spotify: { id: "spotify-tuesday", url: null, imageUrl: null, followers: 100, popularity: 10, genres: ["pop punk"] },
  imageUrl: null, imageSource: null, imageConfidence: null
};

const similar = SimilarArtistSchema.parse({
  name: "Mina Warren", url: null, spotifyId: "spotify-mina", genres: ["emo"], city: null, country: "France",
  source: "lastfm_similar", sources: ["lastfm"], reason: "Similar", confidence: 0.8, sourceConfidence: 0.8,
  artistTier: "small", bookingCategory: "regional_peer", estimatedFollowers: 500, estimatedPopularity: 10,
  sizeSignalSource: "spotify_artist", genreRelevance: 85, localRelevance: 80, sizeRelevance: 80,
  sceneRelevance: 80, totalRelevance: 80, relevanceToUserArtist: 80, possibleUse: "booking_research",
  estimatedLevel: "emerging"
});

class ObservationStore implements SimilarityGraphStore {
  identities: CanonicalArtistIdentity[] = [];
  observations: Array<{ artistId: string; observation: ArtistObservation }> = [];
  failName: string | null = null;

  async resolveArtist(identity: CanonicalArtistIdentity): Promise<string> {
    if (identity.name === this.failName) throw new Error("failed identity");
    this.identities.push(identity);
    return `id-${identity.name.toLowerCase().replace(/\s+/g, "-")}`;
  }
  async readEdges(): Promise<PersistedSimilarityEdge[]> { return []; }
  async upsertEdge(): Promise<"created"> { return "created"; }
  async recordArtistObservation(artistId: string, observation: ArtistObservation): Promise<void> {
    this.observations.push({ artistId, observation });
  }
}

describe("encountered artist ingestion", () => {
  it("persists the analyzed artist, similar artists, concert artists and every encountered lineup artist", async () => {
    const store = new ObservationStore();
    const result = await ingestEncounteredArtists({
      store, profile, similarArtists: [similar], now: new Date("2026-09-19T12:00:00Z"),
      concertHistory: [{
        artist: similar,
        pastConcerts: [],
        upcomingConcerts: [{
          externalId: "songkick:event-1", artist: { name: "Mina Warren", spotifyId: "spotify-mina" },
          name: "Mina Warren + Local Guest", date: "2026-11-01", status: "upcoming",
          venue: { name: "Le Klub", city: "Paris", country: "France" },
          lineup: [{ name: "Mina Warren" }, { name: "Local Guest", externalId: "guest-1" }],
          sources: [{ provider: "songkick", url: "https://songkick.example/event-1" }], confidence: 0.8
        }]
      }],
      bookingTargets: [{
        name: "Headliner at Supersonic", category: "event", city: "Paris", country: "France",
        sourceUrl: "https://tickets.example/event-2", sourceType: "event_page", sourceProvider: "ticketmaster",
        externalEventId: "ticketmaster:event-2", genres: ["pop punk"], venueName: "Supersonic",
        lineup: ["Headliner", "Opening Band"], contacts: [], confidence: 0.75, evidence: []
      }]
    });

    expect(result.failures).toBe(0);
    expect(result.observationsPersisted).toBe(result.observationsCollected);
    expect(store.identities.map((identity) => identity.name)).toEqual(expect.arrayContaining([
      "Tuesday Fall", "Mina Warren", "Local Guest", "Headliner", "Opening Band"
    ]));
    expect(store.observations.map(({ observation }) => observation.role)).toEqual(expect.arrayContaining([
      "analyzed_artist", "similar_artist", "concert_artist", "lineup_artist"
    ]));
    expect(store.observations.find(({ artistId }) => artistId === "id-opening-band")?.observation).toMatchObject({
      sourceProvider: "ticketmaster", eventExternalId: "ticketmaster:event-2", venueName: "Supersonic",
      role: "support"
    });
    expect(store.observations.find(({ artistId }) => artistId === "id-headliner")?.observation).toMatchObject({
      role: "headliner"
    });
  });

  it("persists venue-history artists with their own event provenance, not as a similarity signal", async () => {
    const store = new ObservationStore();
    const target = {
      name: "Le Klub", category: "venue" as const, city: "Paris", country: "France",
      sourceUrl: "https://leklub.example", sourceType: "venue_official_programming_page" as const,
      sourceProvider: "similar_artist_event_history", genres: ["pop punk"], venueName: "Le Klub",
      lineup: ["Mina Warren", "Support Act From History"],
      venueArtistEvidence: [{
        venueId: "venue-le-klub", similarArtistId: "mina-warren", similarArtistName: "Mina Warren",
        eventName: "Mina Warren live", eventDate: "2025-03-01", sourceUrl: "https://songkick.example/mina-warren-2025",
        collectedAt: "2026-09-19T00:00:00.000Z", sourceProvider: "songkick", confidence: 0.82
      }],
      contacts: [], confidence: 0.6, evidence: []
    };

    const result = await ingestEncounteredArtists({ store, profile, similarArtists: [similar], bookingTargets: [target] });

    expect(result.failures).toBe(0);
    const minaObservation = store.observations.find(({ artistId, observation }) =>
      artistId === "id-mina-warren" && observation.role === "venue_history_artist"
    )?.observation;
    expect(minaObservation).toMatchObject({
      role: "venue_history_artist", sourceProvider: "songkick", sourceUrl: "https://songkick.example/mina-warren-2025",
      eventName: "Mina Warren live", venueName: "Le Klub"
    });
    // Mina Warren is a known similar artist: her structured venue-history
    // identity must reuse the richer similar-artist identity (Spotify ID),
    // not a bare name-only identity, so canonical resolution stays stable.
    const minaIdentity = store.identities.find((identity) => identity.name === "Mina Warren");
    expect(minaIdentity?.spotifyId).toBe("spotify-mina");

    const supportObservation = store.observations.find(({ artistId }) => artistId === "id-support-act-from-history")?.observation;
    expect(supportObservation).toMatchObject({ role: "venue_history_artist", venueName: "Le Klub" });
  });

  it("deduplicates the same artist observation in one execution", async () => {
    const store = new ObservationStore();
    const target = {
      name: "Repeated bill", category: "event" as const, city: "Paris", country: "France",
      sourceUrl: "https://example.test/event", sourceType: "event_page" as const, sourceProvider: "ticketmaster",
      externalEventId: "event-1", genres: ["punk"], venueName: "Venue", lineup: ["Same Artist", "Same Artist"],
      contacts: [], confidence: 0.7, evidence: []
    };
    const result = await ingestEncounteredArtists({ store, profile, similarArtists: [], bookingTargets: [target] });
    expect(result.observationsCollected).toBe(2); // analyzed artist + one lineup observation
  });

  it("isolates a failed artist without dropping other observations", async () => {
    const store = new ObservationStore();
    store.failName = "Broken Artist";
    const result = await ingestEncounteredArtists({
      store, profile, similarArtists: [], bookingTargets: [{
        name: "Mixed bill", category: "event", city: "Paris", country: "France", sourceUrl: null,
        sourceType: "event_page", genres: ["punk"], lineup: ["Broken Artist", "Working Artist"],
        contacts: [], confidence: 0.7, evidence: []
      }]
    });
    expect(result.failures).toBe(1);
    expect(store.identities.map((identity) => identity.name)).toContain("Working Artist");
    expect(result.observationsPersisted).toBe(2); // analyzed artist + working artist
  });
});
