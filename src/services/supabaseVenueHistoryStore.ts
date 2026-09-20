import type { PersistedEventInput, RecomputeJob, VenueHistoryStore } from "./venueHistoryService.js";
import {
  normalizeGenreKey,
  scaleBandToValue,
  venueIdentityKey,
  type BillingRole,
  type CanonicalEventRecord,
  type MergedVenueEvent,
  type VenueEventStatus,
  type VenueProgrammingProfile
} from "./venueProgrammingProfileService.js";
import { normalizeKey } from "../utils/venueNameNormalization.js";

interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

type Row = Record<string, unknown>;

const JOB_ENTITY = "venue";
const JOB_TYPE = "venue_programming_profile";

export function createSupabaseVenueHistoryStore(env: NodeJS.ProcessEnv = process.env): VenueHistoryStore | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return new SupabaseVenueHistoryStore({ url, serviceRoleKey });
}

export class SupabaseVenueHistoryStore implements VenueHistoryStore {
  constructor(private readonly config: SupabaseConfig) {}

  async upsertVenue(venue: MergedVenueEvent["venue"]): Promise<string> {
    const rows = await this.request<Array<{ id: string }>>("/rest/v1/global_venues?on_conflict=identity_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        name: venue.name,
        normalized_name: normalizeKey(venue.name),
        identity_key: venueIdentityKey(venue),
        city: venue.city ?? null,
        country: venue.country ?? null,
        latitude: venue.latitude ?? null,
        longitude: venue.longitude ?? null,
        updated_at: new Date().toISOString()
      })
    });
    const id = rows[0]?.id;
    if (!id) throw new Error("Supabase did not return a canonical venue id");
    return id;
  }

  async upsertEvent(venueId: string, { event, artists }: PersistedEventInput): Promise<"created" | "merged"> {
    const existing = await this.request<Array<{ id: string; status: string }>>(
      `/rest/v1/global_events?canonical_key=eq.${encodeURIComponent(event.canonicalKey)}&select=id,status&limit=1`
    );
    const promoterId = event.promoterName ? await this.upsertPromoter(event.promoterName) : null;
    const now = new Date().toISOString();
    // A previously recorded cancellation is not silently undone by a stale
    // source that has no contradicting evidence.
    const status = existing[0]?.status === "cancelled" ? "cancelled" : event.status;
    const rows = await this.request<Array<{ id: string }>>("/rest/v1/global_events?on_conflict=canonical_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        venue_id: venueId, canonical_key: event.canonicalKey, name: event.name, event_date: event.date,
        status, confidence: event.confidence, last_observed_at: now, updated_at: now,
        ...(promoterId ? { promoter_id: promoterId } : {})
      })
    });
    const eventId = rows[0]?.id;
    if (!eventId) throw new Error("Supabase did not return a canonical event id");

    await this.request("/rest/v1/global_event_sources?on_conflict=event_id,provider,external_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(event.sources.map((source) => ({
        event_id: eventId, provider: source.provider, external_id: source.externalId,
        source_url: source.url, confidence: source.confidence, observed_at: now
      })))
    });
    if (artists.length > 0) {
      await this.request("/rest/v1/global_event_artists?on_conflict=event_id,artist_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(artists.map((artist) => ({ event_id: eventId, artist_id: artist.artistId, billing_role: artist.billingRole })))
      });
    }
    await this.enqueueProfileRecompute(venueId, "new_event");
    return existing.length ? "merged" : "created";
  }

  private async upsertPromoter(name: string): Promise<string | null> {
    const rows = await this.request<Array<{ id: string }>>("/rest/v1/global_promoters?on_conflict=normalized_name", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ name, normalized_name: normalizeKey(name) })
    });
    return rows[0]?.id ?? null;
  }

  async readVenueEvents(venueId: string): Promise<CanonicalEventRecord[]> {
    const rows = await this.request<Row[]>(
      `/rest/v1/global_events?venue_id=eq.${venueId}&select=event_date,status,confidence,promoter_id,global_event_artists(artist_id,billing_role,global_artists(genres,scale_band))&order=event_date.desc&limit=1000`
    );
    return rows.map((row) => ({
      venueId,
      date: String(row.event_date),
      status: String(row.status) as VenueEventStatus,
      confidence: Number(row.confidence),
      promoterId: (row.promoter_id as string | null) ?? null,
      artists: (Array.isArray(row.global_event_artists) ? row.global_event_artists as Row[] : []).map((link) => {
        const artist = (link.global_artists ?? {}) as Row;
        return {
          artistId: String(link.artist_id),
          billingRole: String(link.billing_role) as BillingRole,
          genres: (Array.isArray(artist.genres) ? artist.genres.map(String) : []).filter((g) => normalizeGenreKey(g)),
          scale: scaleBandToValue(artist.scale_band as string | null)
        };
      })
    }));
  }

  async readProfiles(venueIds: string[], scoreVersion: string): Promise<VenueProgrammingProfile[]> {
    if (venueIds.length === 0) return [];
    const rows = await this.request<Row[]>(
      `/rest/v1/venue_programming_profiles?venue_id=in.(${venueIds.join(",")})&score_version=eq.${encodeURIComponent(scoreVersion)}&select=*`
    );
    return rows.map(mapProfile);
  }

  async upsertProfile(profile: VenueProgrammingProfile): Promise<void> {
    await this.request("/rest/v1/venue_programming_profiles?on_conflict=venue_id,score_version", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        venue_id: profile.venueId, score_version: profile.scoreVersion,
        normalized_genres: profile.normalizedGenres, genre_affinity_scores: profile.genreAffinityScores,
        relevant_artist_ids: profile.relevantArtistIds,
        median_artist_scale: profile.medianArtistScale, min_artist_scale: profile.minArtistScale,
        max_artist_scale: profile.maxArtistScale, emerging_artist_share: profile.emergingArtistShare,
        events_last_90_days: profile.eventsLast90Days, events_last_365_days: profile.eventsLast365Days,
        latest_known_event_at: profile.latestKnownEventAt, promoter_ids: profile.promoterIds,
        evidence_count: profile.evidenceCount, confidence: profile.confidence,
        computed_at: profile.computedAt, next_refresh_at: profile.nextRefreshAt
      })
    });
  }

  async enqueueProfileRecompute(venueId: string, reason: "new_event" | "stale" | "score_version"): Promise<void> {
    await this.request("/rest/v1/global_enrichment_jobs?on_conflict=entity_type,entity_id,job_type,status", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ entity_type: JOB_ENTITY, entity_id: venueId, job_type: JOB_TYPE, reason, status: "pending" })
    });
  }

  async claimRecomputeJobs(limit: number): Promise<RecomputeJob[]> {
    const pending = await this.request<Array<{ id: string; entity_id: string }>>(
      `/rest/v1/global_enrichment_jobs?entity_type=eq.${JOB_ENTITY}&job_type=eq.${JOB_TYPE}&status=eq.pending&available_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id,entity_id&order=created_at.asc&limit=${limit}`
    );
    const claimed: RecomputeJob[] = [];
    for (const job of pending) {
      // The unique (entity, job_type, status) key means a stale 'running' row
      // for the same venue can block the claim; treat that as "not claimed".
      try {
        await this.request(`/rest/v1/global_enrichment_jobs?id=eq.${job.id}&status=eq.pending`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "running", updated_at: new Date().toISOString() })
        });
        claimed.push({ id: job.id, venueId: job.entity_id });
      } catch {
        continue;
      }
    }
    return claimed;
  }

  async completeRecomputeJob(jobId: string, ok: boolean): Promise<void> {
    // Delete instead of parking in 'complete'/'failed': those states share the
    // unique key and would block the next job for the same venue.
    if (ok) {
      await this.request(`/rest/v1/global_enrichment_jobs?id=eq.${jobId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return;
    }
    await this.request(`/rest/v1/global_enrichment_jobs?id=eq.${jobId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "pending", available_at: new Date(Date.now() + 3_600_000).toISOString(), updated_at: new Date().toISOString() })
    });
  }

  async listStaleProfileVenueIds(scoreVersion: string, now: Date, limit: number): Promise<string[]> {
    const rows = await this.request<Array<{ venue_id: string }>>(
      `/rest/v1/venue_programming_profiles?score_version=eq.${encodeURIComponent(scoreVersion)}&next_refresh_at=lte.${encodeURIComponent(now.toISOString())}&select=venue_id&order=next_refresh_at.asc&limit=${limit}`
    );
    return rows.map((row) => row.venue_id);
  }

  async findVenuesHostingArtists(artistIds: string[], minDistinctArtists = 1): Promise<Array<{ venueId: string; distinctArtists: number }>> {
    const rows = await this.request<Array<{ venue_id: string; distinct_artists: number }>>("/rest/v1/rpc/venues_hosting_artists", {
      method: "POST",
      body: JSON.stringify({ artist_ids: artistIds, min_distinct_artists: minDistinctArtists })
    });
    return rows.map((row) => ({ venueId: row.venue_id, distinctArtists: row.distinct_artists }));
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) throw new Error(`Supabase venue history request failed (${response.status})`);
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

function mapProfile(row: Row): VenueProgrammingProfile {
  const nullable = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    venueId: String(row.venue_id),
    dataOrigin: "inferred",
    normalizedGenres: Array.isArray(row.normalized_genres) ? row.normalized_genres.map(String) : [],
    genreAffinityScores: (row.genre_affinity_scores ?? {}) as Record<string, number>,
    relevantArtistIds: Array.isArray(row.relevant_artist_ids) ? row.relevant_artist_ids.map(String) : [],
    medianArtistScale: nullable(row.median_artist_scale),
    minArtistScale: nullable(row.min_artist_scale),
    maxArtistScale: nullable(row.max_artist_scale),
    emergingArtistShare: nullable(row.emerging_artist_share),
    eventsLast90Days: Number(row.events_last_90_days ?? 0),
    eventsLast365Days: Number(row.events_last_365_days ?? 0),
    latestKnownEventAt: (row.latest_known_event_at as string | null) ?? null,
    promoterIds: Array.isArray(row.promoter_ids) ? row.promoter_ids.map(String) : [],
    evidenceCount: Number(row.evidence_count ?? 0),
    confidence: Number(row.confidence),
    scoreVersion: String(row.score_version),
    computedAt: String(row.computed_at),
    nextRefreshAt: String(row.next_refresh_at)
  };
}
