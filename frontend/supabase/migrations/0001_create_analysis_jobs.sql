-- Persistent, serverless-safe store for artist analysis jobs (see issue #101
-- follow-up: the previous implementation kept jobs in a process-local Map,
-- which does not survive across Vercel serverless instances/restarts).
create extension if not exists pgcrypto;

create table if not exists analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  current_step text
    check (current_step in ('preparing', 'running_pipeline', 'building_dashboard')),
  request_payload jsonb not null,
  result_payload jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists analysis_jobs_created_at_idx on analysis_jobs (created_at);

-- Cleanup strategy (not yet scheduled):
-- analysis_jobs rows are never deleted automatically today. Once a scheduled
-- job runner is available, purge terminal jobs older than 30 days, e.g.:
--   delete from analysis_jobs
--   where status in ('completed', 'failed')
--     and created_at < now() - interval '30 days';
