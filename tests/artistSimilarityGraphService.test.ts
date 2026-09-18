import { describe, expect, it, vi } from "vitest";
import { SimilarArtistSchema, type ArtistProfile, type SimilarArtist } from "../src/schemas.js";
import {
  findSimilarArtistsDbFirst,
  normalizeArtistName,
  type CanonicalArtistIdentity,
  type PersistedSimilarityEdge,
  type SimilarityGraphStore
} from "../src/services/artistSimilarityGraphService.js";

const PROFILE: ArtistProfile = {
  artistName: "The Test Artist",
  city: "Paris",
  country: "France",
  genres: ["indie rock"],
  spotifyArtistName: "The Test Artist",
  spotifyGenres: ["indie rock"],
  socialLinks: {},
  platformStats: {},
  estimatedLevel: "developing",
  confidence: 0.8,
  notes: [],
  spotify: { id: "spotify-root", url: null, imageUrl: null, followers: 5000, popularity: 25, genres: ["indie rock"] },
  imageUrl: null,
  imageSource: null,
  imageConfidence: null
};

function artist(index: number, confidence = 0.8): SimilarArtist {
  return SimilarArtistSchema.parse({
    name: `Neighbor ${index}`,
    url: null,
    spotifyId: `spotify-${index}`,
    genres: ["indie rock"],
    city: index % 2 ? "Paris" : null,
    country: "France",
    source: "spotify_related",
    sources: ["spotify"],
    reason: "Shared genre and comparable audience.",
    confidence,
    sourceConfidence: confidence,
    artistTier: index < 3 ? "small" : index < 5 ? "medium" : "large",
    bookingCategory: index % 2 ? "local_peer" : "reference",
    estimatedFollowers: index * 1000,
    estimatedPopularity: 20 + index,
    sizeSignalSource: "spotify_artist",
    genreRelevance: 80,
    localRelevance: index % 2 ? 80 : 20,
    sizeRelevance: 70,
    sceneRelevance: 60,
    totalRelevance: 90 - index,
    relevanceToUserArtist: 90 - index,
    possibleUse: "booking_research",
    estimatedLevel: "developing"
  });
}

function edge(index: number, nextRefreshAt: string, scoreVersion = "similarity-v1"): PersistedSimilarityEdge {
  return {
    artistId: "root",
    similarArtistId: `artist-${index}`,
    score: 90 - index,
    scoreVersion,
    genreScore: 80,
    audienceScore: 70,
    geographyScore: 50,
    providerScore: 80,
    confidence: 0.8,
    sources: ["spotify"],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastComputedAt: "2026-09-01T00:00:00.000Z",
    nextRefreshAt,
    result: artist(index)
  };
}

class MemoryGraphStore implements SimilarityGraphStore {
  identities = new Map<string, string>();
  edges: PersistedSimilarityEdge[] = [];
  upserts = 0;
  enqueued: string[] = [];

  async resolveArtist(identity: CanonicalArtistIdentity): Promise<string> {
    const providerKey = identity.spotifyId ? `spotify:${identity.spotifyId}` : null;
    const nameKey = `name:${normalizeArtistName(identity.name)}`;
    const existing = (providerKey && this.identities.get(providerKey)) ?? this.identities.get(nameKey);
    if (existing) return existing;
    const id = identity.spotifyId === "spotify-root" ? "root" : `id-${this.identities.size}`;
    if (providerKey) this.identities.set(providerKey, id);
    this.identities.set(nameKey, id);
    return id;
  }

  async readEdges(_artistId: string, scoreVersion: string): Promise<PersistedSimilarityEdge[]> {
    return this.edges.filter((item) => item.scoreVersion === scoreVersion);
  }

  async hasEdgesForOtherScoreVersion(_artistId: string, scoreVersion: string): Promise<boolean> {
    return this.edges.some((item) => item.scoreVersion !== scoreVersion);
  }

  async upsertEdge(value: Omit<PersistedSimilarityEdge, "firstSeenAt">): Promise<"created" | "recomputed"> {
    this.upserts += 1;
    const existing = this.edges.find((item) => item.artistId === value.artistId && item.similarArtistId === value.similarArtistId && item.scoreVersion === value.scoreVersion);
    if (existing) {
      Object.assign(existing, value);
      return "recomputed";
    }
    this.edges.push({ ...value, firstSeenAt: value.lastComputedAt });
    return "created";
  }

  async enqueueRefresh(_artistId: string, reason: "stale" | "sparse" | "score_version"): Promise<void> {
    this.enqueued.push(reason);
  }
}

describe("artist similarity graph DB-first orchestration", () => {
  it("serves a fresh sufficient graph without provider calls", async () => {
    const store = new MemoryGraphStore();
    store.edges = Array.from({ length: 6 }, (_, index) => edge(index, "2026-10-01T00:00:00.000Z"));
    const discover = vi.fn(async () => [artist(10)]);
    const result = await findSimilarArtistsDbFirst({ store, profile: PROFILE, discover, now: new Date("2026-09-18") });
    expect(result.source).toBe("db_reused");
    expect(result.artists).toHaveLength(6);
    expect(result.metrics.externalProviderCallsAvoided).toBe(1);
    expect(discover).not.toHaveBeenCalled();
  });

  it("returns sufficient stale data immediately and enqueues refresh", async () => {
    const store = new MemoryGraphStore();
    store.edges = Array.from({ length: 6 }, (_, index) => edge(index, "2026-09-01T00:00:00.000Z"));
    const discover = vi.fn(async () => [artist(10)]);
    const result = await findSimilarArtistsDbFirst({ store, profile: PROFILE, discover, now: new Date("2026-09-18") });
    expect(result.source).toBe("db_stale_reused");
    expect(store.enqueued).toEqual(["stale"]);
    expect(discover).not.toHaveBeenCalled();
  });

  it("falls back to providers for sparse data and persists new edges", async () => {
    const store = new MemoryGraphStore();
    store.edges = [edge(0, "2026-10-01T00:00:00.000Z")];
    const discover = vi.fn(async () => [artist(1), artist(2)]);
    const result = await findSimilarArtistsDbFirst({ store, profile: PROFILE, discover, now: new Date("2026-09-18") });
    expect(result.source).toBe("provider_refreshed");
    expect(result.metrics.newEdgesCreated).toBe(2);
    expect(store.upserts).toBe(2);
    expect(store.enqueued).toEqual(["sparse"]);
  });

  it("expands through providers for a deep search even when the graph is fresh", async () => {
    const store = new MemoryGraphStore();
    store.edges = Array.from({ length: 6 }, (_, index) => edge(index, "2026-10-01T00:00:00.000Z"));
    const discover = vi.fn(async () => [artist(10)]);

    const result = await findSimilarArtistsDbFirst({
      store,
      profile: PROFILE,
      discover,
      deepSearch: true,
      now: new Date("2026-09-18")
    });

    expect(discover).toHaveBeenCalledOnce();
    expect(result.source).toBe("provider_refreshed");
    expect(result.artists[0]?.name).toBe("Neighbor 10");
  });

  it("reuses stale data when a required provider refresh fails", async () => {
    const store = new MemoryGraphStore();
    store.edges = [edge(0, "2026-09-01T00:00:00.000Z")];
    const result = await findSimilarArtistsDbFirst({
      store,
      profile: PROFILE,
      discover: async () => { throw new Error("provider unavailable"); },
      now: new Date("2026-09-18")
    });
    expect(result.source).toBe("db_stale_reused");
    expect(result.artists).toHaveLength(1);
  });

  it("resolves punctuation and case variants to one canonical artist", async () => {
    const store = new MemoryGraphStore();
    const first = await store.resolveArtist({ name: "AC/DC" });
    const second = await store.resolveArtist({ name: "ac dc" });
    expect(first).toBe(second);
    expect(normalizeArtistName("Beyoncé!")).toBe("beyonce");
  });

  it("ignores old score versions and recomputes with the current version", async () => {
    const store = new MemoryGraphStore();
    store.edges = [edge(0, "2026-10-01T00:00:00.000Z", "booking-v0")];
    const discover = vi.fn(async () => [artist(1)]);
    const result = await findSimilarArtistsDbFirst({ store, profile: PROFILE, discover, now: new Date("2026-09-18") });
    expect(discover).toHaveBeenCalledOnce();
    expect(result.metrics.scoreVersion).toBe("similarity-v1");
    expect(store.edges.some((item) => item.scoreVersion === "similarity-v1")).toBe(true);
    expect(store.enqueued).toContain("score_version");
  });

  it("does not repeat provider discovery when persistence fails", async () => {
    const store = new MemoryGraphStore();
    store.upsertEdge = async () => { throw new Error("database unavailable"); };
    const discover = vi.fn(async () => [artist(1)]);

    const result = await findSimilarArtistsDbFirst({ store, profile: PROFILE, discover });

    expect(discover).toHaveBeenCalledOnce();
    expect(result.source).toBe("provider_refreshed");
    expect(result.artists.map((item) => item.name)).toEqual(["Neighbor 1"]);
  });

  it("deduplicates provider results before persistence and reports the merge", async () => {
    const store = new MemoryGraphStore();
    const duplicate = { ...artist(1), name: "Neighbor One" };

    const result = await findSimilarArtistsDbFirst({
      store,
      profile: PROFILE,
      discover: async () => [artist(1), duplicate]
    });

    expect(store.upserts).toBe(1);
    expect(result.metrics.newEdgesCreated).toBe(1);
    expect(result.metrics.duplicateArtistsMerged).toBe(1);
  });
});
