/**
 * A daily allowance of hosted-model requests per browser. The hosted model runs on a shared free
 * tier (Groq: a few hundred design requests a day for everyone), so one visitor should not use it
 * all. Clavis Local, which answers in the browser, is never limited.
 *
 * This is a courtesy limit kept in localStorage; the real per-account limit lives on the server
 * once accounts exist.
 */

export const HOSTED_DAILY_CAP = 10;

const KEY = "clavis:hosted-usage";

interface Usage {
  day: string;
  count: number;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** The local calendar day, so the allowance resets at the visitor's midnight. */
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read(s: Storage | null, now: Date): Usage {
  const day = dayOf(now);
  try {
    const raw = s?.getItem(KEY);
    const u = raw ? (JSON.parse(raw) as Partial<Usage>) : null;
    if (u && u.day === day && typeof u.count === "number" && u.count >= 0) return { day, count: Math.floor(u.count) };
  } catch {
    /* unreadable: start the day fresh */
  }
  return { day, count: 0 };
}

function write(s: Storage | null, u: Usage) {
  try {
    s?.setItem(KEY, JSON.stringify(u));
  } catch {
    /* private window or blocked storage: the allowance just is not remembered */
  }
}

export const hostedQuota = {
  /** hosted requests this browser may still make today */
  remaining(now = new Date(), s: Storage | null = storage()): number {
    return Math.max(0, HOSTED_DAILY_CAP - read(s, now).count);
  },
  /** count one request that is about to go to the hosted model */
  record(now = new Date(), s: Storage | null = storage()) {
    const u = read(s, now);
    write(s, { day: u.day, count: u.count + 1 });
  },
  /** give one back: the request never reached the model (busy, unreachable, not set up) */
  refund(now = new Date(), s: Storage | null = storage()) {
    const u = read(s, now);
    write(s, { day: u.day, count: Math.max(0, u.count - 1) });
  },
};

/** Failures where the model did no work, so the request should not count against the allowance. */
export const NOT_COUNTED = new Set(["provider_rate_limited", "rate_limited", "provider_unavailable", "provider_timeout", "not_configured", "provider_auth"]);
