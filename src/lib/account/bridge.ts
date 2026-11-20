"use client";

/**
 * Keeps three things in step in the browser: the Supabase session (in cookies), the account
 * the workspace is scoped to (clavis:account, see model/account.ts), and the cloud copy of
 * that account's workspace (sync.ts).
 *
 *  - Signing in or out anywhere (this tab, another tab, the callback page) switches the
 *    workspace and reloads the page, so every screen shows the right person's plans.
 *  - While signed in, the workspace syncs on load, soon after each change, every half minute,
 *    and when the tab comes back into view or the network returns.
 *  - Signing out sends what is unsent first, then clears this person's copy from the browser.
 */

import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { clearScope, readAccount, writeAccount, type Account } from "@/model/account";
import { baseStorage, browserStorage } from "@/model/persistence";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { CHANGED, SAVED, notifyWorkspace } from "@/lib/workspace/useWorkspace";
import { syncWorkspace } from "./sync";
import { supabaseRemote } from "./supabaseRemote";

export type SyncState =
  | { state: "guest" }
  | { state: "syncing"; last?: number }
  | { state: "synced"; at: number }
  | { state: "offline"; last?: number; message: string };

interface Snapshot {
  account: Account | null;
  sync: SyncState;
}

const listeners = new Set<() => void>();
let snapshot: Snapshot = { account: null, sync: { state: "guest" } };
const GUEST: Snapshot = { account: null, sync: { state: "guest" } };

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

/** Who is signed in, and how the cloud copy stands. Guest on the server and until mounted. */
export function useAccount(): Snapshot {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => snapshot,
    () => GUEST,
  );
}

const toAccount = (u: User): Account => ({
  id: u.id,
  email: u.email ?? "",
  name: (u.user_metadata?.name as string | undefined) ?? (u.user_metadata?.full_name as string | undefined),
});

// ------------------------------------------------------------------------------------ sync

let running: Promise<void> | null = null;
let again = false;
let applying = false;

/** Bring this browser and the cloud into step now (one run at a time; a request mid-run queues one more). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    const sb = supabaseBrowser();
    const account = snapshot.account;
    const s = browserStorage();
    if (!sb || !account || !s) return;
    const last = snapshot.sync.state === "synced" ? snapshot.sync.at : undefined;
    set({ sync: { state: "syncing", last } });
    try {
      const out = await syncWorkspace(s, supabaseRemote(sb, account.id));
      if (out.changedLocally) {
        applying = true;
        notifyWorkspace();
        applying = false;
      }
      set({ sync: { state: "synced", at: Date.now() } });
    } catch (e) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      set({ sync: { state: "offline", last, message: offline ? "You're offline. Changes are kept here and sent when you're back." : "Couldn't reach your account. Changes are kept here and sent shortly." } });
      if (process.env.NODE_ENV !== "production") console.warn("[clavis sync]", e);
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

let soon: ReturnType<typeof setTimeout> | null = null;
const syncSoon = () => {
  if (applying || !snapshot.account) return;
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => void syncNow(), 2000);
};

// ------------------------------------------------------------------------------- the bridge

/**
 * The browser's account must match the session. When it does not, switch and reload, so no
 * screen keeps showing the previous person's plans.
 */
let confirmed: string | null = null;

/** Where the page is about to go after signing in, so the account switch goes there too. */
let leavingFor: string | null = null;

/**
 * Leave for `href` once signed in on this page. The new session also reaches reconcile(),
 * whose reload would cancel this navigation and leave the person on the sign-in page.
 */
export function leaveTo(href: string) {
  leavingFor = href;
  window.location.assign(href);
}

function reconcile(user: User | null) {
  const base = baseStorage();
  const stored = readAccount(base);
  if (user) {
    const account = toAccount(user);
    if (stored?.id !== account.id) {
      writeAccount(base, account);
      // reload only if the switch stuck; with storage blocked that would loop forever
      if (readAccount(base)?.id === account.id) {
        if (leavingFor) window.location.assign(leavingFor);
        else window.location.reload();
        return;
      }
    }
    // the session confirms the account: sync once now (later runs follow changes and the timer)
    if (confirmed !== account.id) {
      confirmed = account.id;
      set({ account });
      void syncNow();
    }
  } else if (stored) {
    // the session ended (signed out in another tab, or expired): back to the guest workspace
    writeAccount(base, null);
    if (!readAccount(base)) window.location.reload();
  } else if (snapshot.account) {
    confirmed = null;
    set({ account: null, sync: { state: "guest" } });
  }
}

let started = false;

/** Start once per page; returns a stop function (for tests and hot reload). */
export function startAccountBridge(): () => void {
  const sb = supabaseBrowser();
  if (!sb || started) return () => {};
  started = true;

  // known synchronously from the last visit, so the first render of signed-in pages is right
  const remembered = readAccount(baseStorage());
  if (remembered) set({ account: remembered, sync: { state: "syncing" } });

  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    // never await Supabase calls inside this callback; defer the work
    setTimeout(() => reconcile(session?.user ?? null), 0);
  });

  const onVisible = () => document.visibilityState === "visible" && syncSoon();
  const onHidden = () => document.visibilityState === "hidden" && snapshot.account && void syncNow();
  const timer = setInterval(() => snapshot.account && document.visibilityState === "visible" && void syncNow(), 30_000);
  window.addEventListener(CHANGED, syncSoon);
  window.addEventListener(SAVED, syncSoon);
  window.addEventListener("online", syncSoon);
  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("visibilitychange", onHidden);

  return () => {
    started = false;
    data.subscription.unsubscribe();
    clearInterval(timer);
    window.removeEventListener(CHANGED, syncSoon);
    window.removeEventListener(SAVED, syncSoon);
    window.removeEventListener("online", syncSoon);
    document.removeEventListener("visibilitychange", onVisible);
    document.removeEventListener("visibilitychange", onHidden);
  };
}

/** Send what is unsent, sign out, and clear this person's copy from the browser. */
export async function signOut(): Promise<{ ok: boolean; message?: string }> {
  const sb = supabaseBrowser();
  const account = snapshot.account ?? readAccount(baseStorage());
  if (!sb) return { ok: false, message: "Accounts aren't switched on." };
  await syncNow();
  if (snapshot.sync.state === "offline")
    return { ok: false, message: "Some changes haven't reached your account yet. Connect to the internet, then sign out, so nothing is lost." };
  await sb.auth.signOut();
  const base = baseStorage();
  if (base && account) clearScope(base, account.id);
  writeAccount(base, null);
  window.location.assign("/");
  return { ok: true };
}

/** Sign out even though some changes have not been sent (they are lost from this browser). */
export async function signOutAnyway(): Promise<void> {
  const sb = supabaseBrowser();
  const account = snapshot.account ?? readAccount(baseStorage());
  await sb?.auth.signOut();
  const base = baseStorage();
  if (base && account) clearScope(base, account.id);
  writeAccount(base, null);
  window.location.assign("/");
}
