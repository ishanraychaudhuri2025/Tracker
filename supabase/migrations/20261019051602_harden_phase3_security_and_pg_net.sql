-- Phase 3: explicit default-deny client policies and safe pg_net schema cleanup.
-- OPERATOR RUNBOOK: commit SELECT cron.unschedule(jobid) FROM cron.job
-- WHERE jobname='cadence-push-tick' as a separate statement first; wait until
-- that job is not running and net.http_request_queue is empty. Do not use CASCADE.
-- This migration deliberately aborts unless the scheduler has been stopped.

revoke all on table public.cadence_push_config from public, anon, authenticated;
revoke all on table public.cadence_push_subscriptions from public, anon, authenticated;
revoke all on table public.cadence_push_deliveries from public, anon, authenticated;
revoke all on table public.cadence_push_focus_timers from public, anon, authenticated;

drop policy if exists "Deny client access to server-only table" on public.cadence_push_config;
drop policy if exists "Deny client access to server-only table" on public.cadence_push_subscriptions;
drop policy if exists "Deny client access to server-only table" on public.cadence_push_deliveries;
drop policy if exists "Deny client access to server-only table" on public.cadence_push_focus_timers;

create policy "Deny client access to server-only table"
  on public.cadence_push_config
  as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Deny client access to server-only table"
  on public.cadence_push_subscriptions
  as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Deny client access to server-only table"
  on public.cadence_push_deliveries
  as restrictive for all to anon, authenticated
  using (false) with check (false);
create policy "Deny client access to server-only table"
  on public.cadence_push_focus_timers
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- The delivery index had no current workload using created_at. The delivery
-- ledger's primary key still handles idempotency; avoid carrying an unused
-- index on every delivery write.
drop index if exists public.cadence_push_deliveries_created_idx;

-- Keep cadence_push_subscriptions_user_idx: it supports the user_id foreign-key
-- cascade when an Auth user is deleted. The advisor sees no scans yet because
-- no user deletion/cascade has occurred; dropping it would make that path scan
-- the entire subscriptions table as the application grows.
comment on index public.cadence_push_subscriptions_user_idx is
  'Intentionally retained for auth.users ON DELETE CASCADE on user_id; unused-scan advisory reflects no account deletions yet.';

do $preflight$
declare
  pending_requests bigint;
  running_jobs bigint;
  other_net_jobs bigint;
  webhook_count bigint;
  attempt integer;
begin
  if exists (select 1 from cron.job where jobname = 'cadence-push-tick') then
    raise exception 'Preflight failed: cadence-push-tick is still scheduled. Unschedule it in a separate committed statement first.';
  end if;

  for attempt in 1..30 loop
    select count(*) into running_jobs
      from cron.job_run_details
      where command ilike '%cadence-push%'
        and status = 'running';
    select count(*) into pending_requests from net.http_request_queue;
    exit when running_jobs = 0 and pending_requests = 0;
    perform pg_sleep(1);
  end loop;

  if running_jobs <> 0 or pending_requests <> 0 then
    raise exception 'Preflight failed: pg_net still has running scheduler work or queued requests (running %, queued %). Nothing was dropped.', running_jobs, pending_requests;
  end if;

  select count(*) into other_net_jobs
    from cron.job
    where command ilike '%net.http_%';
  if other_net_jobs <> 0 then
    raise exception 'Preflight failed: another pg_cron job references pg_net. Review it before relocating the extension.';
  end if;

  if to_regclass('supabase_functions.hooks') is not null then
    execute 'select count(*) from supabase_functions.hooks' into webhook_count;
    if webhook_count <> 0 then
      raise exception 'Preflight failed: Database Webhooks are present. Recreate/review them before relocating pg_net.';
    end if;
  end if;
end
$preflight$;

-- Preserve all current HTTP response diagnostics in a transaction-local table.
-- The temporary archive is not exposed and disappears on COMMIT; rows are
-- restored into the new net._http_response table before the transaction commits.
create temporary table pg_net_response_archive
  on commit drop
  as table net._http_response;

drop extension pg_net;
create extension pg_net with schema extensions;

insert into net._http_response
  (id, status_code, content_type, headers, content, timed_out, error_msg, created)
select id, status_code, content_type, headers, content, timed_out, error_msg, created
from pg_temp.pg_net_response_archive;

do $schedule$
declare
  old_job_id bigint;
begin
  for old_job_id in
    select jobid from cron.job where jobname = 'cadence-push-tick'
  loop
    perform cron.unschedule(old_job_id);
  end loop;

  perform cron.schedule(
    'cadence-push-tick',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://wxyigvitegdnurimmarb.supabase.co/functions/v1/cadence-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cadence-cron', (select cron_secret from public.cadence_push_config where id = true)
        ),
        body := jsonb_build_object('action', 'tick'),
        timeout_milliseconds := 10000
      );
    $job$
  );
end
$schedule$;

do $verify$
declare
  archive_count bigint;
  restored_count bigint;
  scheduled_count bigint;
  table_name text;
begin
  if not exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'extensions'
  ) then
    raise exception 'Verification failed: pg_net extension registration is not in extensions.';
  end if;

  select count(*) into archive_count from pg_temp.pg_net_response_archive;
  select count(*) into restored_count from net._http_response;
  if archive_count <> restored_count then
    raise exception 'Verification failed: HTTP response diagnostic count changed (% archived, % restored).', archive_count, restored_count;
  end if;

  if exists (
    select id, status_code, content_type, headers, content, timed_out, error_msg, created
    from pg_temp.pg_net_response_archive
    except
    select id, status_code, content_type, headers, content, timed_out, error_msg, created
    from net._http_response
  ) then
    raise exception 'Verification failed: at least one HTTP response diagnostic differs after restore.';
  end if;

  select count(*) into scheduled_count
    from cron.job
    where jobname = 'cadence-push-tick' and active and command ilike '%net.http_post%';
  if scheduled_count <> 1 then
    raise exception 'Verification failed: expected exactly one active cadence-push-tick job; found %.', scheduled_count;
  end if;

  foreach table_name in array array[
    'public.cadence_push_config',
    'public.cadence_push_subscriptions',
    'public.cadence_push_deliveries',
    'public.cadence_push_focus_timers'
  ] loop
    if not (
      select c.relrowsecurity
      from pg_class c
      where c.oid = to_regclass(table_name)
    ) then
      raise exception 'Verification failed: RLS is not enabled on %.', table_name;
    end if;

    if has_table_privilege('anon', table_name, 'SELECT')
      or has_table_privilege('anon', table_name, 'INSERT')
      or has_table_privilege('anon', table_name, 'UPDATE')
      or has_table_privilege('anon', table_name, 'DELETE')
      or has_table_privilege('authenticated', table_name, 'SELECT')
      or has_table_privilege('authenticated', table_name, 'INSERT')
      or has_table_privilege('authenticated', table_name, 'UPDATE')
      or has_table_privilege('authenticated', table_name, 'DELETE') then
      raise exception 'Verification failed: client table privileges exist on %.', table_name;
    end if;

    if not exists (
      select 1 from pg_policy p
      where p.polrelid = to_regclass(table_name)
        and p.polname = 'Deny client access to server-only table'
        and p.polcmd = '*'
        and not p.polpermissive
    ) then
      raise exception 'Verification failed: restrictive deny-all RLS policy missing on %.', table_name;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.cadence_push_config', 'SELECT')
    or not has_table_privilege('service_role', 'public.cadence_push_subscriptions', 'SELECT')
    or not has_table_privilege('service_role', 'public.cadence_push_deliveries', 'INSERT')
    or not has_table_privilege('service_role', 'public.cadence_push_focus_timers', 'UPDATE') then
    raise exception 'Verification failed: required service_role privileges are missing.';
  end if;
end
$verify$;
