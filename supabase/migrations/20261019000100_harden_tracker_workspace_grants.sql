-- Keep workspace access row-scoped and least-privileged.
-- RLS policies still enforce auth.uid() = user_id for all CRUD operations.
revoke all on table public.tracker_workspaces from public, anon, authenticated;
grant select, insert, update, delete on table public.tracker_workspaces to authenticated;
