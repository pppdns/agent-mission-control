-- Agent Mission Control: phase 2 (HITL pauses, checkpoints). Additive; phase 1 code keeps working.

alter table public.runs drop constraint if exists runs_status_check;
alter table public.runs add constraint runs_status_check
  check (status in ('queued', 'running', 'waiting', 'completed', 'failed'));

-- Serialized harness state at phase boundaries; a restarted task resumes from the latest one.
create table public.checkpoints (
  run_id text not null references public.runs (id) on delete cascade,
  id text not null,
  seq integer not null,
  phase text not null,
  round integer not null default 1,
  label text not null default '',
  state jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, id)
);

create index checkpoints_run_seq_idx on public.checkpoints (run_id, seq desc);

-- Pending human decisions. The Trigger.dev wait token stays server-side and never enters the public event log.
create table public.hitl_requests (
  run_id text not null references public.runs (id) on delete cascade,
  id text not null,
  token_id text not null,
  reason text not null,
  question text not null,
  options jsonb not null,
  recommended text not null,
  deadline timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'timed_out')),
  resolution jsonb,
  resolved_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (run_id, id)
);

-- Same signature as phase 1; a run paused on a human decision still counts as the visitor's active run.
create or replace function public.create_run(
  p_id text,
  p_prompt text,
  p_env text,
  p_ip_hash text,
  p_per_hour integer,
  p_per_day integer,
  p_active_window interval
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_active integer;
  v_hour integer;
  v_day integer;
begin
  perform pg_advisory_xact_lock(hashtext('create_run:' || p_ip_hash));

  select
    count(*) filter (where status in ('queued', 'running', 'waiting') and created_at > now() - p_active_window),
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*)
  into v_active, v_hour, v_day
  from public.runs
  where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';

  if v_active >= 1 then return 'active'; end if;
  if v_hour >= p_per_hour then return 'hourly'; end if;
  if v_day >= p_per_day then return 'daily'; end if;

  insert into public.runs (id, prompt, env, ip_hash, status)
  values (p_id, p_prompt, p_env, p_ip_hash, 'queued');
  return 'ok';
end;
$$;

revoke execute on function public.create_run(text, text, text, text, integer, integer, interval) from public, anon, authenticated;
grant execute on function public.create_run(text, text, text, text, integer, integer, interval) to service_role;

alter table public.checkpoints enable row level security;
alter table public.hitl_requests enable row level security;
