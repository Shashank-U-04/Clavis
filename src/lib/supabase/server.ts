/**
 * The Supabase client for server code (route handlers, server components): it reads and
 * refreshes the visitor's session from cookies, so every query runs as that person and
 * row-level security applies. Null when accounts are not configured.
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authConfigured } from "@/lib/auth/config";

export async function supabaseServer(): Promise<SupabaseClient | null> {
  if (!authConfigured()) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // called from a server component, where cookies are read-only; the proxy refreshes them
        }
      },
    },
  });
}
