create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null default 'My workspace' check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null,
  genre text,
  location text,
  spotify_url text,
  profile_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, normalized_name)
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  artist_profile_id uuid not null references public.artist_profiles(id) on delete cascade,
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  request_data jsonb not null,
  result_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analysis_runs_artist_created_idx
  on public.analysis_runs (artist_profile_id, created_at desc);
create index if not exists analysis_runs_fingerprint_created_idx
  on public.analysis_runs (request_fingerprint, created_at desc);

create table if not exists public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  artist_profile_id uuid references public.artist_profiles(id) on delete cascade,
  opportunity_key text not null check (char_length(opportunity_key) between 1 and 500),
  opportunity_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, opportunity_key)
);

alter table public.user_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.saved_opportunities enable row level security;

create or replace function public.create_user_profile_and_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id) values (new.id)
  on conflict (id) do nothing;
  insert into public.workspaces (owner_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists create_user_profile_and_workspace on auth.users;
create trigger create_user_profile_and_workspace
  after insert on auth.users
  for each row execute function public.create_user_profile_and_workspace();

create policy "Users can read their own profile"
  on public.user_profiles for select
  using ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.user_profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Owners can read their workspaces"
  on public.workspaces for select
  using ((select auth.uid()) = owner_id);
create policy "Owners can create their workspaces"
  on public.workspaces for insert
  with check ((select auth.uid()) = owner_id);
create policy "Owners can update their workspaces"
  on public.workspaces for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Owners can delete their workspaces"
  on public.workspaces for delete
  using ((select auth.uid()) = owner_id);

create policy "Owners can read artist profiles"
  on public.artist_profiles for select
  using (exists (
    select 1 from public.workspaces
    where workspaces.id = artist_profiles.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ));
create policy "Owners can create artist profiles"
  on public.artist_profiles for insert
  with check (exists (
    select 1 from public.workspaces
    where workspaces.id = artist_profiles.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ));
create policy "Owners can update artist profiles"
  on public.artist_profiles for update
  using (exists (
    select 1 from public.workspaces
    where workspaces.id = artist_profiles.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspaces
    where workspaces.id = artist_profiles.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ));
create policy "Owners can delete artist profiles"
  on public.artist_profiles for delete
  using (exists (
    select 1 from public.workspaces
    where workspaces.id = artist_profiles.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ));

create policy "Owners can read analysis runs"
  on public.analysis_runs for select
  using (exists (
    select 1
    from public.artist_profiles
    join public.workspaces on workspaces.id = artist_profiles.workspace_id
    where artist_profiles.id = analysis_runs.artist_profile_id
      and workspaces.owner_id = (select auth.uid())
  ));
create policy "Owners can create analysis runs"
  on public.analysis_runs for insert
  with check (exists (
    select 1
    from public.artist_profiles
    join public.workspaces on workspaces.id = artist_profiles.workspace_id
    where artist_profiles.id = analysis_runs.artist_profile_id
      and workspaces.owner_id = (select auth.uid())
  ));
create policy "Owners can delete analysis runs"
  on public.analysis_runs for delete
  using (exists (
    select 1
    from public.artist_profiles
    join public.workspaces on workspaces.id = artist_profiles.workspace_id
    where artist_profiles.id = analysis_runs.artist_profile_id
      and workspaces.owner_id = (select auth.uid())
  ));

create policy "Owners can read saved opportunities"
  on public.saved_opportunities for select
  using (exists (
    select 1 from public.workspaces
    where workspaces.id = saved_opportunities.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ));
create policy "Owners can create saved opportunities"
  on public.saved_opportunities for insert
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = saved_opportunities.workspace_id
        and workspaces.owner_id = (select auth.uid())
    )
    and (
      saved_opportunities.artist_profile_id is null
      or exists (
        select 1 from public.artist_profiles
        where artist_profiles.id = saved_opportunities.artist_profile_id
          and artist_profiles.workspace_id = saved_opportunities.workspace_id
      )
    )
  );
create policy "Owners can update saved opportunities"
  on public.saved_opportunities for update
  using (exists (
    select 1 from public.workspaces
    where workspaces.id = saved_opportunities.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.workspaces
      where workspaces.id = saved_opportunities.workspace_id
        and workspaces.owner_id = (select auth.uid())
    )
    and (
      saved_opportunities.artist_profile_id is null
      or exists (
        select 1 from public.artist_profiles
        where artist_profiles.id = saved_opportunities.artist_profile_id
          and artist_profiles.workspace_id = saved_opportunities.workspace_id
      )
    )
  );
create policy "Owners can delete saved opportunities"
  on public.saved_opportunities for delete
  using (exists (
    select 1 from public.workspaces
    where workspaces.id = saved_opportunities.workspace_id
      and workspaces.owner_id = (select auth.uid())
  ));

create or replace function public.ensure_personal_workspace(requested_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_id uuid;
begin
  if requested_user_id is null or requested_user_id <> (select auth.uid()) then
    raise exception 'Access denied';
  end if;

  insert into public.user_profiles (id) values (requested_user_id)
  on conflict (id) do nothing;

  select id into workspace_id
  from public.workspaces
  where owner_id = requested_user_id
  order by created_at
  limit 1;

  if workspace_id is null then
    insert into public.workspaces (owner_id) values (requested_user_id)
    returning id into workspace_id;
  end if;

  return workspace_id;
end;
$$;

create or replace function public.persist_user_analysis(
  requested_fingerprint text,
  requested_request_data jsonb,
  requested_result_data jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_workspace_id uuid;
  current_artist_id uuid;
  run_id uuid;
  artist_name text := nullif(trim(requested_request_data ->> 'artistName'), '');
  normalized_artist_name text;
begin
  if current_user_id is null or artist_name is null or char_length(requested_fingerprint) <> 64 then
    raise exception 'Invalid analysis';
  end if;

  current_workspace_id := public.ensure_personal_workspace(current_user_id);
  normalized_artist_name := lower(artist_name);

  insert into public.artist_profiles (
    workspace_id, name, normalized_name, genre, location, spotify_url, profile_data, updated_at
  ) values (
    current_workspace_id,
    artist_name,
    normalized_artist_name,
    nullif(trim(requested_request_data ->> 'genre'), ''),
    nullif(trim(requested_request_data ->> 'location'), ''),
    nullif(trim(requested_request_data ->> 'spotifyUrl'), ''),
    requested_request_data,
    now()
  ) on conflict (workspace_id, normalized_name) do update set
    name = excluded.name,
    genre = excluded.genre,
    location = excluded.location,
    spotify_url = excluded.spotify_url,
    profile_data = excluded.profile_data,
    updated_at = excluded.updated_at
  returning id into current_artist_id;

  insert into public.analysis_runs (
    artist_profile_id, request_fingerprint, request_data, result_data
  ) values (
    current_artist_id, requested_fingerprint, requested_request_data, requested_result_data
  ) returning id into run_id;

  return run_id;
end;
$$;

create or replace function public.read_latest_user_analysis(requested_fingerprint text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select analysis_runs.result_data
  from public.analysis_runs
  join public.artist_profiles on artist_profiles.id = analysis_runs.artist_profile_id
  join public.workspaces on workspaces.id = artist_profiles.workspace_id
  where workspaces.owner_id = (select auth.uid())
    and analysis_runs.request_fingerprint = requested_fingerprint
  order by analysis_runs.created_at desc
  limit 1;
$$;

-- Migrate the single-profile storage introduced before normalized ownership.
insert into public.user_profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.workspaces (owner_id)
select users.id
from auth.users users
where not exists (
  select 1 from public.workspaces where workspaces.owner_id = users.id
);

insert into public.artist_profiles (
  workspace_id, name, normalized_name, genre, location, spotify_url, profile_data, updated_at
)
select
  workspace.id,
  legacy.onboarding_data ->> 'artistName',
  lower(trim(legacy.onboarding_data ->> 'artistName')),
  nullif(trim(legacy.onboarding_data ->> 'genre'), ''),
  nullif(trim(legacy.onboarding_data ->> 'location'), ''),
  nullif(trim(legacy.onboarding_data ->> 'spotifyUrl'), ''),
  legacy.onboarding_data,
  legacy.updated_at
from public.artist_workspaces legacy
join lateral (
  select id from public.workspaces
  where owner_id = legacy.user_id
  order by created_at
  limit 1
) workspace on true
where nullif(trim(legacy.onboarding_data ->> 'artistName'), '') is not null
on conflict (workspace_id, normalized_name) do nothing;

insert into public.analysis_runs (
  artist_profile_id, request_fingerprint, request_data, result_data, created_at
)
select
  artist.id,
  legacy.analysis_fingerprint,
  legacy.onboarding_data,
  legacy.analysis_result,
  legacy.updated_at
from public.artist_workspaces legacy
join public.workspaces workspace on workspace.owner_id = legacy.user_id
join public.artist_profiles artist
  on artist.workspace_id = workspace.id
  and artist.normalized_name = lower(trim(legacy.onboarding_data ->> 'artistName'))
where legacy.analysis_result is not null
  and char_length(legacy.analysis_fingerprint) = 64;

create or replace function public.claim_anonymous_analysis(
  requested_session_id uuid,
  requested_claim_token_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.anonymous_analyses%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return false;
  end if;

  delete from public.anonymous_analyses
  where session_id = requested_session_id
    and claim_token_hash = requested_claim_token_hash
    and expires_at > now()
  returning * into claimed;

  if claimed.session_id is null then
    return false;
  end if;

  perform public.persist_user_analysis(
    claimed.request_fingerprint,
    claimed.onboarding_data,
    claimed.analysis_result
  );

  return true;
end;
$$;

revoke all on public.user_profiles from anon;
revoke all on public.workspaces from anon;
revoke all on public.artist_profiles from anon;
revoke all on public.analysis_runs from anon;
revoke all on public.saved_opportunities from anon;
grant select, update on public.user_profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.artist_profiles to authenticated;
grant select, insert, delete on public.analysis_runs to authenticated;
grant select, insert, update, delete on public.saved_opportunities to authenticated;
revoke all on function public.create_user_profile_and_workspace() from public;
revoke all on function public.ensure_personal_workspace(uuid) from public;
revoke all on function public.persist_user_analysis(text, jsonb, jsonb) from public;
revoke all on function public.read_latest_user_analysis(text) from public;
grant execute on function public.ensure_personal_workspace(uuid) to authenticated;
grant execute on function public.persist_user_analysis(text, jsonb, jsonb) to authenticated;
grant execute on function public.read_latest_user_analysis(text) to authenticated;
