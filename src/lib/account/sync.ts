/**
 * Cloud sync for a signed-in person's workspace: plans, their saved versions, the activity
 * history and the profile. The browser stays the working copy (everything in the app keeps
 * reading and writing local storage); this module brings it and the cloud into step.
 *
 * It is a three-way merge. `clavis:sync` remembers what both sides last agreed on (the base),
 * so for each item it can tell who changed it since:
 *   only this browser changed it  -> send it up
 *   only the cloud changed it     -> bring it down
 *   both changed it               -> the newer edit wins
 *   one side deleted it           -> delete it on the other, unless the other changed it since
 *
 * Tracing images stay on the device they were added on (they can run to megabytes); a plan
 * brought down from the cloud keeps the image this browser already has.
 *
 * Pure apart from the `Remote` it is given, so the tests run it against an in-memory cloud.
 */

import { INDEX_KEY, listProjects, projectKey, CURRENT_KEY, type ProjectMeta } from "@/model/library";
import type { StorageLike } from "@/model/persistence";
import { ACTIVITY_KEY, MAX_EVENTS, PROFILE_KEY, versionsKey } from "@/lib/workspace/browser";
import type { ActivityEvent, Profile, VersionMeta } from "@/lib/workspace/types";

export const SYNC_KEY = "clavis:sync";

export interface RemotePlan {
  id: string;
  meta: ProjectMeta;
  deleted: boolean;
}
export interface RemoteVersion {
  planId: string;
  meta: VersionMeta;
}
export type RemoteProfile = Pick<Profile, "name" | "hue" | "role"> & { since?: number };

/** What the cloud can do. Documents travel as JSON text, exactly as stored locally. */
export interface Remote {
  plans(): Promise<RemotePlan[]>;
  planDocs(ids: string[]): Promise<Record<string, string>>;
  /** doc omitted: only the index entry changed (starred, renamed, opened) */
  putPlans(rows: { id: string; meta: ProjectMeta; doc?: string }[]): Promise<void>;
  deletePlans(ids: string[]): Promise<void>;
  versions(): Promise<RemoteVersion[]>;
  versionDocs(planId: string, ids: string[]): Promise<Record<string, string>>;
  putVersions(rows: { planId: string; meta: VersionMeta; doc: string }[]): Promise<void>;
  deleteVersions(planId: string, ids: string[]): Promise<void>;
  events(limit: number): Promise<ActivityEvent[]>;
  putEvents(events: ActivityEvent[]): Promise<void>;
  profile(): Promise<RemoteProfile | null>;
  putProfile(p: RemoteProfile): Promise<void>;
}

interface Base {
  /** plan id -> fingerprint of the index entry both sides last agreed on */
  plans: Record<string, string>;
  /** plan id -> version ids both sides had */
  versions: Record<string, string[]>;
  /** event id -> its time when both sides last had it (folded "edited" events move) */
  events: Record<string, number>;
  profile?: string;
}

export interface SyncSummary {
  sent: number;
  received: number;
  deleted: number;
  /** something in this browser changed: readers should look again */
  changedLocally: boolean;
}

// ------------------------------------------------------------------------------- helpers

/** JSON with sorted keys: the cloud's JSON columns do not keep key order. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

const fingerprint = (m: ProjectMeta) => stable(m);
const profilePrint = (p: RemoteProfile) => stable({ name: p.name, hue: p.hue, role: p.role });

function readJson<T>(s: StorageLike, key: string, fallback: T): T {
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readBase(s: StorageLike): Base {
  const b = readJson<Partial<Base>>(s, SYNC_KEY, {});
  return { plans: b.plans ?? {}, versions: b.versions ?? {}, events: b.events ?? {}, profile: b.profile };
}

/** The document without its tracing image, for the cloud. */
export function withoutUnderlay(text: string): string {
  try {
    const doc = JSON.parse(text) as { model?: { underlay?: unknown } };
    if (doc.model && doc.model.underlay) doc.model.underlay = null;
    return JSON.stringify(doc);
  } catch {
    return text;
  }
}

/** A document from the cloud, keeping the tracing image this browser already has for it. */
function keepUnderlay(incoming: string, local: string | null): string {
  if (!local) return incoming;
  try {
    const mine = JSON.parse(local) as { model?: { underlay?: unknown } };
    if (!mine.model?.underlay) return incoming;
    const doc = JSON.parse(incoming) as { model?: { underlay?: unknown } };
    if (doc.model && !doc.model.underlay) doc.model.underlay = mine.model.underlay;
    return JSON.stringify(doc);
  } catch {
    return incoming;
  }
}

function writeIndex(s: StorageLike, list: ProjectMeta[]) {
  s.setItem(INDEX_KEY, JSON.stringify([...list].sort((a, b) => b.updatedAt - a.updatedAt)));
}

interface StoredVersion extends VersionMeta {
  doc: string;
}

// ---------------------------------------------------------------------------------- sync

export async function syncWorkspace(s: StorageLike, remote: Remote): Promise<SyncSummary> {
  const out: SyncSummary = { sent: 0, received: 0, deleted: 0, changedLocally: false };
  const base = readBase(s);
  const saveBase = () => s.setItem(SYNC_KEY, JSON.stringify(base));

  // ------------------------------------------------------------------------------ plans
  const remotePlans = new Map((await remote.plans()).map((r) => [r.id, r]));
  const index = listProjects(s);
  const local = new Map(index.map((p) => [p.id, p]));
  const ids = new Set([...local.keys(), ...remotePlans.keys(), ...Object.keys(base.plans)]);

  const pull: { id: string; meta: ProjectMeta; needDoc: boolean }[] = [];
  const push: { id: string; withDoc: boolean }[] = [];
  const deleteHere: string[] = [];
  const deleteThere: string[] = [];

  for (const id of ids) {
    const L = local.get(id);
    const R = remotePlans.get(id);
    const B = base.plans[id];
    const live = R && !R.deleted ? R : undefined;
    const lp = L && fingerprint(L);
    const rp = live && fingerprint(live.meta);

    if (L && live) {
      if (lp === rp) base.plans[id] = lp!;
      else {
        const remoteChanged = rp !== B;
        const localChanged = lp !== B;
        const takeRemote = remoteChanged && (!localChanged || live.meta.updatedAt > L.updatedAt);
        if (takeRemote) pull.push({ id, meta: live.meta, needDoc: live.meta.updatedAt !== L.updatedAt });
        else push.push({ id, withDoc: L.updatedAt !== live.meta.updatedAt });
      }
    } else if (L) {
      // gone from the cloud (deleted elsewhere), or never sent
      if (B !== undefined && lp === B) deleteHere.push(id);
      else push.push({ id, withDoc: true });
    } else if (live) {
      // deleted here, or new from elsewhere
      if (B !== undefined && rp === B) deleteThere.push(id);
      else pull.push({ id, meta: live.meta, needDoc: true });
    } else delete base.plans[id];
  }

  if (pull.length) {
    const docs = await remote.planDocs(pull.filter((p) => p.needDoc).map((p) => p.id));
    const list = listProjects(s);
    for (const p of pull) {
      if (p.needDoc) {
        const doc = docs[p.id];
        if (!doc) continue;
        s.setItem(projectKey(p.id), keepUnderlay(doc, s.getItem(projectKey(p.id))));
      }
      const at = list.findIndex((x) => x.id === p.id);
      if (at >= 0) list[at] = p.meta;
      else list.push(p.meta);
      base.plans[p.id] = fingerprint(p.meta);
      out.received++;
    }
    writeIndex(s, list);
    out.changedLocally = true;
  }

  if (push.length) {
    const rows = push.map(({ id, withDoc }) => {
      const meta = local.get(id)!;
      const text = withDoc ? s.getItem(projectKey(id)) : null;
      return { id, meta, ...(text ? { doc: withoutUnderlay(text) } : {}) };
    });
    // a plan whose document is missing locally cannot be sent whole; skip it rather than blank it
    const sendable = rows.filter((r, i) => !push[i].withDoc || r.doc !== undefined);
    await remote.putPlans(sendable);
    for (const r of sendable) base.plans[r.id] = fingerprint(r.meta);
    out.sent += sendable.length;
  }

  if (deleteThere.length) {
    await remote.deletePlans(deleteThere);
    for (const id of deleteThere) {
      delete base.plans[id];
      delete base.versions[id];
    }
    out.deleted += deleteThere.length;
  }

  if (deleteHere.length) {
    const keep = listProjects(s).filter((p) => !deleteHere.includes(p.id));
    for (const id of deleteHere) {
      s.removeItem(projectKey(id));
      s.removeItem(versionsKey(id));
      if (s.getItem(CURRENT_KEY) === id) s.removeItem(CURRENT_KEY);
      delete base.plans[id];
      delete base.versions[id];
    }
    writeIndex(s, keep);
    out.deleted += deleteHere.length;
    out.changedLocally = true;
  }
  saveBase();

  // --------------------------------------------------------------------------- versions
  const plansNow = new Set(listProjects(s).map((p) => p.id));
  const remoteVersions = new Map<string, Map<string, VersionMeta>>();
  for (const v of await remote.versions()) {
    if (!remoteVersions.has(v.planId)) remoteVersions.set(v.planId, new Map());
    remoteVersions.get(v.planId)!.set(v.meta.id, v.meta);
  }
  for (const planId of new Set([...plansNow, ...remoteVersions.keys()])) {
    if (!plansNow.has(planId)) continue; // the plan itself is gone; its versions went with it
    const mine = readJson<StoredVersion[]>(s, versionsKey(planId), []).filter((v) => v && typeof v.id === "string" && typeof v.doc === "string");
    const theirs = remoteVersions.get(planId) ?? new Map<string, VersionMeta>();
    const agreed = new Set(base.versions[planId] ?? []);
    const mineIds = new Set(mine.map((v) => v.id));

    const send = mine.filter((v) => !theirs.has(v.id) && !agreed.has(v.id));
    const fetch = [...theirs.keys()].filter((id) => !mineIds.has(id) && !agreed.has(id));
    const dropThere = [...agreed].filter((id) => theirs.has(id) && !mineIds.has(id));
    const dropHere = [...agreed].filter((id) => mineIds.has(id) && !theirs.has(id));

    if (send.length) {
      await remote.putVersions(send.map(({ doc, ...meta }) => ({ planId, meta, doc })));
      out.sent += send.length;
    }
    if (dropThere.length) await remote.deleteVersions(planId, dropThere);

    let next = mine.filter((v) => !dropHere.includes(v.id));
    if (fetch.length) {
      const docs = await remote.versionDocs(planId, fetch);
      for (const id of fetch) if (docs[id]) next.push({ ...theirs.get(id)!, doc: docs[id] });
      out.received += fetch.filter((id) => docs[id]).length;
    }
    if (fetch.length || dropHere.length) {
      next = next.sort((a, b) => b.at - a.at);
      s.setItem(versionsKey(planId), JSON.stringify(next));
      out.changedLocally = true;
    }
    // agreed from now on: what this browser keeps that the cloud also has (including what was just sent)
    const sent = new Set(send.map((v) => v.id));
    base.versions[planId] = next.map((v) => v.id).filter((id) => theirs.has(id) || sent.has(id));
  }
  for (const planId of Object.keys(base.versions)) if (!plansNow.has(planId)) delete base.versions[planId];
  saveBase();

  // ----------------------------------------------------------------------------- activity
  const mineEvents = readJson<ActivityEvent[]>(s, ACTIVITY_KEY, []).filter((e) => e && typeof e.id === "string" && typeof e.at === "number");
  const theirEvents = await remote.events(MAX_EVENTS);
  const theirsById = new Map(theirEvents.map((e) => [e.id, e]));
  const sendEvents = mineEvents.filter((e) => base.events[e.id] !== e.at && (theirsById.get(e.id)?.at ?? -1) < e.at);
  if (sendEvents.length) {
    await remote.putEvents(sendEvents);
    out.sent += sendEvents.length;
  }
  const merged = new Map(mineEvents.map((e) => [e.id, e]));
  let pulledEvents = 0;
  for (const e of theirEvents) {
    const m = merged.get(e.id);
    if (!m || e.at > m.at) {
      merged.set(e.id, e);
      pulledEvents++;
    }
  }
  const events = [...merged.values()].sort((a, b) => b.at - a.at).slice(0, MAX_EVENTS);
  if (pulledEvents) {
    s.setItem(ACTIVITY_KEY, JSON.stringify(events));
    out.received += pulledEvents;
    out.changedLocally = true;
  }
  base.events = Object.fromEntries(events.map((e) => [e.id, e.at]));
  saveBase();

  // ------------------------------------------------------------------------------ profile
  const mineProfile = readJson<Partial<Profile> | null>(s, PROFILE_KEY, null);
  const theirProfile = await remote.profile();
  const lp = mineProfile && typeof mineProfile.name === "string" ? profilePrint(mineProfile as RemoteProfile) : undefined;
  const rp = theirProfile ? profilePrint(theirProfile) : undefined;
  if (lp !== rp) {
    const takeRemote = rp !== undefined && (lp === undefined || lp === base.profile);
    if (takeRemote && theirProfile) {
      s.setItem(PROFILE_KEY, JSON.stringify({ ...mineProfile, name: theirProfile.name, hue: theirProfile.hue, role: theirProfile.role, since: mineProfile?.since ?? theirProfile.since }));
      base.profile = rp;
      out.received++;
      out.changedLocally = true;
    } else if (lp !== undefined && mineProfile) {
      await remote.putProfile({ name: String(mineProfile.name), hue: Number(mineProfile.hue ?? 228), role: String(mineProfile.role ?? "") });
      base.profile = lp;
      out.sent++;
    }
  } else base.profile = lp;
  saveBase();

  return out;
}
