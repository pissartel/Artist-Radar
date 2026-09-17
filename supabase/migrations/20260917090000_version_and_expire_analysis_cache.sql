-- Versioned/fresh persisted analysis reads. The application fingerprint now
-- includes the pipeline cache version, so rows written before booking-v3 do
-- not match even when the artist inputs are otherwise identical.

create or replace function public.read_latest_user_analysis_v2(
  requested_fingerprint text,
  requested_max_age_seconds integer
) returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'resultData', analysis_runs.result_data,
    'createdAt', analysis_runs.created_at,
    'isFresh', analysis_runs.created_at > now() - make_interval(
      secs => greatest(0, least(requested_max_age_seconds, 86400))
    )
  )
  from public.analysis_runs
  join public.artist_profiles on artist_profiles.id = analysis_runs.artist_profile_id
  join public.workspaces on workspaces.id = artist_profiles.workspace_id
  where workspaces.owner_id = (select auth.uid())
    and analysis_runs.request_fingerprint = requested_fingerprint
  order by analysis_runs.created_at desc
  limit 1;
$$;

create or replace function public.read_anonymous_analysis_v2(
  requested_session_id uuid,
  requested_claim_token_hash text,
  requested_fingerprint text,
  requested_max_age_seconds integer
) returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'resultData', analysis_result,
    'createdAt', created_at,
    'isFresh', created_at > now() - make_interval(
      secs => greatest(0, least(requested_max_age_seconds, 86400))
    )
  )
  from public.anonymous_analyses
  where session_id = requested_session_id
    and claim_token_hash = requested_claim_token_hash
    and request_fingerprint = requested_fingerprint
    and expires_at > now();
$$;

-- A session must be refreshable. The original #138 implementation used DO
-- NOTHING, permanently retaining the first analysis for that anonymous cookie.
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
    analysis_result,
    created_at,
    expires_at
  ) values (
    requested_session_id,
    requested_claim_token_hash,
    requested_fingerprint,
    requested_onboarding_data,
    requested_analysis_result,
    now(),
    now() + interval '30 days'
  ) on conflict (session_id) do update set
    request_fingerprint = excluded.request_fingerprint,
    onboarding_data = excluded.onboarding_data,
    analysis_result = excluded.analysis_result,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at
  where public.anonymous_analyses.claim_token_hash = excluded.claim_token_hash;

  return found;
end;
$$;

revoke all on function public.read_latest_user_analysis_v2(text, integer) from public;
revoke all on function public.read_anonymous_analysis_v2(uuid, text, text, integer) from public;
grant execute on function public.read_latest_user_analysis_v2(text, integer) to authenticated;
grant execute on function public.read_anonymous_analysis_v2(uuid, text, text, integer) to anon;
