/**
 * Local persistence: autosave to this browser's storage, plus JSON file export/import.
 * Nothing here talks to a server — designs stay on the user's machine.
 *
 * Storage can be unavailable (private mode, blocked site data), full (quota), or hold data
 * this build cannot read. Each case is reported to the user rather than swallowed, and a
 * stored design that fails to parse is kept under a backup key instead of being overwritten.
 */

import { parseDocument, serializeDocument, toDocument, MAX_DOCUMENT_BYTES, type DesignDocument } from "./document";
import type { Note, PlanModel } from "./types";

export const AUTOSAVE_KEY = "clavis:autosave";
export const BACKUP_KEY = "clavis:autosave:unreadable";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* some browsers throw on the getter itself when site data is blocked */
  }
  return null;
}

export type SaveOutcome = { ok: true; bytes: number } | { ok: false; message: string };

export function saveToStorage(storage: StorageLike | null, model: PlanModel, notes: Note[]): SaveOutcome {
  if (!storage) return { ok: false, message: "Browser storage is unavailable, so the design cannot be autosaved. Use Export to keep a copy." };
  const text = serializeDocument(toDocument(model, notes));
  try {
    storage.setItem(AUTOSAVE_KEY, text);
    return { ok: true, bytes: text.length };
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
    return {
      ok: false,
      message: quota
        ? "Browser storage is full (a large tracing image is the usual cause). Remove the image or use Export."
        : "The browser refused to store the design. Use Export to keep a copy.",
    };
  }
}

export type RestoreOutcome =
  | { kind: "empty" }
  | { kind: "restored"; doc: DesignDocument }
  | { kind: "unreadable"; message: string };

export function restoreFromStorage(storage: StorageLike | null): RestoreOutcome {
  if (!storage) return { kind: "empty" };
  let text: string | null;
  try {
    text = storage.getItem(AUTOSAVE_KEY);
  } catch {
    return { kind: "empty" };
  }
  if (!text) return { kind: "empty" };
  const parsed = parseDocument(text);
  if (parsed.ok) return { kind: "restored", doc: parsed.doc };
  try {
    // keep the unreadable copy so a later build (or a person) can recover it
    storage.setItem(BACKUP_KEY, text);
    storage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* best effort */
  }
  return { kind: "unreadable", message: `Your previous autosave could not be restored: ${parsed.message} A copy was kept in browser storage.` };
}

/** Trigger a browser download of the design as JSON. */
export function downloadDocument(model: PlanModel, notes: Note[]): void {
  const text = serializeDocument(toDocument(model, notes));
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = model.name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "design";
  a.href = url;
  a.download = `${safe}.clavis.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a user-chosen file with a size limit before parsing it. */
export async function readDesignFile(file: File) {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false as const, code: "too_large" as const, message: `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.` };
  }
  return parseDocument(await file.text());
}
