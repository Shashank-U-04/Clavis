/**
 * The service-role client: server code only, for the few things a person must not do for
 * themselves (counting their own AI allowance). Never import this from a client component;
 * the key has no NEXT_PUBLIC_ prefix, so it is not in the browser bundle either way.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/auth/config";

let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  admin ??= createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}
