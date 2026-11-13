/**
 * A local project library: several designs
 * in this browser's storage, each saved as a versioned document under its own key, plus a
 * small index for listing. The open project autosaves into its own slot.
 *
 * Storage problems (unavailable, full, unreadable) are returned as messages for the UI, never
 * thrown, and an unreadable project is left in place rather than overwritten.
 */

import { parseDocument, serializeDocument, toDocument, type DesignDocument } from "./document";
import { AUTOSAVE_KEY, type StorageLike } from "./persistence";
import type { Note, PlanModel } from "./types";

export const INDEX_KEY = "clavis:projects";
export const CURRENT_KEY = "clavis:current";
export const projectKey = (id: string) => `clavis:project:${id}`;

/** Where a plan came from: shown on its card and used to filter the library. */
export type PlanSource = "blank" | "describe" | "import" | "duplicate" | "restore" | `template:${string}`;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  rooms: number;
  area: number;
  /** when it was first saved (missing on plans saved before this was tracked) */
  createdAt?: number;
  /** when it was last opened in the studio */
  openedAt?: number;
  starred?: boolean;
  source?: PlanSource;
}

/** The parts of a plan's index entry that are not read off the design itself. */
export type MetaExtras = Pick<ProjectMeta, "createdAt" | "openedAt" | "starred" | "source">;

export type LibraryResult<T> = { ok: true; value: T } | { ok: false; message: string };

const fail = <T>(message: string): LibraryResult<T> => ({ ok: false, message });

export function newProjectId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function listProjects(storage: StorageLike | null): ProjectMeta[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(INDEX_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p): p is ProjectMeta => !!p && typeof p.id === "string" && typeof p.name === "string" && typeof p.updatedAt === "number")
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeIndex(storage: StorageLike, list: ProjectMeta[]) {
  storage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function saveProject(
  storage: StorageLike | null,
  id: string,
  model: PlanModel,
  notes: Note[],
  now = Date.now(),
  extras: MetaExtras = {},
): LibraryResult<ProjectMeta> {
  if (!storage) return fail("Browser storage is unavailable, so designs cannot be saved here. Use Export to keep a copy.");
  const text = serializeDocument(toDocument(model, notes, new Date(now).toISOString()));
  // what the index already knows about this plan survives the save
  const prev = listProjects(storage).find((p) => p.id === id);
  const meta: ProjectMeta = {
    createdAt: prev?.createdAt ?? now,
    ...(prev?.openedAt !== undefined && { openedAt: prev.openedAt }),
    ...(prev?.starred && { starred: true }),
    ...(prev?.source && { source: prev.source }),
    ...extras,
    id,
    name: model.name,
    updatedAt: now,
    rooms: model.rooms.length,
    area: Math.round(model.rooms.reduce((s, r) => s + r.w * r.h, 0) * 10) / 10,
  };
  try {
    storage.setItem(projectKey(id), text);
    writeIndex(storage, [meta, ...listProjects(storage).filter((p) => p.id !== id)]);
    storage.setItem(CURRENT_KEY, id);
    return { ok: true, value: meta };
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
    return fail(
      quota
        ? "Browser storage is full (large tracing images are the usual cause). Delete old projects or use Export."
        : "The browser refused to store the design. Use Export to keep a copy.",
    );
  }
}

/** Change index-only fields (starred, opened…) without rewriting the document. */
export function updateMeta(storage: StorageLike | null, id: string, patch: MetaExtras): boolean {
  if (!storage) return false;
  const list = listProjects(storage);
  const at = list.findIndex((p) => p.id === id);
  if (at < 0) return false;
  try {
    list[at] = { ...list[at], ...patch };
    writeIndex(storage, list);
    return true;
  } catch {
    return false;
  }
}

export function loadProject(storage: StorageLike | null, id: string): LibraryResult<DesignDocument> {
  if (!storage) return fail("Browser storage is unavailable.");
  let text: string | null;
  try {
    text = storage.getItem(projectKey(id));
  } catch {
    return fail("Browser storage could not be read.");
  }
  if (!text) return fail("That project is no longer in this browser.");
  const parsed = parseDocument(text);
  return parsed.ok ? { ok: true, value: parsed.doc } : fail(`The saved project could not be read: ${parsed.message}`);
}

export function deleteProject(storage: StorageLike | null, id: string): void {
  if (!storage) return;
  try {
    storage.removeItem(projectKey(id));
    writeIndex(storage, listProjects(storage).filter((p) => p.id !== id));
    if (storage.getItem(CURRENT_KEY) === id) storage.removeItem(CURRENT_KEY);
  } catch {
    /* best effort */
  }
}

export function currentProjectId(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(CURRENT_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Move the single autosave slot used before the library existed into the library, once.
 * Returns the new project id, or null when there was nothing to migrate.
 */
export function migrateLegacyAutosave(storage: StorageLike | null): string | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const parsed = parseDocument(text);
    if (!parsed.ok) return null; // left for restoreFromStorage to report and back up
    const id = newProjectId();
    const r = saveProject(storage, id, parsed.doc.model, parsed.doc.notes ?? []);
    if (!r.ok) return null;
    storage.removeItem(AUTOSAVE_KEY);
    return id;
  } catch {
    return null;
  }
}
