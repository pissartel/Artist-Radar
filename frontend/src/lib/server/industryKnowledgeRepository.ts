import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/auth/server";
import { isAuthConfigured } from "@/lib/auth/config";

type Context = { country: string | null; normalizedGenres: string[]; similarArtists: Array<{ name: string }> };
type Organization = Record<string, unknown> & { name: string; normalizedName: string; organizationType: string; confidenceScore: number; sources: unknown[]; contacts: unknown[]; artistRelations: unknown[] };

export async function createIndustryKnowledgeRepository() {
  if (!isAuthConfigured()) return undefined;
  return {
    async search(context: Context, limit: number): Promise<Organization[]> {
      const client = await createClient();
      let query = client.from("industry_organizations").select("*, industry_contacts(*), industry_artist_relations(*), industry_sources(*)").order("last_verified_at", { ascending: false, nullsFirst: false }).limit(limit);
      if (context.country) query = query.or(`country.ilike.${escapeFilter(context.country)},country.is.null`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
    async upsert(organizations: Organization[]): Promise<Organization[]> {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !serviceKey) return organizations; // read-only deployment: graceful degradation
      const admin = createSupabaseClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const persisted: Organization[] = [];
      for (const organization of organizations) {
        const website = typeof organization.website === "string" ? organization.website : null;
        const normalizedDomain = website ? safeDomain(website) : null;
        const payload = {
          name: organization.name, normalized_name: organization.normalizedName,
          organization_type: organization.organizationType, country: organization.country ?? null,
          city: organization.city ?? null, website, normalized_domain: normalizedDomain,
          instagram: organization.instagram ?? null, genres: organization.genres ?? [],
          submission_url: organization.submissionUrl ?? null, confidence_score: organization.confidenceScore,
          last_seen_at: new Date().toISOString(), last_verified_at: organization.lastVerifiedAt ?? null
        };
        const conflict = normalizedDomain ? "organization_type,normalized_domain" : "organization_type,normalized_name,country";
        const { data: row, error } = await admin.from("industry_organizations").upsert(payload, { onConflict: conflict }).select("id").single();
        if (error) throw error;
        const organizationId = row.id as string;
        await Promise.all([
          upsertChildren(admin, "industry_contacts", (organization.contacts as Record<string, unknown>[]).map((v) => ({ organization_id: organizationId, name: v.name ?? null, role: v.role ?? null, email: v.email ?? null, public_profile_url: v.publicProfileUrl ?? null, source_url: v.sourceUrl, last_verified_at: v.lastVerifiedAt ?? null })), "organization_id,email,source_url"),
          upsertChildren(admin, "industry_artist_relations", (organization.artistRelations as Record<string, unknown>[]).map((v) => ({ organization_id: organizationId, artist_name: v.artistName, normalized_artist_name: normalize(String(v.artistName)), artist_external_id: v.artistExternalId ?? null, spotify_id: v.spotifyId ?? null, musicbrainz_id: v.musicBrainzId ?? null, relationship_type: v.relationshipType, active: v.active ?? null, source_url: v.sourceUrl, last_seen_at: new Date().toISOString(), last_verified_at: v.lastVerifiedAt ?? null })), "organization_id,normalized_artist_name,relationship_type,source_url"),
          upsertChildren(admin, "industry_sources", (organization.sources as Record<string, unknown>[]).map((v) => ({ organization_id: organizationId, url: v.url, title: v.title ?? null, source_type: v.sourceType, confidence: v.confidence, last_seen_at: new Date().toISOString(), last_verified_at: v.lastVerifiedAt ?? null })), "organization_id,url")
        ]);
        persisted.push({ ...organization, id: organizationId });
      }
      return persisted;
    }
  };
}

function mapRow(row: Record<string, unknown>): Organization {
  return {
    id: row.id, name: row.name, normalizedName: row.normalized_name, organizationType: row.organization_type,
    country: row.country, city: row.city, website: row.website, instagram: row.instagram, genres: row.genres ?? [],
    submissionUrl: row.submission_url, confidenceScore: row.confidence_score,
    firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, lastVerifiedAt: row.last_verified_at,
    contacts: ((row.industry_contacts as Record<string, unknown>[]) ?? []).map((v) => ({ name: v.name, role: v.role, email: v.email, publicProfileUrl: v.public_profile_url, sourceUrl: v.source_url, lastVerifiedAt: v.last_verified_at })),
    artistRelations: ((row.industry_artist_relations as Record<string, unknown>[]) ?? []).map((v) => ({ artistName: v.artist_name, artistExternalId: v.artist_external_id, spotifyId: v.spotify_id, musicBrainzId: v.musicbrainz_id, relationshipType: v.relationship_type, active: v.active, sourceUrl: v.source_url, firstSeenAt: v.first_seen_at, lastSeenAt: v.last_seen_at, lastVerifiedAt: v.last_verified_at })),
    sources: ((row.industry_sources as Record<string, unknown>[]) ?? []).map((v) => ({ url: v.url, title: v.title, sourceType: v.source_type, confidence: v.confidence, lastVerifiedAt: v.last_verified_at }))
  } as Organization;
}

async function upsertChildren(client: any, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows as any, { onConflict });
  if (error) throw error;
}
function safeDomain(url: string): string | null { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } }
function normalize(value: string): string { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function escapeFilter(value: string): string { return `"${value.replaceAll('"', '')}"`; }
