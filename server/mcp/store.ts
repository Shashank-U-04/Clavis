/**
 * A person's plans as the MCP tools see them, on top of the same cloud `Remote` the browser
 * syncs with. A save writes the plan, a version of what it was before (so any change an agent
 * makes can be restored from the plan's history), and a line in the activity history. The
 * browser's sync then brings the change into the app and the studio, as it would an edit
 * made on another device.
 *
 * The index entry, version and event are made by the same library code the browser uses,
 * run against a throwaway in-memory storage, so they have exactly the shape sync expects.
 */

import { INDEX_KEY, newProjectId, projectKey, saveProject, type PlanSource, type ProjectMeta } from "@/model/library";
import { parseDocument, type DesignDocument } from "@/model/document";
import type { StorageLike } from "@/model/persistence";
import type { Note, PlanModel } from "@/model/types";
import { ACTIVITY_KEY, listVersions, logEvent, saveVersion, versionsKey } from "@/lib/workspace/browser";
import type { ActivityEvent, ActivityKind } from "@/lib/workspace/types";
import type { Remote } from "@/lib/account/sync";

export interface PlanStore {
  /** live plans, newest first */
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<{ meta: ProjectMeta; doc: DesignDocument } | null>;
  /** save over an existing plan, keeping what it was as a version */
  update(meta: ProjectMeta, before: DesignDocument, model: PlanModel, notes: Note[], detail: string): Promise<ProjectMeta>;
  create(model: PlanModel, notes: Note[], source: PlanSource, detail: string): Promise<ProjectMeta>;
}

function scratch(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const events = (s: StorageLike): ActivityEvent[] => JSON.parse(s.getItem(ACTIVITY_KEY) ?? "[]");

export function remoteStore(remote: Remote, now: () => number = Date.now): PlanStore {
  const event = (s: StorageLike, kind: ActivityKind, meta: ProjectMeta, detail: string, at: number) =>
    logEvent(s, { at, kind, planId: meta.id, planName: meta.name, detail });

  return {
    async list() {
      return (await remote.plans())
        .filter((p) => !p.deleted)
        .map((p) => p.meta)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async load(id) {
      const meta = (await remote.plans()).find((p) => p.id === id && !p.deleted)?.meta;
      if (!meta) return null;
      const text = (await remote.planDocs([id]))[id];
      if (!text) return null;
      const parsed = parseDocument(text);
      return parsed.ok ? { meta, doc: parsed.doc } : null;
    },

    async update(meta, before, model, notes, detail) {
      const at = now();
      const s = scratch();
      s.setItem(INDEX_KEY, JSON.stringify([meta]));
      const version = saveVersion(s, meta.id, before.model, before.notes ?? [], { label: "Before an agent's change", now: at });
      if (!version.ok) throw new Error(version.message);
      const saved = saveProject(s, meta.id, model, notes, at);
      if (!saved.ok) throw new Error(saved.message);
      event(s, "edited", saved.value, detail, at);
      const versionDoc = (JSON.parse(s.getItem(versionsKey(meta.id)) ?? "[]") as { id: string; doc: string }[]).find((v) => v.id === version.value.id)!.doc;
      // the version first: if the plan's write then fails, nothing is lost
      await remote.putVersions([{ planId: meta.id, meta: listVersions(s, meta.id)[0], doc: versionDoc }]);
      await remote.putPlans([{ id: meta.id, meta: saved.value, doc: s.getItem(projectKey(meta.id))! }]);
      await remote.putEvents(events(s));
      return saved.value;
    },

    async create(model, notes, source, detail) {
      const at = now();
      const s = scratch();
      const id = newProjectId();
      const saved = saveProject(s, id, model, notes, at, { createdAt: at, source });
      if (!saved.ok) throw new Error(saved.message);
      event(s, "created", saved.value, detail, at);
      await remote.putPlans([{ id, meta: saved.value, doc: s.getItem(projectKey(id))! }]);
      await remote.putEvents(events(s));
      return saved.value;
    },
  };
}
