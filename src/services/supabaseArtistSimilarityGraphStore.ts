import type {
  ArtistObservation,
  CanonicalArtistIdentity,
  PersistedSimilarityEdge,
  SimilarityGraphStore
} from "./artistSimilarityGraphService.js";
import { normalizeArtistName } from "./artistSimilarityGraphService.js";
import { createHash } from "node:crypto";

interface SupabaseGraphConfig {
  url: string;
  serviceRoleKey: string;
}

type JsonRecord = Record<string, unknown>;

export function createSupabaseArtistSimilarityGraphStore(
  env: NodeJS.ProcessEnv = process.env
): SimilarityGraphStore | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return new SupabaseArtistSimilarityGraphStore({ url, serviceRoleKey });
}

export class SupabaseArtistSimilarityGraphStore implements SimilarityGraphStore {
  constructor(private readonly config: SupabaseGraphConfig) {}

  async resolveArtist(identity: CanonicalArtistIdentity): Promise<string> {
    for (const [provider, externalId] of externalIds(identity)) {
      const matches = await this.request<Array<{ artist_id: string }>>(
        `/rest/v1/global_artist_external_ids?provider=eq.${encodeURIComponent(provider)}&external_id=eq.${encodeURIComponent(externalId)}&select=artist_id&limit=1`
      );
      if (matches[0]) {
        await this.updateArtist(matches[0].artist_id, identity);
        await this.upsertExternalIds(matches[0].artist_id, identity);
        return matches[0].artist_id;
      }
    }

    const normalizedName = normalizeArtistName(identity.name);
    // Stable provider IDs are authoritative. Name matching is only safe when
    // neither side has an external identity; otherwise homonymous artists
    // could be silently collapsed.
    if (externalIds(identity).length === 0) {
      const nameMatches = await this.request<Array<{ id: string }>>(
        `/rest/v1/global_artists?normalized_name=eq.${encodeURIComponent(normalizedName)}&select=id&limit=2`
      );
      if (nameMatches.length === 1) {
        const artistId = nameMatches[0]!.id;
        await this.updateArtist(artistId, identity);
        return artistId;
      }
    }

    const rows = await this.request<Array<{ id: string }>>(
      "/rest/v1/global_artists?on_conflict=identity_key",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(artistRow(identity, normalizedName))
      }
    );
    const artistId = rows[0]?.id;
    if (!artistId) throw new Error("Supabase did not return a canonical artist id");

    await this.upsertExternalIds(artistId, identity);
    return artistId;
  }

  private async upsertExternalIds(artistId: string, identity: CanonicalArtistIdentity): Promise<void> {
    for (const [provider, externalId] of externalIds(identity)) {
      await this.request("/rest/v1/global_artist_external_ids?on_conflict=provider,external_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ artist_id: artistId, provider, external_id: externalId, updated_at: new Date().toISOString() })
      });
    }
  }

  async readEdges(artistId: string, scoreVersion: string): Promise<PersistedSimilarityEdge[]> {
    const select = "artist_id,similar_artist_id,score,score_version,genre_score,audience_score,geography_score,provider_score,confidence,sources,first_seen_at,last_computed_at,next_refresh_at,evidence";
    const [forward, reverse] = await Promise.all([
      this.request<JsonRecord[]>(`/rest/v1/artist_similarity_edges?artist_id=eq.${artistId}&score_version=eq.${encodeURIComponent(scoreVersion)}&select=${select}`),
      this.request<JsonRecord[]>(`/rest/v1/artist_similarity_edges?similar_artist_id=eq.${artistId}&score_version=eq.${encodeURIComponent(scoreVersion)}&select=${select}`)
    ]);
    return [...forward, ...reverse].map((row) => mapEdge(row, artistId));
  }

  async hasEdgesForOtherScoreVersion(artistId: string, scoreVersion: string): Promise<boolean> {
    const rows = await this.request<Array<{ score_version: string }>>(
      `/rest/v1/artist_similarity_edges?or=(artist_id.eq.${artistId},similar_artist_id.eq.${artistId})&score_version=neq.${encodeURIComponent(scoreVersion)}&select=score_version&limit=1`
    );
    return rows.length > 0;
  }

  async upsertEdge(edge: Omit<PersistedSimilarityEdge, "firstSeenAt">): Promise<"created" | "recomputed"> {
    const existing = await this.request<Array<{ artist_id: string; sources: unknown; evidence: unknown }>>(
      `/rest/v1/artist_similarity_edges?artist_id=eq.${edge.artistId}&similar_artist_id=eq.${edge.similarArtistId}&score_version=eq.${encodeURIComponent(edge.scoreVersion)}&select=artist_id,sources,evidence&limit=1`
    );
    const previous = existing[0];
    const sources = uniqueStrings(previous?.sources, edge.sources);
    const evidence = mergeEvidence(previous?.evidence, edge, sources);
    await this.request("/rest/v1/artist_similarity_edges?on_conflict=artist_id,similar_artist_id,score_version", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        artist_id: edge.artistId,
        similar_artist_id: edge.similarArtistId,
        score: edge.score,
        score_version: edge.scoreVersion,
        genre_score: edge.genreScore,
        audience_score: edge.audienceScore,
        geography_score: edge.geographyScore,
        provider_score: edge.providerScore,
        confidence: edge.confidence,
        sources,
        evidence,
        last_computed_at: edge.lastComputedAt,
        next_refresh_at: edge.nextRefreshAt
      })
    });
    return existing.length ? "recomputed" : "created";
  }

  async enqueueRefresh(artistId: string, reason: "stale" | "sparse" | "score_version"): Promise<void> {
    await this.request("/rest/v1/global_enrichment_jobs?on_conflict=entity_type,entity_id,job_type,status", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ entity_type: "artist", entity_id: artistId, job_type: "similarity_graph", reason, status: "pending" })
    });
  }

  async recordArtistObservation(artistId: string, observation: ArtistObservation): Promise<void> {
    const observationKey = createHash("sha256").update([
      artistId,
      observation.role,
      observation.sourceProvider,
      observation.sourceUrl ?? "",
      observation.eventExternalId ?? "",
      observation.eventName ?? "",
      observation.venueName ?? ""
    ].join("|")).digest("hex");
    await this.request("/rest/v1/global_artist_observations?on_conflict=observation_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        artist_id: artistId,
        observation_key: observationKey,
        role: observation.role,
        source_provider: observation.sourceProvider,
        source_url: observation.sourceUrl ?? null,
        event_external_id: observation.eventExternalId ?? null,
        event_name: observation.eventName ?? null,
        venue_name: observation.venueName ?? null,
        confidence: observation.confidence,
        evidence: observation.evidence ?? {},
        last_observed_at: observation.observedAt,
        updated_at: observation.observedAt
      })
    });
  }

  private async updateArtist(artistId: string, identity: CanonicalArtistIdentity): Promise<void> {
    const row = artistPatch(identity);
    await this.request(`/rest/v1/global_artists?id=eq.${artistId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
    });
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
    if (!response.ok) throw new Error(`Supabase similarity graph request failed (${response.status})`);
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    return response.json() as Promise<T>;
  }
}

function externalIds(identity: CanonicalArtistIdentity): Array<[string, string]> {
  return [
    ["spotify", identity.spotifyId],
    ["chartmetric", identity.chartmetricId],
    ["musicbrainz", identity.musicBrainzId],
    ["deezer", identity.deezerId]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));
}

function artistRow(identity: CanonicalArtistIdentity, normalizedName: string): JsonRecord {
  return {
    name: identity.name,
    normalized_name: normalizedName,
    identity_key: identityKey(identity, normalizedName),
    genres: identity.genres ?? [],
    city: identity.city ?? null,
    country: identity.country ?? null,
    scale_band: identity.scaleBand ?? null,
    profile_data: identity.profileData ?? {},
    metadata_refreshed_at: new Date().toISOString()
  };
}

function artistPatch(identity: CanonicalArtistIdentity): JsonRecord {
  const row: JsonRecord = {
    name: identity.name,
    normalized_name: normalizeArtistName(identity.name),
    metadata_refreshed_at: new Date().toISOString()
  };
  if (identity.genres?.length) row.genres = identity.genres;
  if (identity.city) row.city = identity.city;
  if (identity.country) row.country = identity.country;
  if (identity.scaleBand) row.scale_band = identity.scaleBand;
  if (identity.profileData && Object.keys(identity.profileData).length > 0) row.profile_data = identity.profileData;
  return row;
}

function identityKey(identity: CanonicalArtistIdentity, normalizedName: string): string {
  const stable = externalIds(identity)[0];
  return stable ? `${stable[0]}:${stable[1]}` : `name:${normalizedName}`;
}

function mapEdge(row: JsonRecord, requestedArtistId: string): PersistedSimilarityEdge {
  const evidence = row.evidence as {
    result?: PersistedSimilarityEdge["result"];
    reverseResult?: PersistedSimilarityEdge["result"];
  };
  const isForward = row.artist_id === requestedArtistId;
  return {
    artistId: requestedArtistId,
    similarArtistId: isForward ? String(row.similar_artist_id) : String(row.artist_id),
    score: Number(row.score),
    scoreVersion: String(row.score_version),
    genreScore: nullableNumber(row.genre_score),
    audienceScore: nullableNumber(row.audience_score),
    geographyScore: nullableNumber(row.geography_score),
    providerScore: nullableNumber(row.provider_score),
    confidence: Number(row.confidence),
    sources: Array.isArray(row.sources) ? row.sources.map(String) : [],
    firstSeenAt: String(row.first_seen_at),
    lastComputedAt: String(row.last_computed_at),
    nextRefreshAt: String(row.next_refresh_at),
    result: (isForward ? evidence.result : evidence.reverseResult) ?? evidence.result!,
    reverseResult: evidence.reverseResult
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || typeof value === "undefined" ? null : Number(value);
}

function uniqueStrings(previous: unknown, current: string[]): string[] {
  const values = Array.isArray(previous) ? previous.map(String) : [];
  return [...new Set([...values, ...current].filter(Boolean))];
}

function mergeEvidence(
  previous: unknown,
  edge: Omit<PersistedSimilarityEdge, "firstSeenAt">,
  sources: string[]
): JsonRecord {
  const oldEvidence = isRecord(previous) ? previous : {};
  const oldProviderEvidence = isRecord(oldEvidence.providerEvidence) ? oldEvidence.providerEvidence : {};
  const providerEvidence: JsonRecord = { ...oldProviderEvidence };
  for (const source of sources) {
    if (edge.sources.includes(source)) {
      providerEvidence[source] = {
        observedAt: edge.lastComputedAt,
        confidence: edge.confidence,
        providerScore: edge.providerScore
      };
    }
  }
  return {
    ...oldEvidence,
    result: edge.result,
    reverseResult: edge.reverseResult,
    providerEvidence
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
