"use client";

/**
 * Reading the workspace from React. Storage is only there in the browser, so the first
 * render (on the server, and while hydrating) gets null, and the real value follows on mount.
 * Any change made through `mutate` — or in another tab — makes every reader read again.
 */

import { useCallback, useEffect, useState } from "react";
import { browserStorage, type StorageLike } from "@/model/persistence";

const CHANGED = "clavis:workspace-changed";

/** Tell every reader in this tab that the workspace changed. */
export function notifyWorkspace(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

/** Run a write against browser storage, then let every reader know. */
export function mutate<T>(fn: (s: StorageLike | null) => T): T {
  const out = fn(browserStorage());
  notifyWorkspace();
  return out;
}

/** `key` names what the reader depends on (a plan id, say): when it changes, it reads again. */
export function useWorkspace<T>(read: (s: StorageLike | null) => T, key = ""): T | null {
  const [value, setValue] = useState<T | null>(null);
  // the reader is usually an inline function; keep the latest one without re-subscribing
  const [reader] = useState(() => ({ current: read }));
  reader.current = read;
  const refresh = useCallback(() => setValue(() => reader.current(browserStorage())), [reader]);

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => (e.key === null || e.key.startsWith("clavis:")) && refresh();
    window.addEventListener(CHANGED, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, key]);

  return value;
}
