"use client";

/**
 * The Supabase client for the browser. One per tab; the session lives in cookies so the
 * server (route handlers, the proxy) reads the same sign-in. Null when accounts are not
 * configured, so every caller can fall back to guest mode.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authConfigured } from "@/lib/auth/config";

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient | null {
  if (!authConfigured() || typeof window === "undefined") return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
