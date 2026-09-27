import { createClient } from '@supabase/supabase-js';

// SERVER-ONLY client using the service role key, which bypasses Row Level
// Security policies. NEVER import this in any 'use client' component or
// anywhere that runs in the browser — it has full database access.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});