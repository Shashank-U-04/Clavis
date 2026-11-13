/**
 * The workspace in this browser's storage. Every function takes the storage it works on, so
 * the tests run against a plain in-memory map, and none of them throws: problems come back
 * as messages, as in the plan library underneath.
 *
 * Keys, besides the library's own (clavis:projects, clavis:project:<id>, clavis:current):
 *   clavis:versions:<id>   the versions of one plan, newest first, each with its document
 *   clavis:activity        the newest MAX_EVENTS events, newest first
 *   clavis:profile         the profile
 */

import {
  CURRENT_KEY,
  currentProjectId,
  deleteProject,
  listProjects,
  loadProject,
  newProjectId,
  saveProject,
  updateMeta,
  type PlanSource,
} from "@/model/library";
import { parseDocument, toDocument, type DesignDocument } from "@/model/document";
import type { StorageLike } from "@/model/persistence";
import type { Note, PlanModel } from "@/model/types";
import type { ActivityEvent, Plan, Profile, Result, VersionMeta } from "./types";

export const ACTIVITY_KEY = "clavis:activity";
export const PROFILE_KEY = "clavis:profile";
export const versionsKey = (planId: string) => `clavis:versions:${planId}`;

export const MAX_EVENTS = 300;
export const MAX_NAMED_VERSIONS = 20;
export const MAX_AUTO_VERSIONS = 10;
/** An automatic checkpoint is taken at most this often while a plan is being edited. */
export const CHECKPOINT_MS = 15 * 60_000;
/** Saves of the same plan closer together than this fold into one "edited" event. */
export const FOLD_MS = 30 * 60_000;

const fail = <T>(message: string): Result<T> => ({ ok: false, message });
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readJson<T>(s: StorageLike | null, key: string, fallback: T): T {
  if (!s) return fallback;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(s: StorageLike | null, key: string, value: unknown): boolean {
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Run a library write that should not change which plan the studio reopens. */
function keepingCurrent<T>(s: StorageLike, fn: () => T): T {
  const before = currentProjectId(s);
  const out = fn();
  try {
    if (before) s.setItem(CURRENT_KEY, before);
    else s.removeItem(CURRENT_KEY);
  } catch {
    /* best effort */
  }
  return out;
}

const area = (m: PlanModel) => Math.round(m.rooms.reduce((t, r) => t + r.w * r.h, 0) * 10) / 10;

// ---------------------------------------------------------------------------------- activity

export function listEvents(s: StorageLike | null, opts: { planId?: string; limit?: number } = {}): ActivityEvent[] {
  const all = readJson<ActivityEvent[]>(s, ACTIVITY_KEY, []);
  const list = Array.isArray(all) ? all.filter((e) => e && typeof e.at === "number" && typeof e.kind === "string") : [];
  const mine = opts.planId ? list.filter((e) => e.planId === opts.planId) : list;
  return opts.limit ? mine.slice(0, opts.limit) : mine;
}

export function logEvent(s: StorageLike | null, e: Omit<ActivityEvent, "id">): ActivityEvent {
  const event: ActivityEvent = { id: uid("e"), ...e };
  writeJson(s, ACTIVITY_KEY, [event, ...listEvents(s)].slice(0, MAX_EVENTS));
  return event;
}

/** A save of a plan: folded into the last "edited" event if it is recent and for the same plan. */
export function recordEdit(s: StorageLike | null, planId: string, planName: string, now = Date.now()): void {
  const list = listEvents(s);
  const top = list[0];
  if (top && top.kind === "edited" && top.planId === planId && now - top.at < FOLD_MS) {
    list[0] = { ...top, at: now, planName, count: (top.count ?? 1) + 1 };
    writeJson(s, ACTIVITY_KEY, list);
  } else logEvent(s, { at: now, kind: "edited", planId, planName, count: 1 });
}

// ------------------------------------------------------------------------------------- plans

export const listPlans = (s: StorageLike | null): Plan[] => listProjects(s);
export const getPlan = (s: StorageLike | null, id: string): Plan | null => listProjects(s).find((p) => p.id === id) ?? null;

/** The plan the studio will reopen: the current one if it still exists, else the last opened. */
export function lastPlan(s: StorageLike | null): Plan | null {
  const list = listProjects(s);
  const cur = currentProjectId(s);
  return list.find((p) => p.id === cur) ?? [...list].sort((a, b) => (b.openedAt ?? b.updatedAt) - (a.openedAt ?? a.updatedAt))[0] ?? null;
}

const SOURCE_TEXT: Record<string, string> = {
  blank: "a blank sheet",
  describe: "a description",
  import: "an imported file",
  duplicate: "a copy",
  restore: "an earlier version",
};
export const sourceText = (src?: PlanSource): string =>
  !src ? "" : src.startsWith("template:") ? "a template" : (SOURCE_TEXT[src] ?? "");

/** Save a new plan and make it the one the studio opens next. */
export function createPlan(s: StorageLike | null, model: PlanModel, notes: Note[], source: PlanSource, now = Date.now(), detail?: string): Result<Plan> {
  const id = newProjectId();
  const r = saveProject(s, id, model, notes, now, { createdAt: now, openedAt: now, source });
  if (!r.ok) return r;
  logEvent(s, { at: now, kind: source === "import" ? "imported" : "created", planId: id, planName: model.name, detail: detail ?? `From ${sourceText(source)}` });
  return r;
}

export function markOpened(s: StorageLike | null, id: string, now = Date.now()): void {
  const p = getPlan(s, id);
  if (!p) return;
  updateMeta(s, id, { openedAt: now });
  // reopening the same plan within the folding window is one visit, not several
  const top = listEvents(s)[0];
  if (top && top.planId === id && now - top.at < FOLD_MS) return;
  logEvent(s, { at: now, kind: "opened", planId: id, planName: p.name });
}

export function renamePlan(s: StorageLike | null, id: string, name: string, now = Date.now()): Result<Plan> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return fail("A plan needs a name.");
  if (!s) return fail("Browser storage is unavailable.");
  const doc = loadProject(s, id);
  if (!doc.ok) return doc;
  const before = doc.value.model.name;
  if (before === clean) return { ok: true, value: getPlan(s, id)! };
  const r = keepingCurrent(s, () => saveProject(s, id, { ...doc.value.model, name: clean }, doc.value.notes ?? [], now));
  if (r.ok) logEvent(s, { at: now, kind: "renamed", planId: id, planName: clean, detail: `Was “${before}”` });
  return r;
}

export function duplicatePlan(s: StorageLike | null, id: string, now = Date.now()): Result<Plan> {
  if (!s) return fail("Browser storage is unavailable.");
  const doc = loadProject(s, id);
  if (!doc.ok) return doc;
  const name = `${doc.value.model.name} (copy)`.slice(0, 80);
  const copy = newProjectId();
  const r = keepingCurrent(s, () => saveProject(s, copy, { ...doc.value.model, name }, doc.value.notes ?? [], now, { createdAt: now, source: "duplicate" }));
  if (r.ok) logEvent(s, { at: now, kind: "duplicated", planId: copy, planName: name, detail: `Copied from “${doc.value.model.name}”` });
  return r;
}

export function starPlan(s: StorageLike | null, id: string, on: boolean, now = Date.now()): void {
  const p = getPlan(s, id);
  if (!p || updateMeta(s, id, { starred: on }) === false) return;
  if (on) logEvent(s, { at: now, kind: "starred", planId: id, planName: p.name });
}

export function deletePlan(s: StorageLike | null, id: string, now = Date.now()): void {
  const p = getPlan(s, id);
  deleteProject(s, id);
  try {
    s?.removeItem(versionsKey(id));
  } catch {
    /* best effort */
  }
  if (p) logEvent(s, { at: now, kind: "deleted", planId: id, planName: p.name });
}

// ---------------------------------------------------------------------------------- versions

interface StoredVersion extends VersionMeta {
  doc: string;
}

const readVersions = (s: StorageLike | null, planId: string): StoredVersion[] => {
  const v = readJson<StoredVersion[]>(s, versionsKey(planId), []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.doc === "string") : [];
};

export function listVersions(s: StorageLike | null, planId: string): VersionMeta[] {
  return readVersions(s, planId).map(({ doc: _doc, ...meta }) => meta);
}

/** The document a version holds. Versions leave the tracing image out; it can run to megabytes. */
const snapshot = (model: PlanModel, notes: Note[], at: number) => JSON.stringify(toDocument({ ...model, underlay: null }, notes, new Date(at).toISOString()));

export function saveVersion(
  s: StorageLike | null,
  planId: string,
  model: PlanModel,
  notes: Note[],
  opts: { label?: string; auto?: boolean; now?: number } = {},
): Result<VersionMeta> {
  if (!s) return fail("Browser storage is unavailable.");
  const now = opts.now ?? Date.now();
  const auto = !!opts.auto;
  const label = (opts.label?.trim() || (auto ? "Checkpoint" : "Saved version")).slice(0, 80);
  const v: StoredVersion = { id: uid("v"), at: now, label, auto, rooms: model.rooms.length, area: area(model), doc: snapshot(model, notes, now) };
  const all = [v, ...readVersions(s, planId)];
  // keep the newest of each kind, up to its own limit
  let named = 0;
  let autos = 0;
  const kept = all.filter((x) => (x.auto ? ++autos <= MAX_AUTO_VERSIONS : ++named <= MAX_NAMED_VERSIONS));
  if (!writeJson(s, versionsKey(planId), kept)) return fail("Browser storage is full, so the version was not saved. Delete old plans or export this one.");
  if (!auto) logEvent(s, { at: now, kind: "version_saved", planId, planName: model.name, detail: label });
  const { doc: _doc, ...meta } = v;
  return { ok: true, value: meta };
}

/** Take an automatic checkpoint if the last one is old enough and the design has changed since. */
export function checkpoint(s: StorageLike | null, planId: string, model: PlanModel, notes: Note[], now = Date.now()): VersionMeta | null {
  if (model.walls.length + model.rooms.length + model.items.length === 0) return null;
  const last = readVersions(s, planId)[0];
  if (last && now - last.at < CHECKPOINT_MS) return null;
  if (last) {
    const prev = parseDocument(last.doc);
    if (prev.ok && JSON.stringify({ ...prev.doc.model, underlay: null }) === JSON.stringify({ ...model, underlay: null })) return null;
  }
  const r = saveVersion(s, planId, model, notes, { auto: true, label: "Checkpoint while editing", now });
  return r.ok ? r.value : null;
}

export function loadVersion(s: StorageLike | null, planId: string, versionId: string): Result<DesignDocument> {
  const v = readVersions(s, planId).find((x) => x.id === versionId);
  if (!v) return fail("That version is no longer stored.");
  const parsed = parseDocument(v.doc);
  return parsed.ok ? { ok: true, value: parsed.doc } : fail(`The version could not be read: ${parsed.message}`);
}

/**
 * Put a version back as the plan's current design. The current state is checkpointed first,
 * so the restore itself can be undone; the tracing image the plan has now is kept.
 */
export function restoreVersion(s: StorageLike | null, planId: string, versionId: string, now = Date.now()): Result<Plan> {
  if (!s) return fail("Browser storage is unavailable.");
  const cur = loadProject(s, planId);
  if (!cur.ok) return cur;
  const v = loadVersion(s, planId, versionId);
  if (!v.ok) return v;
  const meta = listVersions(s, planId).find((x) => x.id === versionId)!;
  saveVersion(s, planId, cur.value.model, cur.value.notes ?? [], { auto: true, label: `Before restoring “${meta.label}”`, now });
  const model = { ...v.value.model, name: cur.value.model.name, underlay: cur.value.model.underlay };
  const r = keepingCurrent(s, () => saveProject(s, planId, model, v.value.notes ?? [], now + 1));
  if (r.ok) logEvent(s, { at: now + 1, kind: "restored", planId, planName: model.name, detail: meta.label });
  return r;
}

/** Start a new plan from a version, leaving the original as it is. */
export function versionAsCopy(s: StorageLike | null, planId: string, versionId: string, now = Date.now()): Result<Plan> {
  if (!s) return fail("Browser storage is unavailable.");
  const v = loadVersion(s, planId, versionId);
  if (!v.ok) return v;
  const meta = listVersions(s, planId).find((x) => x.id === versionId)!;
  const name = `${v.value.model.name} (${meta.label})`.slice(0, 80);
  const id = newProjectId();
  const r = keepingCurrent(s, () => saveProject(s, id, { ...v.value.model, name }, v.value.notes ?? [], now, { createdAt: now, source: "restore" }));
  if (r.ok) logEvent(s, { at: now, kind: "created", planId: id, planName: name, detail: `From a version of “${v.value.model.name}”` });
  return r;
}

// ----------------------------------------------------------------------------------- profile

export function getProfile(s: StorageLike | null, now = Date.now()): Profile {
  const p = readJson<Partial<Profile>>(s, PROFILE_KEY, {});
  const first = Math.min(now, ...listProjects(s).map((x) => x.createdAt ?? x.updatedAt), ...listEvents(s).map((e) => e.at));
  return {
    name: typeof p.name === "string" ? p.name.slice(0, 60) : "",
    hue: typeof p.hue === "number" && p.hue >= 0 && p.hue < 360 ? Math.round(p.hue) : 228,
    role: typeof p.role === "string" ? p.role.slice(0, 40) : "",
    since: typeof p.since === "number" ? Math.min(p.since, first) : first,
  };
}

export function saveProfile(s: StorageLike | null, p: Profile): boolean {
  return writeJson(s, PROFILE_KEY, { name: p.name.trim().slice(0, 60), hue: p.hue, role: p.role.slice(0, 40), since: p.since });
}

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "G";

/** Roughly how much of this browser's storage Clavis uses, in bytes (UTF-16, as browsers count). */
export function storageUsed(s: (StorageLike & { length?: number; key?: (i: number) => string | null }) | null): number {
  if (!s || typeof s.length !== "number" || typeof s.key !== "function") return 0;
  let bytes = 0;
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith("clavis:")) bytes += (k.length + (s.getItem(k)?.length ?? 0)) * 2;
    }
  } catch {
    return bytes;
  }
  return bytes;
}
