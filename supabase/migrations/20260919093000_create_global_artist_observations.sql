create table if not exists public.global_artist_observations (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.global_artists(id) on delete cascade,
  observation_key text not null unique,
  role text not null check (role in (
    'analyzed_artist', 'similar_artist', 'concert_artist', 'lineup_artist',
    'headliner', 'support', 'venue_history_artist'
  )),
  source_provider text not null,
  source_url text,
  event_external_id text,
  event_name text,
  venue_name text,
  confidence real not null default 0.5 check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists global_artist_observations_artist_idx
  on public.global_artist_observations (artist_id, last_observed_at desc);
create index if not exists global_artist_observations_event_idx
  on public.global_artist_observations (event_external_id)
  where event_external_id is not null;

alter table public.global_artist_observations enable row level security;

create policy "Global artist observations are publicly readable"
  on public.global_artist_observations for select to anon, authenticated using (true);

-- Writes deliberately have no client policy. The backend service role owns
-- canonical resolution and provenance so anonymous clients cannot poison it.
grant select on public.global_artist_observations to anon, authenticated;
