import { z } from "zod";
import { normalizeArtistName } from "./artistSimilarityGraphService.js";
import { normalizeKey } from "../utils/venueNameNormalization.js";

export type KnowledgeEntityType = "artist" | "venue" | "event" | "organization";
export type KnowledgeDataClass = "observed" | "declared" | "inferred";

const providerIdentitySchema = z.object({
  provider: z.string().trim().min(1).max(80).transform((value) => value.toLowerCase()),
  providerEntityId: z.string().trim().min(1).max(500),
  canonicalUrl: z.string().url().nullable().optional()
});

const artistSchema = z.object({
  name: z.string().trim().min(1).max(200),
  identityKey: z.string().trim().min(1).optional(),
  identity: providerIdentitySchema.optional()
});

const venueSchema = z.object({
  name: z.string().trim().min(1).max(200),
  identityKey: z.string().trim().min(1),
  city: z.string().trim().min(1).nullable().optional(),
  country: z.string().trim().min(1).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional()
});

const eventSchema = z.object({
  venueId: z.string().uuid(),
  canonicalKey: z.string().trim().min(1),
  name: z.string().trim().min(1).max(300).nullable().optional(),
  eventDate: z.iso.date(),
  status: z.enum(["upcoming", "past", "cancelled", "unknown"]),
  identity: providerIdentitySchema.optional()
});

const relationshipSchema = z.object({
  subjectType: z.enum(["artist", "venue", "event", "organization"]),
  subjectId: z.string().uuid(),
  relationshipType: z.enum([
    "similar_to", "performed_at", "lineup_artist", "organized_by", "promoted_by",
    "signed_to", "managed_by", "booked_by", "represented_by"
  ]),
  objectType: z.enum(["artist", "venue", "event", "organization"]),
  objectId: z.string().uuid(),
  dataClass: z.enum(["observed", "declared", "inferred"]),
  confidence: z.number().min(0).max(1).default(1),
  algorithmVersion: z.string().trim().min(1).nullable().optional(),
  computedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  nextRefreshAt: z.iso.datetime({ offset: true }).nullable().optional()
}).superRefine((value, context) => {
  if (value.dataClass === "inferred" && (!value.algorithmVersion || !value.computedAt)) {
    context.addIssue({ code: "custom", message: "Inferred relationships require algorithmVersion and computedAt" });
  }
});

const provenanceSchema = z.object({
  entityType: z.enum(["artist", "venue", "event", "organization", "relationship"]),
  entityId: z.string().uuid(),
  fieldName: z.string().trim().min(1).nullable().optional(),
  provider: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  sourceType: z.string().trim().min(1).default("web"),
  retrievedAt: z.iso.datetime({ offset: true }),
  dataClass: z.enum(["observed", "declared", "inferred"]),
  confidence: z.number().min(0).max(1).default(1),
  algorithmVersion: z.string().trim().min(1).nullable().optional(),
  computedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).default({})
}).superRefine((value, context) => {
  if (value.dataClass === "inferred" && (!value.algorithmVersion || !value.computedAt)) {
    context.addIssue({ code: "custom", message: "Inferred provenance requires algorithmVersion and computedAt" });
  }
});

export type ResolveArtistInput = z.input<typeof artistSchema>;
export type ResolveVenueInput = z.input<typeof venueSchema>;
export type ResolveEventInput = z.input<typeof eventSchema>;
export type PersistRelationshipInput = z.input<typeof relationshipSchema>;
export type AttachProvenanceInput = z.input<typeof provenanceSchema>;

export interface GlobalKnowledgeRepositoryConfig {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof globalThis.fetch;
}

export function createGlobalKnowledgeRepository(
  env: NodeJS.ProcessEnv = process.env
): GlobalKnowledgeRepository | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return new GlobalKnowledgeRepository({ url, serviceRoleKey });
}

/** Trusted-server persistence boundary for shared canonical knowledge. */
export class GlobalKnowledgeRepository {
  private readonly fetcher: typeof globalThis.fetch;

  constructor(private readonly config: GlobalKnowledgeRepositoryConfig) {
    this.fetcher = config.fetch ?? globalThis.fetch;
  }

  async resolveArtist(input: ResolveArtistInput): Promise<string> {
    const value = artistSchema.parse(input);
    const normalizedName = normalizeArtistName(value.name);
    const identityKey = value.identityKey
      ?? (value.identity ? `${value.identity.provider}:${value.identity.providerEntityId}` : `name:${normalizedName}`);
    return this.rpcId("resolve_global_artist", {
      requested_name: value.name,
      requested_normalized_name: normalizedName,
      requested_identity_key: identityKey,
      requested_provider: value.identity?.provider ?? null,
      requested_provider_entity_id: value.identity?.providerEntityId ?? null,
      requested_canonical_url: value.identity?.canonicalUrl ?? null
    });
  }

  async resolveVenue(input: ResolveVenueInput): Promise<string> {
    const value = venueSchema.parse(input);
    return this.rpcId("resolve_global_venue", {
      requested_name: value.name,
      requested_normalized_name: normalizeKey(value.name),
      requested_identity_key: value.identityKey,
      requested_city: value.city ?? null,
      requested_country: value.country ?? null,
      requested_latitude: value.latitude ?? null,
      requested_longitude: value.longitude ?? null
    });
  }

  async resolveEvent(input: ResolveEventInput): Promise<string> {
    const value = eventSchema.parse(input);
    return this.rpcId("resolve_global_event", {
      requested_venue_id: value.venueId,
      requested_canonical_key: value.canonicalKey,
      requested_name: value.name ?? null,
      requested_event_date: value.eventDate,
      requested_status: value.status,
      requested_provider: value.identity?.provider ?? null,
      requested_provider_entity_id: value.identity?.providerEntityId ?? null,
      requested_source_url: value.identity?.canonicalUrl ?? null
    });
  }

  async attachExternalIdentity(entityType: KnowledgeEntityType, entityId: string, input: unknown): Promise<void> {
    const identity = providerIdentitySchema.parse(input);
    z.string().uuid().parse(entityId);
    await this.request("/rest/v1/global_external_identities?on_conflict=provider,provider_entity_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        entity_type: entityType, entity_id: entityId, provider: identity.provider,
        provider_entity_id: identity.providerEntityId, canonical_url: identity.canonicalUrl ?? null,
        last_seen_at: new Date().toISOString()
      })
    });
  }

  async persistRelationship(input: PersistRelationshipInput): Promise<void> {
    const value = relationshipSchema.parse(input);
    await this.request("/rest/v1/global_entity_relationships?on_conflict=subject_type,subject_id,relationship_type,object_type,object_id,data_class", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        subject_type: value.subjectType, subject_id: value.subjectId,
        relationship_type: value.relationshipType, object_type: value.objectType,
        object_id: value.objectId, data_class: value.dataClass, confidence: value.confidence,
        algorithm_version: value.algorithmVersion ?? null, computed_at: value.computedAt ?? null,
        next_refresh_at: value.nextRefreshAt ?? null, last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    });
  }

  async attachProvenance(input: AttachProvenanceInput): Promise<void> {
    const value = provenanceSchema.parse(input);
    const sourceRows = await this.request<Array<{ id: string }>>("/rest/v1/global_sources?on_conflict=provider,source_url", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        provider: value.provider, source_url: value.sourceUrl, source_type: value.sourceType,
        retrieved_at: value.retrievedAt, updated_at: new Date().toISOString()
      })
    });
    const sourceId = sourceRows[0]?.id;
    if (!sourceId) throw new Error("Supabase did not return a provenance source id");
    await this.request("/rest/v1/global_provenance?on_conflict=entity_type,entity_id,field_name,source_id,data_class", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        entity_type: value.entityType, entity_id: value.entityId, field_name: value.fieldName ?? null,
        source_id: sourceId, data_class: value.dataClass, confidence: value.confidence,
        algorithm_version: value.algorithmVersion ?? null, computed_at: value.computedAt ?? null,
        evidence: value.evidence, last_seen_at: new Date().toISOString()
      })
    });
  }

  async listStaleEntities(entityType: KnowledgeEntityType, before: Date, limit = 100): Promise<string[]> {
    const table = entityType === "artist" ? "global_artists"
      : entityType === "venue" ? "global_venues"
      : entityType === "event" ? "global_events" : "global_organizations";
    const rows = await this.request<Array<{ id: string }>>(
      `/rest/v1/${table}?next_refresh_at=lte.${encodeURIComponent(before.toISOString())}&select=id&order=next_refresh_at.asc&limit=${Math.max(1, Math.min(limit, 1000))}`
    );
    return rows.map((row) => row.id);
  }

  private async rpcId(name: string, body: Record<string, unknown>): Promise<string> {
    const result = await this.request<unknown>(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
    if (typeof result !== "string" || !result) throw new Error(`Supabase ${name} did not return an id`);
    return result;
  }

  private async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.config.url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) throw new Error(`Supabase global knowledge request failed (${response.status})`);
    if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
