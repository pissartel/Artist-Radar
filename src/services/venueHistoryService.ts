import type { BookingTarget } from "../booking/types.js";
import type { SimilarArtistConcertsResult } from "../modules/similarArtistConcerts.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { warnLog } from "../utils/logger.js";
import type { SimilarityGraphStore } from "./artistSimilarityGraphService.js";
import {
  computeVenueProgrammingProfile,
  isProfileStale,
  mergeEventObservations,
  scoreVenueProfileFit,
  VENUE_PROFILE_SCORE_VERSION,
  type CanonicalEventRecord,
  type MergedVenueEvent,
  type VenueEventObservation,
  type VenueFitInput,
  type VenueFitResult,
  type VenueProgrammingProfile
} from "./venueProgrammingProfileService.js";

export interface PersistedEventInput {
  event: MergedVenueEvent;
  artists: Array<{ artistId: string; billingRole: "headliner" | "support" | "unknown" }>;
}

export interface RecomputeJob {
  id: string;
  venueId: string;
}

export interface VenueHistoryStore {
  upsertVenue(venue: MergedVenueEvent["venue"]): Promise<string>;
  /** Persists one canonical event with its sources/lineup and queues a profile recompute. */
  upsertEvent(venueId: string, input: PersistedEventInput): Promise<"created" | "merged">;
  readVenueEvents(venueId: string): Promise<CanonicalEventRecord[]>;
  readProfiles(venueIds: string[], scoreVersion: string): Promise<VenueProgrammingProfile[]>;
  upsertProfile(profile: VenueProgrammingProfile): Promise<void>;
  enqueueProfileRecompute(venueId: string, reason: "new_event" | "stale" | "score_version"): Promise<void>;
  claimRecomputeJobs(limit: number): Promise<RecomputeJob[]>;
  completeRecomputeJob(jobId: string, ok: boolean): Promise<void>;
  listStaleProfileVenueIds(scoreVersion: string, now: Date, limit: number): Promise<string[]>;
  findVenuesHostingArtists(artistIds: string[], minDistinctArtists?: number): Promise<Array<{ venueId: string; distinctArtists: number }>>;
}

export interface VenueHistoryIngestionMetrics {
  observationsCollected: number;
  historicalEventsStored: number;
  eventsCreated: number;
  duplicateEventsMerged: number;
  failures: number;
}

export interface VenueHistoryIngestionInput {
  venueStore: VenueHistoryStore;
  artistStore: SimilarityGraphStore;
  concertHistory?: SimilarArtistConcertsResult[];
  bookingTargets?: BookingTarget[];
  observations?: VenueEventObservation[];
  now?: Date;
  concurrency?: number;
}

export async function ingestVenueEventHistory(input: VenueHistoryIngestionInput): Promise<VenueHistoryIngestionMetrics> {
  const observations = [
    ...(input.observations ?? []),
    ...observationsFromConcertHistory(input.concertHistory ?? []),
    ...observationsFromBookingTargets(input.bookingTargets ?? [])
  ];
  const { events, duplicatesMerged } = mergeEventObservations(observations, input.now);
  const metrics: VenueHistoryIngestionMetrics = {
    observationsCollected: observations.length, historicalEventsStored: 0, eventsCreated: 0,
    duplicateEventsMerged: duplicatesMerged, failures: 0
  };

  await mapWithConcurrency(events, input.concurrency ?? 4, async (event) => {
    try {
      const venueId = await input.venueStore.upsertVenue(event.venue);
      const artists: PersistedEventInput["artists"] = [];
      for (const artist of event.artists) {
        try {
          const artistId = await input.artistStore.resolveArtist({
            name: artist.name, spotifyId: artist.spotifyId, musicBrainzId: artist.musicBrainzId,
            genres: artist.genres, scaleBand: artist.scaleBand
          });
          artists.push({ artistId, billingRole: artist.billingRole ?? "unknown" });
        } catch {
          // An unresolvable artist must not drop the event itself.
        }
      }
      const outcome = await input.venueStore.upsertEvent(venueId, { event, artists });
      if (outcome === "created") metrics.eventsCreated += 1;
      if (event.status === "past") metrics.historicalEventsStored += 1;
    } catch (error) {
      // Global knowledge is additive: never fail the user's search over it.
      metrics.failures += 1;
      warnLog("venue-history", "event persistence failed and was skipped", { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return metrics;
}

export function observationsFromConcertHistory(history: SimilarArtistConcertsResult[]): VenueEventObservation[] {
  const observations: VenueEventObservation[] = [];
  for (const entry of history) {
    for (const concert of [...entry.pastConcerts, ...entry.upcomingConcerts]) {
      if (!concert.venue?.name || !concert.date) continue;
      const genres = entry.artist.genres;
      const source = concert.sources[0];
      observations.push({
        provider: source?.provider ?? "concert_history", externalId: source?.externalId ?? concert.externalId,
        url: source?.url, name: concert.name, date: concert.date,
        status: concert.status === "cancelled" ? "cancelled" : concert.status === "unknown" ? undefined : concert.status,
        venue: concert.venue,
        artists: [
          {
            name: concert.artist.name, spotifyId: concert.artist.spotifyId ?? entry.artist.spotifyId ?? null,
            musicBrainzId: concert.artist.musicBrainzId ?? null, genres, scaleBand: entry.artist.artistScaleBand ?? null
          },
          ...(concert.lineup ?? []).map((member) => ({ name: member.name, billingRole: "support" as const }))
        ],
        confidence: concert.confidence ?? 0.7
      });
    }
  }
  return observations;
}

export function observationsFromBookingTargets(targets: BookingTarget[]): VenueEventObservation[] {
  const observations: VenueEventObservation[] = [];
  for (const target of targets) {
    const venueName = target.category === "venue" ? target.venueName ?? target.name : target.venueName;
    if (!venueName) continue;
    const provider = target.sourceProvider ?? target.sourceType;
    const venue = { name: venueName, city: target.city, country: target.country, latitude: target.latitude, longitude: target.longitude };
    if (target.eventDate && target.lineup?.length) {
      observations.push({
        provider, externalId: target.externalEventId, url: target.sourceUrl, name: target.name, date: target.eventDate, venue,
        artists: [...new Set(target.lineup)].map((name, index) => ({
          name, billingRole: index === 0 ? "headliner" as const : "support" as const, genres: target.genres
        })),
        confidence: target.confidence
      });
    }
    for (const evidence of target.venueArtistEvidence ?? []) {
      if (!evidence.eventDate || !evidence.similarArtistName) continue;
      observations.push({
        provider: evidence.sourceProvider, url: evidence.sourceUrl, name: evidence.eventName, date: evidence.eventDate, venue,
        artists: [{ name: evidence.similarArtistName }], confidence: evidence.confidence
      });
    }
  }
  return observations;
}

export interface VenueRecomputeMetrics {
  profilesRecomputed: number;
  staleProfilesQueued: number;
  failures: number;
}

/**
 * Background recompute (#242/#244): drains queued jobs and re-queues stale
 * profiles. Meant for a worker/cron, never for the synchronous request path.
 */
export async function recomputeVenueProfiles(
  store: VenueHistoryStore,
  options: { limit?: number; now?: Date; scoreVersion?: string } = {}
): Promise<VenueRecomputeMetrics> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;
  const scoreVersion = options.scoreVersion ?? VENUE_PROFILE_SCORE_VERSION;
  const metrics: VenueRecomputeMetrics = { profilesRecomputed: 0, staleProfilesQueued: 0, failures: 0 };

  for (const venueId of await store.listStaleProfileVenueIds(scoreVersion, now, limit)) {
    await store.enqueueProfileRecompute(venueId, "stale");
    metrics.staleProfilesQueued += 1;
  }
  for (const job of await store.claimRecomputeJobs(limit)) {
    try {
      const events = await store.readVenueEvents(job.venueId);
      await store.upsertProfile(computeVenueProgrammingProfile(job.venueId, events, now, scoreVersion));
      await store.completeRecomputeJob(job.id, true);
      metrics.profilesRecomputed += 1;
    } catch {
      metrics.failures += 1;
      await store.completeRecomputeJob(job.id, false).catch(() => undefined);
    }
  }
  return metrics;
}

export interface RankedVenueProfile {
  venueId: string;
  fit: VenueFitResult;
  profile: VenueProgrammingProfile;
  stale: boolean;
}

export interface VenueDbFirstMetrics {
  dbHit: boolean;
  candidateVenues: number;
  profilesReused: number;
  staleProfilesReused: number;
  externalEnrichmentCallsAvoided: number;
  /** True when DB coverage is insufficient; a DB hit never disables discovery of new venues. */
  externalDiscoveryRecommended: boolean;
}

export interface VenueDbFirstOptions extends VenueFitInput {
  store: VenueHistoryStore;
  minimumVenues?: number;
  minimumConfidence?: number;
  scoreVersion?: string;
  now?: Date;
}

export async function findVenuesDbFirst(options: VenueDbFirstOptions): Promise<{ venues: RankedVenueProfile[]; metrics: VenueDbFirstMetrics }> {
  const now = options.now ?? new Date();
  const scoreVersion = options.scoreVersion ?? VENUE_PROFILE_SCORE_VERSION;
  const minimumVenues = options.minimumVenues ?? 5;
  const minimumConfidence = options.minimumConfidence ?? 0.3;
  const hosts = options.similarArtistIds?.length ? await options.store.findVenuesHostingArtists(options.similarArtistIds) : [];
  const profiles = hosts.length ? await options.store.readProfiles(hosts.map((host) => host.venueId), scoreVersion) : [];

  const venues: RankedVenueProfile[] = [];
  for (const profile of profiles) {
    if (profile.confidence < minimumConfidence) continue;
    const stale = isProfileStale(profile, now, scoreVersion);
    if (stale) {
      // Stale-while-revalidate: reuse now, refresh asynchronously.
      await options.store.enqueueProfileRecompute(profile.venueId, "stale").catch(() => undefined);
    }
    venues.push({ venueId: profile.venueId, profile, stale, fit: scoreVenueProfileFit(profile, options, now) });
  }
  venues.sort((a, b) => b.fit.score - a.fit.score);

  const staleCount = venues.filter((venue) => venue.stale).length;
  return {
    venues,
    metrics: {
      dbHit: venues.length > 0,
      candidateVenues: hosts.length,
      profilesReused: venues.length,
      staleProfilesReused: staleCount,
      externalEnrichmentCallsAvoided: venues.length - staleCount,
      externalDiscoveryRecommended: venues.length < minimumVenues
    }
  };
}
