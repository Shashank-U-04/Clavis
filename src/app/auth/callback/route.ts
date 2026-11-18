/**
 * Where Google sign-in, magic links, email confirmations and password-reset links return to.
 * The link carries a one-time code; it is exchanged here for a session (stored in cookies),
 * then the person goes on to `next` — only ever a path on this site.
 */

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authConfigured } from "@/lib/auth/config";
import { safeNext } from "@/lib/auth/next";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  if (!authConfigured()) return to("/login?accounts=off");

  const next = safeNext(url.searchParams.get("next"));
  const supabase = await supabaseServer();
  if (!supabase) return to("/login?accounts=off");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  if (error) return to(`/login?error=link`);
  return to(next);
}
