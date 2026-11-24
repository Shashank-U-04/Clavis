import { stable, type Remote, type RemoteProfile } from "../../src/lib/account/sync";
import type { ActivityEvent, VersionMeta } from "../../src/lib/workspace/types";
import type { ProjectMeta } from "../../src/model/library";

/** An in-memory cloud with the same behaviour as the Supabase tables (JSON columns reorder keys). */
export function memoryCloud() {
  const reorder = <T>(v: T): T => JSON.parse(stable(v));
  const plans = new Map<string, { meta: ProjectMeta; doc: string; deleted: boolean }>();
  const versions = new Map<string, { planId: string; meta: VersionMeta; doc: string }>();
  const events = new Map<string, ActivityEvent>();
  let profile: RemoteProfile | null = null;
  const calls: string[] = [];
  const remote: Remote = {
    plans: async () => [...plans].map(([id, p]) => ({ id, meta: reorder(p.meta), deleted: p.deleted })),
    planDocs: async (ids) => Object.fromEntries(ids.filter((id) => plans.has(id)).map((id) => [id, plans.get(id)!.doc])),
    putPlans: async (rows) => {
      calls.push(`putPlans:${rows.map((r) => `${r.id}${r.doc ? "+doc" : ""}`).join(",")}`);
      for (const r of rows) {
        const prev = plans.get(r.id);
        plans.set(r.id, { meta: r.meta, doc: r.doc ?? prev?.doc ?? "{}", deleted: false });
      }
    },
    deletePlans: async (ids) => {
      for (const id of ids) {
        const p = plans.get(id);
        if (p) plans.set(id, { ...p, deleted: true, doc: "{}" });
        for (const [k, v] of versions) if (v.planId === id) versions.delete(k);
      }
    },
    versions: async () => [...versions.values()].map((v) => ({ planId: v.planId, meta: reorder(v.meta) })),
    versionDocs: async (planId, ids) => Object.fromEntries(ids.map((id) => [id, versions.get(`${planId}/${id}`)?.doc]).filter(([, d]) => d)),
    putVersions: async (rows) => rows.forEach((r) => versions.set(`${r.planId}/${r.meta.id}`, r)),
    deleteVersions: async (planId, ids) => ids.forEach((id) => versions.delete(`${planId}/${id}`)),
    events: async (limit) => [...events.values()].sort((a, b) => b.at - a.at).slice(0, limit),
    putEvents: async (es) => es.forEach((e) => events.set(e.id, e)),
    profile: async () => profile,
    putProfile: async (p) => void (profile = p),
  };
  return { remote, plans, versions, events, calls, get profile() { return profile; } };
}
