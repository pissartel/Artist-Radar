create table if not exists public.global_artists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null,
  identity_key text not null unique,
  genres text[] not null default '{}',
  city text,
  country text,
  scale_band text check (scale_band is null or scale_band in ('small', 'medium', 'large', 'emerging', 'developing', 'established', 'unknown')),
  profile_data jsonb not null default '{}'::jsonb,
  metadata_sources jsonb not null default '[]'::jsonb,
  metadata_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_artist_external_ids (
  artist_id uuid not null references public.global_artists(id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 50),
  external_id text not null check (char_length(external_id) between 1 and 300),
  source_confidence real not null default 1 check (source_confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, external_id),
  unique (artist_id, provider)
);

create table if not exists public.artist_similarity_edges (
  artist_id uuid not null references public.global_artists(id) on delete cascade,
  similar_artist_id uuid not null references public.global_artists(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  score_version text not null,
  genre_score smallint check (genre_score between 0 and 100),
  audience_score smallint check (audience_score between 0 and 100),
  geography_score smallint check (geography_score between 0 and 100),
  provider_score smallint check (provider_score between 0 and 100),
  confidence real not null check (confidence between 0 and 1),
  sources jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_computed_at timestamptz not null default now(),
  next_refresh_at timestamptz not null,
  primary key (artist_id, similar_artist_id, score_version),
  check (artist_id <> similar_artist_id)
);

-- Compatible queue contract for the global enrichment worker introduced by
-- the knowledge-layer work. IF NOT EXISTS lets this migration coexist when
-- that migration has already created the queue.
create table if not exists public.global_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  job_type text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, job_type, status)
);

create index if not exists artist_similarity_edges_reverse_idx
  on public.artist_similarity_edges (similar_artist_id, score_version, score desc);
create index if not exists artist_similarity_edges_refresh_idx
  on public.artist_similarity_edges (artist_id, score_version, next_refresh_at);
create index if not exists global_artists_location_scale_idx
  on public.global_artists (country, city, scale_band);

alter table public.global_artists enable row level security;
alter table public.global_artist_external_ids enable row level security;
alter table public.artist_similarity_edges enable row level security;
alter table public.global_enrichment_jobs enable row level security;

create policy "Global artists are publicly readable"
  on public.global_artists for select to anon, authenticated using (true);
create policy "Global artist identifiers are publicly readable"
  on public.global_artist_external_ids for select to anon, authenticated using (true);
create policy "Similarity edges are publicly readable"
  on public.artist_similarity_edges for select to anon, authenticated using (true);

-- Writes deliberately have no client policy. Backend workers use the service
-- role so global knowledge cannot be poisoned by anonymous callers.
grant select on public.global_artists to anon, authenticated;
grant select on public.global_artist_external_ids to anon, authenticated;
grant select on public.artist_similarity_edges to anon, authenticated;
