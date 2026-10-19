-- One private JSON workspace per authenticated user.
-- All browser data requests are scoped by auth.uid() through RLS.
create table if not exists public.tracker_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  habits jsonb not null default '[]'::jsonb check (jsonb_typeof(habits) = 'array'),
  tasks jsonb not null default '[]'::jsonb check (jsonb_typeof(tasks) = 'array'),
  focus_sessions integer not null default 0 check (focus_sessions >= 0),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_tracker_workspaces_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tracker_workspaces_updated_at on public.tracker_workspaces;
create trigger tracker_workspaces_updated_at
before update on public.tracker_workspaces
for each row execute function public.set_tracker_workspaces_updated_at();

alter table public.tracker_workspaces enable row level security;

drop policy if exists "Users can read their own tracker workspace" on public.tracker_workspaces;
create policy "Users can read their own tracker workspace"
on public.tracker_workspaces for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own tracker workspace" on public.tracker_workspaces;
create policy "Users can create their own tracker workspace"
on public.tracker_workspaces for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own tracker workspace" on public.tracker_workspaces;
create policy "Users can update their own tracker workspace"
on public.tracker_workspaces for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own tracker workspace" on public.tracker_workspaces;
create policy "Users can delete their own tracker workspace"
on public.tracker_workspaces for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.tracker_workspaces from anon;
grant select, insert, update, delete on public.tracker_workspaces to authenticated;
