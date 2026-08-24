alter table public.artist_workspaces
  add column if not exists analysis_result jsonb,
  add column if not exists analysis_fingerprint text;

create table if not exists public.anonymous_analyses (
  session_id uuid primary key,
  claim_token_hash text not null,
  request_fingerprint text not null,
  onboarding_data jsonb not null,
  analysis_result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.anonymous_analyses enable row level security;

create or replace function public.read_anonymous_analysis(
  requested_session_id uuid,
  requested_claim_token_hash text,
  requested_fingerprint text
) returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select analysis_result
  from public.anonymous_analyses
  where session_id = requested_session_id
    and claim_token_hash = requested_claim_token_hash
    and request_fingerprint = requested_fingerprint
    and expires_at > now();
$$;

create or replace function public.store_anonymous_analysis(
  requested_session_id uuid,
  requested_claim_token_hash text,
  requested_fingerprint text,
  requested_onboarding_data jsonb,
  requested_analysis_result jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.anonymous_analyses (
    session_id,
    claim_token_hash,
    request_fingerprint,
    onboarding_data,
    analysis_result
  ) values (
    requested_session_id,
    requested_claim_token_hash,
    requested_fingerprint,
    requested_onboarding_data,
    requested_analysis_result
  ) on conflict (session_id) do nothing;

  return found;
end;
$$;

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

  insert into public.artist_workspaces (
    user_id,
    onboarding_data,
    analysis_result,
    analysis_fingerprint,
    updated_at
  ) values (
    current_user_id,
    claimed.onboarding_data,
    claimed.analysis_result,
    claimed.request_fingerprint,
    now()
  ) on conflict (user_id) do update set
    onboarding_data = excluded.onboarding_data,
    analysis_result = excluded.analysis_result,
    analysis_fingerprint = excluded.analysis_fingerprint,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.purge_expired_anonymous_analyses()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.anonymous_analyses where expires_at <= now();
$$;

revoke all on public.anonymous_analyses from anon, authenticated;
revoke all on function public.read_anonymous_analysis(uuid, text, text) from public;
revoke all on function public.store_anonymous_analysis(uuid, text, text, jsonb, jsonb) from public;
revoke all on function public.claim_anonymous_analysis(uuid, text) from public;
revoke all on function public.purge_expired_anonymous_analyses() from public;
grant execute on function public.read_anonymous_analysis(uuid, text, text) to anon;
grant execute on function public.store_anonymous_analysis(uuid, text, text, jsonb, jsonb) to anon;
grant execute on function public.claim_anonymous_analysis(uuid, text) to authenticated;

create extension if not exists pg_cron with schema extensions;
select cron.schedule(
  'purge-expired-anonymous-analyses',
  '0 * * * *',
  'select public.purge_expired_anonymous_analyses()'
)
where not exists (
  select 1 from cron.job where jobname = 'purge-expired-anonymous-analyses'
);
