# Global knowledge in Supabase

Artist Radar stores shared music-industry knowledge in the existing Supabase
Postgres project. It does not use a second database.

## Ownership boundary

- `workspaces`, `artist_profiles`, `analysis_runs` and `saved_opportunities`
  remain user-owned and protected by workspace RLS.
- `global_artists`, `global_venues`, `global_events`, organizations,
relationships, external identities, sources and provenance are shared
  canonical knowledge.
- User rows may reference canonical rows through nullable foreign keys. The
  existing JSON snapshots are preserved and require no destructive backfill.

## Read and write policy

Anonymous and authenticated clients may select the global tables currently
used by the product. They have no insert, update or delete policy or table
privilege. Canonical writes use `GlobalKnowledgeRepository` on trusted server
paths with `SUPABASE_SERVICE_ROLE_KEY`; that key must never use a
`NEXT_PUBLIC_` name or be bundled into the frontend. Atomic resolver RPCs are
granted only to `service_role`.

## Evidence and freshness

Facts are classified as `observed`, `declared` or `inferred`. Inferred
relationships and provenance require an algorithm version and computation
timestamp. Evidence rows are separate, so an inference cannot overwrite an
observed or declared row. Entities and sources carry independent seen,
verified and refresh timestamps; there is intentionally no global TTL.
Professional contacts require provenance, cannot be classified as inferred,
and are client-readable only when explicitly public and verified.

## Geography

Country, city, latitude and longitude are always retained and indexed. The
migration attempts to enable PostGIS and adds a generated geography point plus
GiST index when available. On Postgres installations where PostGIS cannot be
enabled, the migration continues with the coordinate index as a portable
fallback.
