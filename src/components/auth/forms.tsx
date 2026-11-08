"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { auth, type AuthResult } from "@/lib/auth/client";
import { errorsOf, MagicLinkSchema, passwordStrength, ResetSchema, SignInSchema, SignUpSchema, type FieldErrors } from "@/lib/auth/validate";
import { AuthNotice, Divider, Field, GitHubButton } from "./fields";

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
      setResult(await action());
    } finally {
      setBusy(false);
    }
  };
  return { busy, errors, result, run, github: () => run({}, auth.signInWithGitHub) };
}

const values = (e: FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;

export function LoginForm() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const f = useAuthForm();
  return (
    <div className="space-y-6">
      <GitHubButton onClick={f.github} busy={f.busy} />
      <Divider>or with email</Divider>
      <div className="grid grid-cols-2 border border-rule" role="tablist" aria-label="Sign-in method">
        {(["password", "link"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`label py-2.5 ${mode === m ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
            {m === "password" ? "Password" : "Magic link"}
          </button>
        ))}
      </div>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = values(e);
          if (mode === "password") void f.run(errorsOf(SignInSchema.safeParse(v)), () => auth.signInWithPassword(v.email, v.password));
          else void f.run(errorsOf(MagicLinkSchema.safeParse(v)), () => auth.sendMagicLink(v.email));
        }}
      >
        <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={f.errors.email} />
        {mode === "password" ? (
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            error={f.errors.password}
            hint={
              <Link href="/forgot-password" className="underline underline-offset-4 hover:text-marker">
                Forgot your password?
              </Link>
            }
          />
        ) : (
          <p className="text-sm text-ink-2">We&apos;ll email you a one-time link. Open it on this device and you&apos;re signed in — no password needed.</p>
        )}
        <AuthNotice result={f.result} />
        <Button type="submit" arrow disabled={f.busy} className="w-full py-4">
          {f.busy ? "Working…" : mode === "password" ? "Sign in" : "Email me a link"}
        </Button>
      </form>
      <p className="text-sm text-ink-2">
        New to Clavis?{" "}
        <Link href="/signup" className="text-ink underline underline-offset-4 hover:text-marker">
          Create an account
        </Link>
      </p>
    </div>
  );
}

const STRENGTH = ["Too weak", "Weak", "Fair", "Good", "Strong"];

export function SignupForm() {
  const f = useAuthForm();
  const [pw, setPw] = useState("");
  const strength = passwordStrength(pw);
  return (
    <div className="space-y-6">
      <GitHubButton onClick={f.github} busy={f.busy} />
      <Divider>or with email</Divider>
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = values(e);
          void f.run(errorsOf(SignUpSchema.safeParse(v)), () => auth.signUp(v.name, v.email, v.password));
        }}
      >
        <Field label="Name" name="name" autoComplete="name" placeholder="What should we call you?" error={f.errors.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={f.errors.email} />
        <div>
          <Field label="Password" name="password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={f.errors.password} hint="At least 10 characters, with a number or symbol." />
          <div className="mt-2 flex items-center gap-3" aria-live="polite">
            <div className="grid flex-1 grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-1 ${pw && strength >= i ? (strength >= 3 ? "bg-ink" : "bg-marker") : "bg-rule"}`} />
              ))}
            </div>
            <span className="label w-16 text-right text-ink-3">{pw ? STRENGTH[strength] : ""}</span>
          </div>
        </div>
        <AuthNotice result={f.result} />
        <Button type="submit" arrow disabled={f.busy} className="w-full py-4">
          {f.busy ? "Working…" : "Create account"}
        </Button>
        <p className="text-xs text-ink-3">
          By creating an account you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            privacy notice
          </Link>
          .
        </p>
      </form>
      <p className="text-sm text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4 hover:text-marker">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ForgotForm() {
  const f = useAuthForm();
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const v = values(e);
        void f.run(errorsOf(MagicLinkSchema.safeParse(v)), () => auth.requestPasswordReset(v.email));
      }}
    >
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={f.errors.email} />
      <AuthNotice result={f.result} />
      <Button type="submit" arrow disabled={f.busy} className="w-full py-4">
        {f.busy ? "Working…" : "Send a reset link"}
      </Button>
      <p className="text-sm text-ink-2">
        Remembered it?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4 hover:text-marker">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm() {
  const f = useAuthForm();
  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const v = values(e);
        void f.run(errorsOf(ResetSchema.safeParse(v)), () => auth.updatePassword(v.password));
      }}
    >
      <Field label="New password" name="password" type="password" autoComplete="new-password" error={f.errors.password} hint="At least 10 characters, with a number or symbol." />
      <Field label="Repeat it" name="confirm" type="password" autoComplete="new-password" error={f.errors.confirm} />
      <AuthNotice result={f.result} />
      <Button type="submit" arrow disabled={f.busy} className="w-full py-4">
        {f.busy ? "Working…" : "Save the new password"}
      </Button>
    </form>
  );
}
