-- Keep workspace access row-scoped and least-privileged.
-- RLS policies still enforce auth.uid() = user_id for all CRUD operations.
REVOKE ALL ON TABLE public.tracker_workspaces FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tracker_workspaces TO authenticated;
