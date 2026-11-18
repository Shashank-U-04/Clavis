"use client";

/**
 * What the sign-in page calls: Google for everyone, and email + password for the hackathon
 * judges' demo account only (see judges.ts). Every action answers in plain words and never
 * throws. When accounts are not configured (no Supabase URL and key), each one says so.
 *
 * The Google round trip comes back through /auth/callback, which turns the one-time code
 * into a session and then goes on to `next`.
 */

import type { AuthError } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { safeNext } from "./next";

export type AuthResult =
  | { ok: true; message?: string; redirect?: string }
  | { ok: false; code: "not_configured" | "unavailable" | "invalid" | "rate_limited" | "exists" | "unconfirmed"; message: string };

const NOT_CONFIGURED: AuthResult = {
  ok: false,
  code: "not_configured",
  message: "Accounts aren't switched on yet. The studio works fully without one, and saves your projects in this browser.",
};

/** Supabase's error codes, in words a person can act on. */
export function explain(error: AuthError | Error): AuthResult {
  const code = "code" in error ? String(error.code ?? "") : "";
  const status = "status" in error ? Number(error.status) : 0;
  if (code === "invalid_credentials") return { ok: false, code: "invalid", message: "That email and password don't match. Check them against the site footer." };
  if (code === "email_not_confirmed") return { ok: false, code: "unconfirmed", message: "Confirm your email first: open the link we sent you, then sign in." };
  if (code === "user_already_exists" || code === "email_exists") return { ok: false, code: "exists", message: "There is already an account with this email. Sign in instead." };
  if (code === "weak_password") return { ok: false, code: "invalid", message: "Choose a stronger password: longer, with a mix of letters, numbers and symbols." };
  if (code === "same_password") return { ok: false, code: "invalid", message: "That is your current password. Choose a new one." };
  if (code.startsWith("over_") || status === 429)
    return { ok: false, code: "rate_limited", message: "Too many attempts for now. Wait a few minutes and try again." };
  if (code === "otp_disabled" || code === "signup_disabled") return { ok: false, code: "unavailable", message: "This way of signing in is switched off. Try another one." };
  return { ok: false, code: "unavailable", message: "Sign-in is not answering right now. Try again in a moment." };
}

/** Where a link or the Google round trip should land, back on this site. */
const callback = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

/** `next` from the current page's address (?next=/plans/abc), so sign-in returns there. */
export const nextFromLocation = (): string =>
  typeof window === "undefined" ? "/dashboard" : safeNext(new URLSearchParams(window.location.search).get("next"));

async function attempt(fn: () => Promise<AuthResult>): Promise<AuthResult> {
  try {
    return await fn();
  } catch (e) {
    return explain(e instanceof Error ? e : new Error(String(e)));
  }
}

export const auth = {
  signInWithPassword: (email: string, password: string, next = nextFromLocation()) =>
    attempt(async () => {
      const sb = supabaseBrowser();
      if (!sb) return NOT_CONFIGURED;
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      return error ? explain(error) : { ok: true, redirect: next };
    }),

  signInWithGoogle: (next = nextFromLocation()) =>
    attempt(async () => {
      const sb = supabaseBrowser();
      if (!sb) return NOT_CONFIGURED;
      // on success the browser leaves for Google; nothing more happens here
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(next) } });
      return error ? explain(error) : { ok: true };
    }),
};
