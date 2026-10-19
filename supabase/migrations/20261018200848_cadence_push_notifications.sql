-- Browser push subscriptions and scheduled reminder delivery.
-- Internal tables are intentionally inaccessible to anon/authenticated roles;
-- only the Edge Function's server-side service role and database owner may use them.
--
-- The current hosted project already records this migration version as applied.
-- The cron URL below is specific to the connected Cadence/Supabase project and
-- must be updated when intentionally deploying this migration to a different project.

create schema if not exists extensions;

-- pg_net may already be installed by the Supabase project. IF NOT EXISTS does
-- not move an existing installation; any relocation should be handled as an
-- explicit maintenance operation after checking its request queue and history.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.cadence_push_config (
  id boolean primary key default true check (id = true),
  vapid_public_key text,
  vapid_private_key text,
  cron_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadence_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadence_push_deliveries (
  delivery_key text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.cadence_push_focus_timers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ends_at timestamptz not null,
  label text not null default 'Focus session',
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists cadence_push_subscriptions_user_idx
  on public.cadence_push_subscriptions (user_id);
create index if not exists cadence_push_deliveries_created_idx
  on public.cadence_push_deliveries (created_at);

alter table public.cadence_push_config enable row level security;
alter table public.cadence_push_subscriptions enable row level security;
alter table public.cadence_push_deliveries enable row level security;
alter table public.cadence_push_focus_timers enable row level security;

-- No client policies are intentional: only server-side service_role access is
-- required for the push pipeline. RLS provides an additional deny-by-default
-- layer even if an API grant is accidentally added later.
revoke all on table public.cadence_push_config from public, anon, authenticated;
revoke all on table public.cadence_push_subscriptions from public, anon, authenticated;
revoke all on table public.cadence_push_deliveries from public, anon, authenticated;
revoke all on table public.cadence_push_focus_timers from public, anon, authenticated;

-- The historical migration granted service_role table access; the later
-- hardening migration narrows these to the exact operations needed by the function.
grant all on table public.cadence_push_config to service_role;
grant all on table public.cadence_push_subscriptions to service_role;
grant all on table public.cadence_push_deliveries to service_role;
grant all on table public.cadence_push_focus_timers to service_role;

insert into public.cadence_push_config (id)
values (true)
on conflict (id) do nothing;

do $cadence$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'cadence-push-tick';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

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
$cadence$;
