-- Agent Mission Control: operator runs skip the per-IP caps. The server decides who is an operator; the global spend cap still applies.
drop function if exists public.create_run(text, text, text, text, integer, integer, interval);

create function public.create_run(
  p_id text,
  p_prompt text,
  p_env text,
  p_ip_hash text,
  p_per_hour integer,
  p_per_day integer,
  p_active_window interval,
  p_skip_ip_limits boolean default false
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_active integer;
  v_hour integer;
  v_day integer;
begin
  if not p_skip_ip_limits then
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
  end if;

  insert into public.runs (id, prompt, env, ip_hash, status)
  values (p_id, p_prompt, p_env, p_ip_hash, 'queued');
  return 'ok';
end;
$$;

revoke execute on function public.create_run(text, text, text, text, integer, integer, interval, boolean) from public, anon, authenticated;
grant execute on function public.create_run(text, text, text, text, integer, integer, interval, boolean) to service_role;
