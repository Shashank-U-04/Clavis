"use client";

import Link from "next/link";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import type { AuthResult } from "@/lib/auth/client";

/** A labelled input with its hint or error underneath, wired for screen readers. */
export function Field({ label, error, hint, ...input }: { label: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = input.type === "password";
  return (
    <div>
      <label htmlFor={id} className="label text-ink-2">
        {label}
      </label>
      <div className={`mt-2 flex border bg-paper ${error ? "border-marker" : "border-rule focus-within:border-ink"}`}>
        <input
          id={id}
          {...input}
          type={isPassword && shown ? "text" : input.type}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none placeholder:text-ink-3"
        />
        {isPassword && (
          <button type="button" onClick={() => setShown(!shown)} className="px-3 text-ink-3 hover:text-ink" aria-label={shown ? "Hide password" : "Show password"}>
            {shown ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p id={`${id}-note`} className={`mt-1.5 text-sm ${error ? "text-marker" : "text-ink-3"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** The answer from the auth service, including the honest "not switched on yet". */
export function AuthNotice({ result }: { result: AuthResult | null }) {
  if (!result) return null;
  if (result.ok) return result.message ? <p className="border border-ink bg-paper-2 p-4 text-sm" role="status">{result.message}</p> : null;
  return (
    <div className="flex gap-3 border border-ink bg-paper-2 p-4 text-sm" role="alert">
      <Info size={18} className="mt-0.5 shrink-0 text-marker" aria-hidden="true" />
      <div>
        <p>{result.message}</p>
        {result.code === "not_configured" && (
          <Link href="/dashboard" className="label mt-3 inline-block text-ink underline underline-offset-4 hover:text-marker">
            Continue as a guest →
          </Link>
        )}
      </div>
    </div>
  );
}

export function GoogleButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="label flex w-full items-center justify-center gap-3 border border-ink px-4 py-3 hover:bg-ink hover:text-paper disabled:opacity-50">
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
        <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
      Continue with Google
    </button>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="label flex items-center gap-4 text-ink-3" role="separator">
      <span className="h-px flex-1 bg-rule" />
      {children}
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
