-- Minimize the database privileges used by the server-side push Edge Function.
-- No browser role receives access to these tables; the service role gets only
-- the CRUD operations exercised by cadence-push.
REVOKE ALL ON TABLE public.cadence_push_config FROM service_role;
REVOKE ALL ON TABLE public.cadence_push_subscriptions FROM service_role;
REVOKE ALL ON TABLE public.cadence_push_deliveries FROM service_role;
REVOKE ALL ON TABLE public.cadence_push_focus_timers FROM service_role;

GRANT SELECT, UPDATE ON TABLE public.cadence_push_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cadence_push_subscriptions TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.cadence_push_deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cadence_push_focus_timers TO service_role;
