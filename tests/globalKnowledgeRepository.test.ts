import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { GlobalKnowledgeRepository } from "../src/services/globalKnowledgeRepository.js";

const migration = readFileSync(
  new URL("../supabase/migrations/20260921150000_integrate_global_knowledge_layer.sql", import.meta.url),
  "utf8"
);

function response(value: unknown, status = 200): Response {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: value === undefined ? {} : { "Content-Type": "application/json" }
  });
}

describe("GlobalKnowledgeRepository", () => {
  it("uses the atomic artist resolver and keeps the service credential server-side", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response("6da40f90-df4d-4615-9771-c72523455c06"));
    const repository = new GlobalKnowledgeRepository({
      url: "https://example.supabase.co/",
      serviceRoleKey: "server-secret",
      fetch: fetcher
    });

    await expect(repository.resolveArtist({
      name: "Tuesday Fall",
      identity: { provider: "Spotify", providerEntityId: "spotify-123" }
    })).resolves.toBe("6da40f90-df4d-4615-9771-c72523455c06");

    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://example.supabase.co/rest/v1/rpc/resolve_global_artist");
    expect(init?.headers).toMatchObject({ apikey: "server-secret", Authorization: "Bearer server-secret" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      requested_normalized_name: "tuesday fall",
      requested_identity_key: "spotify:spotify-123",
      requested_provider: "spotify",
      requested_provider_entity_id: "spotify-123"
    });
  });

  it("resolves the same event through provider-aware atomic RPC calls", async () => {
    const eventId = "2b110b9b-b8a7-41ef-9201-074c33f14c68";
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(eventId))
      .mockResolvedValueOnce(response(eventId));
    const repository = new GlobalKnowledgeRepository({
      url: "https://example.supabase.co", serviceRoleKey: "secret", fetch: fetcher
    });
    const common = {
      venueId: "824e17fe-42c5-4335-a5ef-e847264328ae",
      canonicalKey: "le-klub|2026-09-30|shared-show",
      name: "Shared Show",
      eventDate: "2026-09-30",
      status: "upcoming" as const
    };

    const ticketmaster = await repository.resolveEvent({
      ...common, identity: { provider: "ticketmaster", providerEntityId: "tm-1" }
    });
    const songkick = await repository.resolveEvent({
      ...common, identity: { provider: "songkick", providerEntityId: "sk-9" }
    });

    expect(ticketmaster).toBe(eventId);
    expect(songkick).toBe(eventId);
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith("/rpc/resolve_global_event"))).toBe(true);
  });

  it("requires version and computation time for inferred relationships", async () => {
    const repository = new GlobalKnowledgeRepository({
      url: "https://example.supabase.co", serviceRoleKey: "secret", fetch: vi.fn()
    });
    await expect(repository.persistRelationship({
      subjectType: "artist",
      subjectId: "6da40f90-df4d-4615-9771-c72523455c06",
      relationshipType: "similar_to",
      objectType: "artist",
      objectId: "2b110b9b-b8a7-41ef-9201-074c33f14c68",
      dataClass: "inferred",
      confidence: 0.8
    })).rejects.toThrow("Inferred relationships require");
  });

  it("upserts provenance without allowing an inferred fact to masquerade as observed", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ id: "8a559c99-2acb-4407-880f-bd2e157b31d1" }]))
      .mockResolvedValueOnce(response(undefined, 204));
    const repository = new GlobalKnowledgeRepository({
      url: "https://example.supabase.co", serviceRoleKey: "secret", fetch: fetcher
    });
    await repository.attachProvenance({
      entityType: "venue",
      entityId: "824e17fe-42c5-4335-a5ef-e847264328ae",
      provider: "official_site",
      sourceUrl: "https://venue.example/programme",
      retrievedAt: "2026-09-21T10:00:00.000Z",
      dataClass: "declared",
      confidence: 0.95,
      evidence: { field: "capacity" }
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("global_sources");
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("global_provenance");
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).data_class).toBe("declared");
  });
});

describe("global knowledge migration contract", () => {
  it("keeps user snapshots separate while allowing shared canonical references", () => {
    expect(migration).toContain("alter table public.artist_profiles");
    expect(migration).toContain("canonical_artist_id uuid references public.global_artists");
    expect(migration).toContain("global_venue_id uuid references public.global_venues");
  });

  it("retains past events and deduplicates provider identities and relationships", () => {
    expect(migration).not.toMatch(/delete from public\.global_events/i);
    expect(migration).toContain("unique (provider, provider_entity_id)");
    expect(migration).toContain("global_event_sources_provider_identity_uidx");
    expect(migration).toContain("unique (subject_type, subject_id, relationship_type, object_type, object_id, data_class)");
  });

  it("allows public reads but reserves writes and resolver execution for service_role", () => {
    expect(migration).toContain("grant select on public.global_external_identities");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/for (insert|update|delete) to anon|for (insert|update|delete) to authenticated/i);
    expect(migration).toContain("using (is_public and last_verified_at is not null)");
  });

  it("supports portable coordinates and optional indexed PostGIS radius queries", () => {
    expect(migration).toContain("PostGIS unavailable");
    expect(migration).toContain("global_venues_location_gist_idx");
    expect(migration).toContain("global_venues_coords_idx");
  });
});
