create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cadence push notifications and server-side reminder scheduling.
-- Subscriptions and configuration are only accessed by the trusted Edge Function.

create table if not exists public.cadence_push_config (
  id boolean primary key default true check (id = true),
  vapid_public_key text,
  vapid_private_key text,
  cron_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  updated_at timestamptz not null default now()
);

insert into public.cadence_push_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.cadence_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cadence_push_subscriptions_user_idx
  on public.cadence_push_subscriptions (user_id);

create table if not exists public.cadence_push_deliveries (
  delivery_key text primary key,
  created_at timestamptz not null default now()
);

create index if not exists cadence_push_deliveries_created_idx
  on public.cadence_push_deliveries (created_at);

create table if not exists public.cadence_push_focus_timers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ends_at timestamptz not null,
  label text not null default 'Focus session',
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.cadence_push_config enable row level security;
alter table public.cadence_push_subscriptions enable row level security;
alter table public.cadence_push_deliveries enable row level security;
alter table public.cadence_push_focus_timers enable row level security;

revoke all on table public.cadence_push_config from public, anon, authenticated;
revoke all on table public.cadence_push_subscriptions from public, anon, authenticated;
revoke all on table public.cadence_push_deliveries from public, anon, authenticated;
revoke all on table public.cadence_push_focus_timers from public, anon, authenticated;

grant all on table public.cadence_push_config to service_role;
grant all on table public.cadence_push_subscriptions to service_role;
grant all on table public.cadence_push_deliveries to service_role;
grant all on table public.cadence_push_focus_timers to service_role;

-- Supabase's pg_cron + pg_net extensions invoke this function every minute.
-- The per-project secret is never exposed through browser APIs or SQL policies.
select cron.schedule(
  'cadence-push-tick',
  '* * * * *',
  $cadence_cron$
    select net.http_post(
      url := 'https://wxyigvitegdnurimmarb.supabase.co/functions/v1/cadence-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cadence-cron', (select cron_secret from public.cadence_push_config where id = true)
      ),
      body := jsonb_build_object('action', 'tick'),
      timeout_milliseconds := 10000
    );
  $cadence_cron$
);
