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

alter table public.runs enable row level security;
alter table public.events enable row level security;
alter table public.agents enable row level security;
alter table public.messages enable row level security;
alter table public.sources enable row level security;
alter table public.artifact_versions enable row level security;
