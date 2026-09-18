import type {
  CanonicalArtistIdentity,
  PersistedSimilarityEdge,
  SimilarityGraphStore
} from "./artistSimilarityGraphService.js";
import { normalizeArtistName } from "./artistSimilarityGraphService.js";

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
    const nameMatches = await this.request<Array<{ id: string }>>(
      `/rest/v1/global_artists?normalized_name=eq.${encodeURIComponent(normalizedName)}&select=id&limit=2`
    );
    // A unique normalized-name match safely collapses punctuation/case
    // variants. Ambiguous names remain separate until a stable provider ID
    // can disambiguate them.
    if (nameMatches.length === 1) {
      const artistId = nameMatches[0]!.id;
      await this.updateArtist(artistId, identity);
      await this.upsertExternalIds(artistId, identity);
      return artistId;
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

  async upsertEdge(edge: Omit<PersistedSimilarityEdge, "firstSeenAt">): Promise<"created" | "recomputed"> {
    const existing = await this.request<Array<{ artist_id: string }>>(
      `/rest/v1/artist_similarity_edges?artist_id=eq.${edge.artistId}&similar_artist_id=eq.${edge.similarArtistId}&score_version=eq.${encodeURIComponent(edge.scoreVersion)}&select=artist_id&limit=1`
    );
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
        sources: edge.sources,
        evidence: { result: edge.result, reverseResult: edge.reverseResult },
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

  private async updateArtist(artistId: string, identity: CanonicalArtistIdentity): Promise<void> {
    const row = artistRow(identity, normalizeArtistName(identity.name));
    // identity_key is immutable once the canonical row exists. A later
    // provider ID enriches global_artist_external_ids instead of renaming
    // the canonical key and risking a uniqueness conflict.
    delete row.identity_key;
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
