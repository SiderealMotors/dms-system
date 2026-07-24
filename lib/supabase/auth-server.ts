import { createClient } from '@supabase/supabase-js'

/**
 * Create a Supabase client with the service role key for server-side auth operations.
 * This client has elevated permissions for auth and database operations.
 */
export function createAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
