-- Agent Mission Control: phase 1 schema.
-- Access is server-only (secret key). RLS is enabled on every table with no policies,
-- so the publishable key can read nothing.

create table public.runs (
  id text primary key,
  prompt text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  env text not null default 'production',
  hidden boolean not null default false,
  featured boolean not null default false,
  featured_order integer,
  task_class text,
  title text,
  totals jsonb not null default '{}'::jsonb,
  error text,
  ip_hash text,
  trigger_run_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index runs_featured_idx on public.runs (featured_order) where featured and not hidden;
create index runs_ip_created_idx on public.runs (ip_hash, created_at desc);
create index runs_created_idx on public.runs (created_at desc);

create table public.events (
  run_id text not null references public.runs (id) on delete cascade,
  seq integer not null,
  ts bigint not null,
  type text not null,
  agent_id text,
  data jsonb not null,
  primary key (run_id, seq)
);

create table public.agents (
  run_id text not null references public.runs (id) on delete cascade,
  id text not null,
  role text not null,
  name text not null,
  status text not null default 'spawned',
  info jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, id)
);

create table public.messages (
  run_id text not null references public.runs (id) on delete cascade,
  id text not null,
  from_agent text not null,
  to_agent text not null,
  type text not null,
  content text not null,
  refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (run_id, id)
);

create table public.sources (
  run_id text not null references public.runs (id) on delete cascade,
  id text not null,
  url text not null,
  title text not null,
  snippet text not null default '',
  content text not null default '',
  via text not null,
  agent_id text,
  query text,
  created_at timestamptz not null default now(),
  primary key (run_id, id)
);

create table public.artifact_versions (
  run_id text not null references public.runs (id) on delete cascade,
  version integer not null,
  author text,
  summary text not null default '',
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, version)
);

-- Rate-limit check and insert in one transaction, serialized per IP hash, so parallel
-- submissions from one visitor cannot all pass the check before any of them is inserted.
create function public.create_run(
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
    count(*) filter (where status in ('queued', 'running') and created_at > now() - p_active_window),
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

-- Functions are executable by PUBLIC by default; only the server (service role) may create runs.
revoke execute on function public.create_run(text, text, text, text, integer, integer, interval) from public, anon, authenticated;
grant execute on function public.create_run(text, text, text, text, integer, integer, interval) to service_role;

alter table public.runs enable row level security;
alter table public.events enable row level security;
alter table public.agents enable row level security;
alter table public.messages enable row level security;
alter table public.sources enable row level security;
alter table public.artifact_versions enable row level security;
