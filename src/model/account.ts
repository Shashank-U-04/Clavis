/**
 * Whose plans this browser is showing. A guest's workspace lives under the plain `clavis:`
 * keys; a signed-in person's under `clavis:u:<user id>:`, so the two never mix, signing out
 * can clear one without touching the other, and nothing else in the app needs to know.
 *
 * The signed-in account is remembered in `clavis:account` so it is known synchronously on
 * the very first read of a page load; the session itself lives in Supabase's cookies, and
 * the account bridge (src/components/account) keeps the two in step.
 */

import type { StorageLike } from "./persistence";

export const ACCOUNT_KEY = "clavis:account";

export interface Account {
  id: string;
  email: string;
  name?: string;
}

const PREFIX = "clavis:";
export const scopePrefix = (userId: string) => `clavis:u:${userId}:`;

/** Read the remembered account from the browser's own (unscoped) storage. */
export function readAccount(base: StorageLike | null): Account | null {
  try {
    const raw = base?.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Partial<Account>;
    return typeof a.id === "string" && /^[0-9a-f-]{36}$/i.test(a.id) && typeof a.email === "string" ? { id: a.id, email: a.email, name: a.name } : null;
  } catch {
    return null;
  }
}

export function writeAccount(base: StorageLike | null, account: Account | null): void {
  try {
    if (account) base?.setItem(ACCOUNT_KEY, JSON.stringify(account));
    else base?.removeItem(ACCOUNT_KEY);
  } catch {
    /* storage blocked: the account is simply not remembered */
  }
}

type Enumerable = StorageLike & { readonly length: number; key(index: number): string | null };

/**
 * A view of the browser's storage in which `clavis:x` means `clavis:u:<id>:x`. Keys outside
 * `clavis:` pass through untouched. `length` and `key()` list only this person's keys, under
 * their unscoped names, so code that walks storage (the usage meter) works unchanged.
 */
export class ScopedStorage implements StorageLike {
  private readonly prefix: string;
  constructor(
    private readonly base: Enumerable,
    userId: string,
  ) {
    this.prefix = scopePrefix(userId);
  }
  private map(key: string): string {
    return key.startsWith(PREFIX) ? this.prefix + key.slice(PREFIX.length) : key;
  }
  getItem(key: string): string | null {
    return this.base.getItem(this.map(key));
  }
  setItem(key: string, value: string): void {
    this.base.setItem(this.map(key), value);
  }
  removeItem(key: string): void {
    this.base.removeItem(this.map(key));
  }
  private own(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.base.length; i++) {
      const k = this.base.key(i);
      if (k?.startsWith(this.prefix)) out.push(PREFIX + k.slice(this.prefix.length));
    }
    return out;
  }
  get length(): number {
    return this.own().length;
  }
  key(index: number): string | null {
    return this.own()[index] ?? null;
  }
  /** Every key of this person's workspace, unscoped names. */
  keys(): string[] {
    return this.own();
  }
}

/** Remove a person's whole local workspace (after signing out); the cloud copy is untouched. */
export function clearScope(base: Enumerable, userId: string): void {
  const prefix = scopePrefix(userId);
  const doomed: string[] = [];
  for (let i = 0; i < base.length; i++) {
    const k = base.key(i);
    if (k?.startsWith(prefix)) doomed.push(k);
  }
  for (const k of doomed) {
    try {
      base.removeItem(k);
    } catch {
      /* best effort */
    }
  }
}
