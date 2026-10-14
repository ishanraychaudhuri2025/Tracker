import { createClient } from '@supabase/supabase-js';

// The publishable key is intentionally public. Row-level security in Postgres,
// not secrecy of this key, protects each user's workspace.
// Vercel project-env APIs are currently failing to resolve this project, so keep
// these public project values as fallbacks while still allowing env overrides.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL?.trim() ||
  'https://wxyigvitegdnurimmarb.supabase.co';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  'sb_publishable_GZqJbJ1YPt6p4fUUgZNs8w_JaF71sZs';

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
