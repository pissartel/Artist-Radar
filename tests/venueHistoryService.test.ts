import { describe, expect, it } from "vitest";
import type { CanonicalArtistIdentity, SimilarityGraphStore } from "../src/services/artistSimilarityGraphService.js";
import {
  findVenuesDbFirst,
  ingestVenueEventHistory,
  recomputeVenueProfiles,
  type PersistedEventInput,
  type RecomputeJob,
  type VenueHistoryStore
} from "../src/services/venueHistoryService.js";
import {
  computeVenueProgrammingProfile,
  venueIdentityKey,
  type CanonicalEventRecord,
  type VenueProgrammingProfile
} from "../src/services/venueProgrammingProfileService.js";

const now = new Date("2026-09-21T00:00:00Z");

class MemoryVenueStore implements VenueHistoryStore {
  venues = new Map<string, string>();
  events = new Map<string, { venueId: string; input: PersistedEventInput }>();
  profiles = new Map<string, VenueProgrammingProfile>();
  jobs = new Set<string>();
  hosts: Array<{ venueId: string; distinctArtists: number }> = [];
  eventRecords = new Map<string, CanonicalEventRecord[]>();

  async upsertVenue(venue: { name: string; city?: string | null }) {
    const id = `venue-${venueIdentityKey(venue)}`;
    this.venues.set(id, venue.name);
    return id;
  }
  async upsertEvent(venueId: string, input: PersistedEventInput) {
    const existed = this.events.has(input.event.canonicalKey);
    this.events.set(input.event.canonicalKey, { venueId, input });
    this.jobs.add(venueId);
    return existed ? "merged" as const : "created" as const;
  }
  async readVenueEvents(venueId: string) { return this.eventRecords.get(venueId) ?? []; }
  async readProfiles(venueIds: string[]) { return venueIds.map((id) => this.profiles.get(id)).filter((p): p is VenueProgrammingProfile => !!p); }
  async upsertProfile(profile: VenueProgrammingProfile) { this.profiles.set(profile.venueId, profile); }
  async enqueueProfileRecompute(venueId: string) { this.jobs.add(venueId); }
  async claimRecomputeJobs(): Promise<RecomputeJob[]> {
    const claimed = [...this.jobs].map((venueId) => ({ id: `job-${venueId}`, venueId }));
    this.jobs.clear();
    return claimed;
  }
  async completeRecomputeJob() {}
  async listStaleProfileVenueIds(_v: string, at: Date) {
    return [...this.profiles.values()].filter((p) => Date.parse(p.nextRefreshAt) <= at.getTime()).map((p) => p.venueId);
  }
  async findVenuesHostingArtists() { return this.hosts; }
}

const artistStore: SimilarityGraphStore = {
  async resolveArtist(identity: CanonicalArtistIdentity) { return `artist-${identity.name.toLowerCase().replace(/\W+/g, "-")}`; },
  async readEdges() { return []; },
  async upsertEdge() { return "created"; }
};

describe("ingestVenueEventHistory", () => {
  it("retains past events, dedupes multi-source events and queues recompute", async () => {
    const store = new MemoryVenueStore();
    const metrics = await ingestVenueEventHistory({
      venueStore: store, artistStore, now,
      observations: [
        { provider: "ticketmaster", externalId: "1", date: "2026-01-10", venue: { name: "Le Krakatoa", city: "Mérignac" }, artists: [{ name: "Tuesday Fall" }], confidence: 0.8 },
        { provider: "songkick", externalId: "9", date: "2026-01-10", venue: { name: "Krakatoa", city: "Mérignac" }, artists: [{ name: "Tuesday Fall" }], confidence: 0.6 },
        { provider: "songkick", externalId: "10", date: "2026-02-10", status: "cancelled", venue: { name: "Krakatoa", city: "Mérignac" }, artists: [{ name: "Mina Warren" }], confidence: 0.6 }
      ]
    });
    expect(store.events.size).toBe(2);
    expect(metrics.duplicateEventsMerged).toBe(1);
    expect(metrics.historicalEventsStored).toBe(1);
    const cancelled = [...store.events.values()].find((e) => e.input.event.status === "cancelled");
    expect(cancelled).toBeDefined();
    expect(store.jobs.size).toBe(1);
  });

  it("keeps the event when an artist cannot be resolved", async () => {
    const store = new MemoryVenueStore();
    const failing: SimilarityGraphStore = { ...artistStore, resolveArtist: async () => { throw new Error("ambiguous"); } };
    const metrics = await ingestVenueEventHistory({
      venueStore: store, artistStore: failing, now,
      observations: [{ provider: "x", date: "2026-01-10", venue: { name: "Venue A" }, artists: [{ name: "Unknown" }], confidence: 0.5 }]
    });
    expect(store.events.size).toBe(1);
    expect(metrics.failures).toBe(0);
  });
});

describe("recomputeVenueProfiles", () => {
  it("recomputes queued profiles and re-queues stale ones", async () => {
    const store = new MemoryVenueStore();
    store.eventRecords.set("v1", [{ venueId: "v1", date: "2026-08-01", status: "past", confidence: 0.9, artists: [{ artistId: "a", billingRole: "headliner", genres: ["emo"], scale: 20 }] }]);
    store.jobs.add("v1");
    store.profiles.set("old", { ...computeVenueProgrammingProfile("old", [], now), nextRefreshAt: "2026-01-01T00:00:00Z" });

    const first = await recomputeVenueProfiles(store, { now });
    expect(first.staleProfilesQueued).toBe(1);
    expect(first.profilesRecomputed).toBe(2);
    expect(store.profiles.get("v1")!.genreAffinityScores.emo).toBeGreaterThan(0);
  });
});

describe("findVenuesDbFirst", () => {
  it("reuses profiles, ranks by fit, refreshes stale ones and still recommends discovery when coverage is low", async () => {
    const store = new MemoryVenueStore();
    const events = (genre: string, artist: string): CanonicalEventRecord[] => Array.from({ length: 5 }, (_, i) => ({
      venueId: "x", date: `2026-0${i + 4}-01`, status: "past" as const, confidence: 0.9,
      artists: [{ artistId: i === 0 ? artist : `${artist}${i}`, billingRole: "headliner" as const, genres: [genre], scale: 20 }]
    }));
    store.profiles.set("punk", computeVenueProgrammingProfile("punk", events("pop punk", "sim1"), now));
    store.profiles.set("jazz", { ...computeVenueProgrammingProfile("jazz", events("jazz", "sim1"), now), nextRefreshAt: "2026-01-01T00:00:00Z" });
    store.hosts = [{ venueId: "punk", distinctArtists: 1 }, { venueId: "jazz", distinctArtists: 1 }];

    const result = await findVenuesDbFirst({ store, genres: ["pop punk"], scale: 20, similarArtistIds: ["sim1"], now });
    expect(result.venues.map((v) => v.venueId)).toEqual(["punk", "jazz"]);
    expect(result.metrics.dbHit).toBe(true);
    expect(result.metrics.staleProfilesReused).toBe(1);
    expect(result.metrics.externalEnrichmentCallsAvoided).toBe(1);
    expect(result.metrics.externalDiscoveryRecommended).toBe(true);
    expect(store.jobs.has("jazz")).toBe(true);
  });

  it("reports a miss when nothing is known", async () => {
    const result = await findVenuesDbFirst({ store: new MemoryVenueStore(), genres: ["emo"], similarArtistIds: ["nobody"], now });
    expect(result.metrics.dbHit).toBe(false);
    expect(result.metrics.externalDiscoveryRecommended).toBe(true);
  });
});
