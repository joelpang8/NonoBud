import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

/**
 * The Supabase client, or null when the app isn't connected to Supabase yet
 * (no .env.local). In that case the app runs on this device only.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // Password-reset links come back as ?code=…, which doesn't clash with the app's #/ routes.
          flowType: 'pkce',
        },
      })
    : null;
