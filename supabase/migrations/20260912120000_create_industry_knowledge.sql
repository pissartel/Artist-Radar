-- Shared, reusable public industry knowledge. Artist-specific saved state
-- remains in saved_opportunities and retains its existing owner-scoped RLS.
create table if not exists public.industry_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  organization_type text not null check (organization_type in ('booker','booking_agency','promoter','manager','management_company','label')),
  country text, city text, website text, normalized_domain text, instagram text,
  genres text[] not null default '{}', submission_url text,
  confidence_score double precision not null check (confidence_score between 0 and 1),
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  last_verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists industry_org_domain_type_uidx on public.industry_organizations (organization_type, normalized_domain) where normalized_domain is not null;
create unique index if not exists industry_org_name_country_type_uidx on public.industry_organizations (organization_type, normalized_name, country);
create index if not exists industry_org_name_country_idx on public.industry_organizations (normalized_name, country);
create index if not exists industry_org_genres_idx on public.industry_organizations using gin (genres);
create index if not exists industry_org_freshness_idx on public.industry_organizations (last_verified_at desc);

create table if not exists public.industry_contacts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.industry_organizations(id) on delete cascade,
  name text, role text, email text, public_profile_url text, source_url text not null,
  last_verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (email is not null or public_profile_url is not null)
);
create index if not exists industry_contacts_org_idx on public.industry_contacts (organization_id);

create table if not exists public.industry_artist_relations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.industry_organizations(id) on delete cascade,
  artist_name text not null, normalized_artist_name text not null, artist_external_id text, spotify_id text, musicbrainz_id uuid,
  relationship_type text not null check (relationship_type in ('booking','management','label')),
  active boolean, source_url text not null, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), last_verified_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists industry_relation_identity_uidx on public.industry_artist_relations (organization_id, normalized_artist_name, relationship_type, source_url);
create index if not exists industry_relation_artist_idx on public.industry_artist_relations (normalized_artist_name, relationship_type);

create table if not exists public.industry_sources (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.industry_organizations(id) on delete cascade,
  url text not null, title text, source_type text not null, confidence double precision not null check (confidence between 0 and 1),
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), last_verified_at timestamptz,
  unique (organization_id, url)
);
create index if not exists industry_sources_org_idx on public.industry_sources (organization_id);

alter table public.industry_organizations enable row level security;
alter table public.industry_contacts enable row level security;
alter table public.industry_artist_relations enable row level security;
alter table public.industry_sources enable row level security;

drop policy if exists "Public industry organizations are readable" on public.industry_organizations;
create policy "Public industry organizations are readable" on public.industry_organizations for select to anon, authenticated using (true);
drop policy if exists "Public industry contacts are readable" on public.industry_contacts;
create policy "Public industry contacts are readable" on public.industry_contacts for select to anon, authenticated using (true);
drop policy if exists "Public industry relations are readable" on public.industry_artist_relations;
create policy "Public industry relations are readable" on public.industry_artist_relations for select to anon, authenticated using (true);
drop policy if exists "Public industry sources are readable" on public.industry_sources;
create policy "Public industry sources are readable" on public.industry_sources for select to anon, authenticated using (true);

grant select on public.industry_organizations, public.industry_contacts, public.industry_artist_relations, public.industry_sources to anon, authenticated;
revoke insert, update, delete on public.industry_organizations, public.industry_contacts, public.industry_artist_relations, public.industry_sources from anon, authenticated;
-- Writes intentionally have no client policy. The server-only service role
-- performs verified upserts and bypasses RLS; never expose that key client-side.
