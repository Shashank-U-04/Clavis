"use client";

/**
 * Where your work is kept, at the foot of the sidebar: "in this browser" for a guest, with a
 * way to sign in; "in your account" once signed in, with how the last sync went and sign-out.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from "lucide-react";
import { authConfigured } from "@/lib/auth/config";
import { signOut, signOutAnyway, syncNow, useAccount, type SyncState } from "@/lib/account/bridge";

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function SyncLine({ sync }: { sync: SyncState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (sync.state === "syncing")
    return (
      <span className="flex items-center gap-1.5">
        <RefreshCw size={11} className="animate-spin" aria-hidden="true" /> Syncing…
      </span>
    );
  if (sync.state === "synced") return <span>Synced {ago(sync.at, now)}</span>;
  if (sync.state === "offline") return <span className="text-marker" title={sync.message}>Not synced yet: kept here</span>;
  return null;
}

export function AccountStatus() {
  const { account, sync } = useAccount();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!account) {
    return (
      <Link href={authConfigured() ? "/login" : "/login?accounts=off"} className="label mt-4 flex items-center justify-between border border-rule px-3 py-2 text-ink-2 hover:border-ink hover:text-ink">
        Sign in to sync <LogIn size={13} aria-hidden="true" />
      </Link>
    );
  }

  const leave = async () => {
    setBusy(true);
    const r = await signOut();
    if (!r.ok) setProblem(r.message ?? "Couldn't sign out.");
    setBusy(false);
  };

  return (
    <div className="mt-4 border border-rule" data-testid="account-status">
      <div className="flex items-start gap-2 px-3 py-2">
        {sync.state === "offline" ? <CloudOff size={13} className="mt-0.5 text-marker" aria-hidden="true" /> : <Cloud size={13} className="mt-0.5 text-ink-3" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink" title={account.email}>
            {account.email}
          </p>
          <p className="mt-0.5 font-mono text-[0.66rem] text-ink-3" aria-live="polite">
            <SyncLine sync={sync} />
          </p>
        </div>
        <button type="button" onClick={() => void syncNow()} className="text-ink-3 hover:text-ink" aria-label="Sync now" title="Sync now">
          <RefreshCw size={12} aria-hidden="true" />
        </button>
      </div>
      {problem ? (
        <div className="border-t border-rule px-3 py-2 text-xs text-ink-2">
          <p>{problem}</p>
          <button type="button" className="label mt-2 text-marker underline underline-offset-4" onClick={() => void signOutAnyway()}>
            Sign out anyway
          </button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => void leave()} className="label flex w-full items-center justify-between border-t border-rule px-3 py-2 text-ink-2 hover:bg-paper-2 hover:text-ink disabled:opacity-50">
          {busy ? "Signing out…" : "Sign out"} <LogOut size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** "Saved in this browser" or "Saved in your account", for the storage meter's caption. */
export function useWhereSaved(): string {
  const { account } = useAccount();
  return account ? "In your account, cached here" : "Saved in this browser";
}
