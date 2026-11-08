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
          <Link href="/studio/try" className="label mt-3 inline-block text-ink underline underline-offset-4 hover:text-marker">
            Open the studio without an account →
          </Link>
        )}
      </div>
    </div>
  );
}

export function GitHubButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="label flex w-full items-center justify-center gap-3 border border-ink px-4 py-3 hover:bg-ink hover:text-paper disabled:opacity-50">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" />
      </svg>
      Continue with GitHub
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
