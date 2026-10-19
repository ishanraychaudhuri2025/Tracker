import { createClient } from '@supabase/supabase-js';

// Publishable/anon keys are designed for browser use. Database access is
// protected by PostgreSQL RLS; service-role keys must never be placed here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  '';

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
