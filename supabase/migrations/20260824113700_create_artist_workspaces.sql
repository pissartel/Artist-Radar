create table if not exists public.artist_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.artist_workspaces enable row level security;

create policy "Users can read their own artist workspace"
  on public.artist_workspaces for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own artist workspace"
  on public.artist_workspaces for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own artist workspace"
  on public.artist_workspaces for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
