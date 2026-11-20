"use client";

/**
 * Signing in. Clavis accounts are Google accounts: one button, nothing to fill in, no
 * passwords to keep. The one exception is the hackathon judges' demo account, which signs in
 * with the email and password shown in the site footer.
 */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { leaveTo } from "@/lib/account/bridge";
import { auth, type AuthResult } from "@/lib/auth/client";
import { JUDGES_EMAIL, JUDGES_PASSWORD, judgesLoginShown } from "@/lib/auth/judges";
import { errorsOf, SignInSchema, type FieldErrors } from "@/lib/auth/validate";
import { AuthNotice, Divider, Field, GoogleButton } from "./fields";

/** Shared submit plumbing: validate, call, show the answer. */
function useAuthForm() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<AuthResult | null>(null);
  const run = async (check: FieldErrors, action: () => Promise<AuthResult>) => {
    setErrors(check);
    setResult(null);
    if (Object.keys(check).length) return;
    setBusy(true);
    try {
      const out = await action();
      // a full page load, so the whole app picks up the new session (and this person's plans)
      if (out.ok && out.redirect) {
        leaveTo(out.redirect);
        return;
      }
      setResult(out);
    } finally {
      setBusy(false);
    }
  };
  return { busy, errors, result, setResult, run, google: () => run({}, () => auth.signInWithGoogle()) };
}

const values = (e: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

/** The judges' demo account: email and password, prefilled from the footer's values. */
function JudgesForm() {
  const f = useAuthForm();
  return (
    <details className="group border border-rule" open={false}>
      <summary className="label flex cursor-pointer list-none items-center justify-between px-4 py-3 text-ink-2 hover:text-ink">
        Hackathon judges: demo account
        <span className="text-ink-3 group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <form
        noValidate
        className="space-y-4 border-t border-rule p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = values(e);
          void f.run(errorsOf(SignInSchema.safeParse(v)), () => auth.signInWithPassword(v.email, v.password));
        }}
      >
        <p className="text-sm text-ink-2">A shared account with sample plans, for judging. Everyone else signs in with Google.</p>
        <Field label="Email" name="email" type="email" autoComplete="username" defaultValue={JUDGES_EMAIL} error={f.errors.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" defaultValue={JUDGES_PASSWORD} error={f.errors.password} />
        <AuthNotice result={f.result} />
        <Button type="submit" arrow disabled={f.busy} className="w-full py-3">
          {f.busy ? "Signing in…" : "Sign in to the demo account"}
        </Button>
      </form>
    </details>
  );
}

export function LoginForm() {
  const f = useAuthForm();
  const { setResult } = f;
  // back from /auth/callback with a link or Google answer that no longer works
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link")
      setResult({ ok: false, code: "invalid", message: "That sign-in didn't go through, or the link was already used. Try again." });
  }, [setResult]);
  return (
    <div className="space-y-6">
      <GoogleButton onClick={f.google} busy={f.busy} />
      <AuthNotice result={f.result} />
      <p className="text-sm text-ink-2">Your Google account is your Clavis account: no new password, and your plans follow you to every device. Anything you made here as a guest comes with you.</p>
      {judgesLoginShown() && (
        <>
          <Divider>or</Divider>
          <JudgesForm />
        </>
      )}
      <p className="text-sm text-ink-2">
        No account needed to design:{" "}
        <Link href="/dashboard" className="text-ink underline underline-offset-4 hover:text-marker">
          continue as a guest
        </Link>
        , and your plans stay in this browser.
      </p>
    </div>
  );
}

export function SignupForm() {
  const f = useAuthForm();
  return (
    <div className="space-y-6">
      <GoogleButton onClick={f.google} busy={f.busy} />
      <AuthNotice result={f.result} />
      <p className="text-sm text-ink-2">There is nothing to fill in: the first time you continue with Google, your Clavis account is made, named from your Google profile.</p>
      <p className="text-xs text-ink-3">
        By continuing you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          privacy notice
        </Link>
        .
      </p>
      <p className="text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4 hover:text-marker">
          Sign in
        </Link>
      </p>
    </div>
  );
}
