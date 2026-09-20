-- Persistent venue <-> event <-> artist history and derived programming profiles (#264).
-- Builds on global_artists / global_enrichment_jobs from the #263 migration.

-- global_artists.scale_band (#263) only allowed legacy tier labels, but the
-- pipeline persists ArtistScaleBand values; widen it so scale evidence is not
-- rejected (venue profiles aggregate it).
alter table public.global_artists drop constraint if exists global_artists_scale_band_check;
alter table public.global_artists add constraint global_artists_scale_band_check
  check (scale_band is null or scale_band in (
    'small', 'medium', 'large', 'emerging', 'developing', 'established', 'unknown',
    'established_local', 'regional', 'national', 'major'
  ));

create table if not exists public.global_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null,
  identity_key text not null unique,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  -- Declared facts (venue website / provider), kept apart from inferred data
  -- which lives only in venue_programming_profiles.
  declared jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_promoters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

-- One canonical row per real-world event. Past events are never deleted:
-- they become historical evidence.
create table if not exists public.global_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.global_venues(id) on delete cascade,
  promoter_id uuid references public.global_promoters(id) on delete set null,
  canonical_key text not null unique,
  name text,
  event_date date not null,
  status text not null default 'unknown' check (status in ('upcoming', 'past', 'cancelled', 'unknown')),
  confidence real not null default 0.5 check (confidence between 0 and 1),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Provenance: every provider record that contributed to a canonical event.
create table if not exists public.global_event_sources (
  event_id uuid not null references public.global_events(id) on delete cascade,
  provider text not null,
  external_id text not null default '',
  source_url text,
  confidence real not null default 0.5 check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  primary key (event_id, provider, external_id)
);

create table if not exists public.global_event_artists (
  event_id uuid not null references public.global_events(id) on delete cascade,
  artist_id uuid not null references public.global_artists(id) on delete cascade,
  billing_role text not null default 'unknown' check (billing_role in ('headliner', 'support', 'unknown')),
  primary key (event_id, artist_id)
);

create table if not exists public.venue_programming_profiles (
  venue_id uuid not null references public.global_venues(id) on delete cascade,
  score_version text not null,
  normalized_genres text[] not null default '{}',
  genre_affinity_scores jsonb not null default '{}'::jsonb,
  relevant_artist_ids uuid[] not null default '{}',
  median_artist_scale real,
  min_artist_scale real,
  max_artist_scale real,
  emerging_artist_share real check (emerging_artist_share is null or emerging_artist_share between 0 and 1),
  events_last_90_days integer not null default 0,
  events_last_365_days integer not null default 0,
  latest_known_event_at date,
  promoter_ids uuid[] not null default '{}',
  evidence_count integer not null default 0,
  confidence real not null check (confidence between 0 and 1),
  -- Everything in this row is inferred; observed facts live in global_events.
  data_origin text not null default 'inferred' check (data_origin = 'inferred'),
  computed_at timestamptz not null default now(),
  next_refresh_at timestamptz not null,
  primary key (venue_id, score_version)
);

create index if not exists global_venues_geo_idx on public.global_venues (country, city);
create index if not exists global_venues_coords_idx on public.global_venues (latitude, longitude)
  where latitude is not null and longitude is not null;
create index if not exists global_events_venue_date_idx on public.global_events (venue_id, event_date desc);
create index if not exists global_events_date_idx on public.global_events (event_date desc);
create index if not exists global_event_artists_artist_idx on public.global_event_artists (artist_id);
create index if not exists venue_profiles_genres_idx on public.venue_programming_profiles using gin (normalized_genres);
create index if not exists venue_profiles_artists_idx on public.venue_programming_profiles using gin (relevant_artist_ids);
create index if not exists venue_profiles_refresh_idx on public.venue_programming_profiles (score_version, next_refresh_at);
create index if not exists venue_profiles_recent_idx on public.venue_programming_profiles (score_version, latest_known_event_at desc);
create index if not exists venue_profiles_scale_idx on public.venue_programming_profiles (score_version, median_artist_scale);

-- Which venues hosted the given artists (e.g. an artist's similarity
-- neighbourhood)? Cancelled events are excluded from positive evidence.
create or replace function public.venues_hosting_artists(artist_ids uuid[], min_distinct_artists integer default 1)
returns table (venue_id uuid, distinct_artists integer, last_event_date date)
language sql stable as $$
  select e.venue_id, count(distinct ea.artist_id)::integer, max(e.event_date)
  from public.global_event_artists ea
  join public.global_events e on e.id = ea.event_id
  where ea.artist_id = any(artist_ids) and e.status <> 'cancelled'
  group by e.venue_id
  having count(distinct ea.artist_id) >= min_distinct_artists
  order by count(distinct ea.artist_id) desc, max(e.event_date) desc
$$;

alter table public.global_venues enable row level security;
alter table public.global_promoters enable row level security;
alter table public.global_events enable row level security;
alter table public.global_event_sources enable row level security;
alter table public.global_event_artists enable row level security;
alter table public.venue_programming_profiles enable row level security;

create policy "Global venues are publicly readable"
  on public.global_venues for select to anon, authenticated using (true);
create policy "Global promoters are publicly readable"
  on public.global_promoters for select to anon, authenticated using (true);
create policy "Global events are publicly readable"
  on public.global_events for select to anon, authenticated using (true);
create policy "Global event sources are publicly readable"
  on public.global_event_sources for select to anon, authenticated using (true);
create policy "Global event artists are publicly readable"
  on public.global_event_artists for select to anon, authenticated using (true);
create policy "Venue programming profiles are publicly readable"
  on public.venue_programming_profiles for select to anon, authenticated using (true);

-- Writes deliberately have no client policy; the backend service role owns them.
grant select on public.global_venues, public.global_promoters, public.global_events,
  public.global_event_sources, public.global_event_artists, public.venue_programming_profiles
  to anon, authenticated;
