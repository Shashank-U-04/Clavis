/**
 * Keeps the sign-in fresh: on each request, refresh the Supabase session if it is close to
 * expiring and pass the new cookies both to the page being rendered and back to the browser.
 * Does nothing (and costs nothing) for visitors without a session or when accounts are off.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authConfigured } from "@/lib/auth/config";

export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!authConfigured()) return response;
  // no Supabase cookie means a guest: nothing to refresh, no network call
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // validates the token and refreshes it when needed; must run before the response is returned
  await supabase.auth.getClaims();
  return response;
}
