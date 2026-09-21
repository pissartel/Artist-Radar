-- Global NextStage knowledge foundation (#265).
-- Existing workspace-owned snapshots remain user data. Canonical public facts
-- live in the global_* tables below and can only be mutated by trusted roles.

-- Provider-independent identities for every canonical entity. The existing
-- artist-specific table remains available for #263 compatibility and is
-- mirrored here by the repository.
create table if not exists public.global_external_identities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('artist', 'venue', 'event', 'organization')),
  entity_id uuid not null,
  provider text not null check (char_length(provider) between 1 and 80),
  provider_entity_id text not null check (char_length(provider_entity_id) between 1 and 500),
  canonical_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  next_refresh_at timestamptz,
  refresh_failure_count integer not null default 0 check (refresh_failure_count >= 0),
  last_refresh_error text,
  unique (provider, provider_entity_id),
  unique (entity_type, entity_id, provider)
);

insert into public.global_external_identities (
  entity_type, entity_id, provider, provider_entity_id, first_seen_at, last_seen_at, last_verified_at
)
select 'artist', artist_id, lower(provider), external_id, created_at, updated_at, updated_at
from public.global_artist_external_ids
on conflict (provider, provider_entity_id) do nothing;

-- Promoters, bookers, agencies, labels, managers and other industry actors.
-- global_promoters is retained for compatibility and can be linked through
-- global_entity_relationships during incremental backfill.
create table if not exists public.global_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_type text not null check (organization_type in (
    'promoter', 'booker', 'agency', 'label', 'manager', 'organizer', 'other'
  )),
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null,
  city text,
  country text,
  website_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  next_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_type, normalized_name)
);

-- Preserve the #264 promoter API while making each row resolve to the shared
-- organization model.
alter table public.global_promoters
  add column if not exists organization_id uuid references public.global_organizations(id) on delete restrict;
insert into public.global_organizations (organization_type, name, normalized_name)
select 'promoter', name, normalized_name from public.global_promoters
on conflict (organization_type, normalized_name) do update set name = excluded.name;
update public.global_promoters promoter set organization_id = organization.id
from public.global_organizations organization
where organization.organization_type = 'promoter'
  and organization.normalized_name = promoter.normalized_name
  and promoter.organization_id is null;
create unique index if not exists global_promoters_organization_uidx
  on public.global_promoters (organization_id) where organization_id is not null;

create or replace function public.sync_global_promoter_organization()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.global_organizations (organization_type, name, normalized_name, last_seen_at, updated_at)
  values ('promoter', new.name, new.normalized_name, now(), now())
  on conflict (organization_type, normalized_name) do update set
    name = excluded.name, last_seen_at = now(), updated_at = now()
  returning id into new.organization_id;
  return new;
end $$;
drop trigger if exists sync_global_promoter_organization on public.global_promoters;
create trigger sync_global_promoter_organization before insert or update of name, normalized_name
  on public.global_promoters for each row execute function public.sync_global_promoter_organization();

-- Durable, queryable edges. Typed columns keep graph queries relational while
-- allowing the entity set to grow without a table rewrite.
create table if not exists public.global_entity_relationships (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('artist', 'venue', 'event', 'organization')),
  subject_id uuid not null,
  relationship_type text not null check (relationship_type in (
    'similar_to', 'performed_at', 'lineup_artist', 'organized_by', 'promoted_by',
    'signed_to', 'managed_by', 'booked_by', 'represented_by'
  )),
  object_type text not null check (object_type in ('artist', 'venue', 'event', 'organization')),
  object_id uuid not null,
  data_class text not null check (data_class in ('observed', 'declared', 'inferred')),
  confidence real not null default 1 check (confidence between 0 and 1),
  algorithm_version text,
  computed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  next_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_type <> object_type or subject_id <> object_id),
  check (data_class <> 'inferred' or (algorithm_version is not null and computed_at is not null)),
  unique (subject_type, subject_id, relationship_type, object_type, object_id, data_class)
);

create table if not exists public.global_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  source_url text not null,
  source_type text not null default 'web',
  retrieved_at timestamptz not null,
  content_observed_at timestamptz,
  last_verified_at timestamptz,
  next_refresh_at timestamptz,
  http_status integer,
  retrieval_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_url)
);

create table if not exists public.global_provenance (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('artist', 'venue', 'event', 'organization', 'relationship')),
  entity_id uuid not null,
  field_name text,
  source_id uuid not null references public.global_sources(id) on delete restrict,
  data_class text not null check (data_class in ('observed', 'declared', 'inferred')),
  confidence real not null default 1 check (confidence between 0 and 1),
  algorithm_version text,
  computed_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (data_class <> 'inferred' or (algorithm_version is not null and computed_at is not null)),
  unique nulls not distinct (entity_type, entity_id, field_name, source_id, data_class)
);

create table if not exists public.global_professional_contacts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('artist', 'venue', 'organization')),
  entity_id uuid not null,
  contact_type text not null check (contact_type in ('email', 'phone', 'form', 'social', 'website')),
  contact_value text not null check (char_length(contact_value) between 1 and 1000),
  role text,
  is_public boolean not null default false,
  data_class text not null check (data_class in ('observed', 'declared')),
  source_id uuid not null references public.global_sources(id) on delete restrict,
  confidence real not null default 1 check (confidence between 0 and 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz,
  next_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (entity_type, entity_id, contact_type, contact_value, role)
);

-- Freshness fields are additive so persisted #263/#264 data is preserved.
alter table public.global_artists
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists last_verified_at timestamptz,
  add column if not exists next_refresh_at timestamptz,
  add column if not exists refresh_failure_count integer not null default 0,
  add column if not exists last_refresh_error text;

alter table public.global_venues
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists last_verified_at timestamptz,
  add column if not exists next_refresh_at timestamptz,
  add column if not exists refresh_failure_count integer not null default 0,
  add column if not exists last_refresh_error text;

alter table public.global_events
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists next_refresh_at timestamptz,
  add column if not exists refresh_failure_count integer not null default 0,
  add column if not exists last_refresh_error text;

alter table public.global_event_sources
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists last_verified_at timestamptz,
  add column if not exists retrieved_at timestamptz not null default now();

-- One provider record cannot identify two canonical events. Empty legacy IDs
-- remain supported for URL-only observations.
create unique index if not exists global_event_sources_provider_identity_uidx
  on public.global_event_sources (provider, external_id)
  where external_id <> '';

-- User-owned rows reference shared canonical entities without cloning them.
alter table public.artist_profiles
  add column if not exists canonical_artist_id uuid references public.global_artists(id) on delete set null;
alter table public.saved_opportunities
  add column if not exists global_venue_id uuid references public.global_venues(id) on delete set null,
  add column if not exists global_event_id uuid references public.global_events(id) on delete set null;

create index if not exists global_external_identities_entity_idx
  on public.global_external_identities (entity_type, entity_id);
create index if not exists global_external_identities_refresh_idx
  on public.global_external_identities (next_refresh_at) where next_refresh_at is not null;
create index if not exists global_organizations_location_idx
  on public.global_organizations (country, city, organization_type);
create index if not exists global_organizations_refresh_idx
  on public.global_organizations (next_refresh_at) where next_refresh_at is not null;
create index if not exists global_relationships_subject_idx
  on public.global_entity_relationships (subject_type, subject_id, relationship_type);
create index if not exists global_relationships_object_idx
  on public.global_entity_relationships (object_type, object_id, relationship_type);
create index if not exists global_relationships_refresh_idx
  on public.global_entity_relationships (next_refresh_at) where next_refresh_at is not null;
create index if not exists global_sources_refresh_idx
  on public.global_sources (next_refresh_at) where next_refresh_at is not null;
create index if not exists global_provenance_entity_idx
  on public.global_provenance (entity_type, entity_id, field_name);
create index if not exists global_professional_contacts_entity_idx
  on public.global_professional_contacts (entity_type, entity_id, contact_type);
create index if not exists global_professional_contacts_refresh_idx
  on public.global_professional_contacts (next_refresh_at) where next_refresh_at is not null;
create index if not exists global_events_status_date_idx
  on public.global_events (status, event_date desc);
create index if not exists global_events_refresh_idx
  on public.global_events (next_refresh_at) where next_refresh_at is not null;
create index if not exists artist_profiles_canonical_artist_idx
  on public.artist_profiles (canonical_artist_id) where canonical_artist_id is not null;
create index if not exists saved_opportunities_global_venue_idx
  on public.saved_opportunities (global_venue_id) where global_venue_id is not null;
create index if not exists global_venues_coords_idx
  on public.global_venues (latitude, longitude)
  where latitude is not null and longitude is not null;

-- PostGIS is optional on self-hosted/test Postgres. When available, create a
-- generated geography point and GiST index; latitude/longitude remain the
-- portable fallback used by every environment.
do $$
declare postgis_schema text;
begin
  begin
    create extension if not exists postgis with schema extensions;
  exception when others then
    raise notice 'PostGIS unavailable; retaining indexed latitude/longitude fallback';
  end;

  select namespace.nspname into postgis_schema
  from pg_extension ext
  join pg_namespace namespace on namespace.oid = ext.extnamespace
  where ext.extname = 'postgis';
  if postgis_schema is not null then
    execute format(
      'alter table public.global_venues add column if not exists location %1$I.geography(Point, 4326) generated always as (case when latitude is not null and longitude is not null then %1$I.st_setsrid(%1$I.st_makepoint(longitude, latitude), 4326)::%1$I.geography else null end) stored',
      postgis_schema
    );
    execute 'create index if not exists global_venues_location_gist_idx on public.global_venues using gist (location)';
  end if;
end $$;

-- Atomic canonical resolvers serialize competing discoveries by provider ID
-- or identity key. They are callable only by service_role.
create or replace function public.resolve_global_artist(
  requested_name text,
  requested_normalized_name text,
  requested_identity_key text,
  requested_provider text default null,
  requested_provider_entity_id text default null,
  requested_canonical_url text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare resolved_id uuid;
begin
  if nullif(trim(requested_name), '') is null or nullif(trim(requested_identity_key), '') is null then
    raise exception 'Artist name and identity key are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(requested_provider || ':' || requested_provider_entity_id, requested_identity_key), 0));

  if requested_provider is not null and requested_provider_entity_id is not null then
    select entity_id into resolved_id from public.global_external_identities
      where provider = lower(requested_provider) and provider_entity_id = requested_provider_entity_id
        and entity_type = 'artist';
  end if;

  if resolved_id is null then
    insert into public.global_artists (name, normalized_name, identity_key, last_seen_at, updated_at)
    values (requested_name, requested_normalized_name, requested_identity_key, now(), now())
    on conflict (identity_key) do update set
      name = excluded.name, normalized_name = excluded.normalized_name,
      last_seen_at = now(), updated_at = now()
    returning id into resolved_id;
  end if;

  if requested_provider is not null and requested_provider_entity_id is not null then
    insert into public.global_external_identities (
      entity_type, entity_id, provider, provider_entity_id, canonical_url, last_seen_at
    ) values (
      'artist', resolved_id, lower(requested_provider), requested_provider_entity_id,
      requested_canonical_url, now()
    ) on conflict (provider, provider_entity_id) do update set
      canonical_url = coalesce(excluded.canonical_url, global_external_identities.canonical_url),
      last_seen_at = now();
    insert into public.global_artist_external_ids (artist_id, provider, external_id, updated_at)
    values (resolved_id, lower(requested_provider), requested_provider_entity_id, now())
    on conflict (provider, external_id) do update set updated_at = now();
  end if;
  return resolved_id;
end $$;

create or replace function public.resolve_global_venue(
  requested_name text,
  requested_normalized_name text,
  requested_identity_key text,
  requested_city text default null,
  requested_country text default null,
  requested_latitude double precision default null,
  requested_longitude double precision default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare resolved_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(requested_identity_key, 0));
  insert into public.global_venues (
    name, normalized_name, identity_key, city, country, latitude, longitude, last_seen_at, updated_at
  ) values (
    requested_name, requested_normalized_name, requested_identity_key, requested_city,
    requested_country, requested_latitude, requested_longitude, now(), now()
  ) on conflict (identity_key) do update set
    name = excluded.name,
    city = coalesce(excluded.city, global_venues.city),
    country = coalesce(excluded.country, global_venues.country),
    latitude = coalesce(excluded.latitude, global_venues.latitude),
    longitude = coalesce(excluded.longitude, global_venues.longitude),
    last_seen_at = now(), updated_at = now()
  returning id into resolved_id;
  return resolved_id;
end $$;

create or replace function public.resolve_global_event(
  requested_venue_id uuid,
  requested_canonical_key text,
  requested_name text,
  requested_event_date date,
  requested_status text,
  requested_provider text default null,
  requested_provider_entity_id text default null,
  requested_source_url text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare resolved_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(requested_provider || ':' || requested_provider_entity_id, requested_canonical_key), 0));
  if requested_provider is not null and requested_provider_entity_id is not null then
    select entity_id into resolved_id from public.global_external_identities
      where provider = lower(requested_provider) and provider_entity_id = requested_provider_entity_id
        and entity_type = 'event';
  end if;

  if resolved_id is null then
    insert into public.global_events (
      venue_id, canonical_key, name, event_date, status, last_observed_at, updated_at
    ) values (
      requested_venue_id, requested_canonical_key, requested_name, requested_event_date,
      requested_status, now(), now()
    ) on conflict (canonical_key) do update set
      name = coalesce(excluded.name, global_events.name),
      status = case when global_events.status = 'cancelled' then 'cancelled' else excluded.status end,
      last_observed_at = now(), updated_at = now()
    returning id into resolved_id;
  end if;

  if requested_provider is not null and requested_provider_entity_id is not null then
    insert into public.global_external_identities (
      entity_type, entity_id, provider, provider_entity_id, canonical_url, last_seen_at
    ) values (
      'event', resolved_id, lower(requested_provider), requested_provider_entity_id,
      requested_source_url, now()
    ) on conflict (provider, provider_entity_id) do update set
      canonical_url = coalesce(excluded.canonical_url, global_external_identities.canonical_url),
      last_seen_at = now();
  end if;
  return resolved_id;
end $$;

-- Explicit table privileges and RLS: clients may read product knowledge but
-- receive no INSERT/UPDATE/DELETE privileges or policies.
alter table public.global_external_identities enable row level security;
alter table public.global_organizations enable row level security;
alter table public.global_entity_relationships enable row level security;
alter table public.global_sources enable row level security;
alter table public.global_provenance enable row level security;
alter table public.global_professional_contacts enable row level security;

create policy "Global external identities are publicly readable" on public.global_external_identities
  for select to anon, authenticated using (true);
create policy "Global organizations are publicly readable" on public.global_organizations
  for select to anon, authenticated using (true);
create policy "Global relationships are publicly readable" on public.global_entity_relationships
  for select to anon, authenticated using (true);
create policy "Global sources are publicly readable" on public.global_sources
  for select to anon, authenticated using (true);
create policy "Global provenance is publicly readable" on public.global_provenance
  for select to anon, authenticated using (true);
create policy "Verified public professional contacts are publicly readable" on public.global_professional_contacts
  for select to anon, authenticated using (is_public and last_verified_at is not null);

revoke all on public.global_external_identities, public.global_organizations,
  public.global_entity_relationships, public.global_sources, public.global_provenance,
  public.global_professional_contacts
  from anon, authenticated;
grant select on public.global_external_identities, public.global_organizations,
  public.global_entity_relationships, public.global_sources, public.global_provenance,
  public.global_professional_contacts
  to anon, authenticated;

revoke all on function public.resolve_global_artist(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_global_venue(text, text, text, text, text, double precision, double precision) from public, anon, authenticated;
revoke all on function public.resolve_global_event(uuid, text, text, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.resolve_global_artist(text, text, text, text, text, text) to service_role;
grant execute on function public.resolve_global_venue(text, text, text, text, text, double precision, double precision) to service_role;
grant execute on function public.resolve_global_event(uuid, text, text, date, text, text, text, text) to service_role;

comment on table public.global_external_identities is 'Provider identities for shared canonical knowledge; server-written, client-readable.';
comment on table public.global_provenance is 'Field/entity evidence. Inferred rows require versioned computation metadata.';
comment on table public.global_professional_contacts is 'Evidence-backed public professional contacts; inferred contacts are forbidden.';
comment on column public.artist_profiles.canonical_artist_id is 'Optional reference from a user-owned artist snapshot to shared knowledge.';
