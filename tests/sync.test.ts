import { describe, it, expect } from "vitest";
import { syncWorkspace, stable, withoutUnderlay, type Remote, type RemoteProfile } from "../src/lib/account/sync";
import { listProjects, loadProject, saveProject } from "../src/model/library";
import { deletePlan, getProfile, listEvents, listVersions, logEvent, recordEdit, saveProfile, saveVersion, starPlan } from "../src/lib/workspace/browser";
import { emptyModel, type PlanModel } from "../src/model/types";
import type { ActivityEvent, VersionMeta } from "../src/lib/workspace/types";
import type { ProjectMeta } from "../src/model/library";
import { memoryStorage } from "./helpers/memoryStorage";

/** An in-memory cloud with the same behaviour as the Supabase tables (JSON columns reorder keys). */
function memoryCloud() {
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

const room: PlanModel["rooms"][number] = { id: "r1", x: 0, y: 0, w: 4, h: 5, label: "Living", floor: "oak" };
const plan = (name: string, rooms = 1): PlanModel => ({ ...emptyModel(), name, rooms: Array.from({ length: rooms }, (_, i) => ({ ...room, id: `r${i}` })) });

describe("cloud sync", () => {
  it("sends a first browser's plans, versions, history and profile, and a second browser receives them", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    saveProject(a, "p1", plan("Loft"), [], 1000);
    saveVersion(a, "p1", plan("Loft"), [], { label: "First idea", now: 1100 });
    logEvent(a, { at: 1200, kind: "created", planId: "p1", planName: "Loft" });
    saveProfile(a, { name: "Asha", hue: 40, role: "own home", since: 900 });

    const first = await syncWorkspace(a, cloud.remote);
    expect(first.sent).toBeGreaterThanOrEqual(4);
    expect(cloud.plans.get("p1")?.meta.name).toBe("Loft");
    expect(cloud.profile?.name).toBe("Asha");

    const b = memoryStorage();
    const got = await syncWorkspace(b, cloud.remote);
    expect(got.changedLocally).toBe(true);
    expect(listProjects(b).map((p) => p.name)).toEqual(["Loft"]);
    expect(loadProject(b, "p1").ok).toBe(true);
    expect(listVersions(b, "p1").map((v) => v.label)).toEqual(["First idea"]);
    expect(listEvents(b).map((e) => e.kind)).toContain("created");
    expect(getProfile(b).name).toBe("Asha");

    // nothing changed: a second round sends and receives nothing
    const again = await syncWorkspace(b, cloud.remote);
    expect(again).toMatchObject({ sent: 0, received: 0, deleted: 0, changedLocally: false });
  });

  it("brings an edit made elsewhere, and keeps this browser's tracing image", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    const traced = { ...plan("Loft"), underlay: { dataUrl: "data:image/png;base64,AAAA", x: 0, y: 0, w: 10, h: 10, opacity: 0.5 } } as PlanModel;
    saveProject(a, "p1", traced, [], 1000);
    await syncWorkspace(a, cloud.remote);
    expect(cloud.plans.get("p1")!.doc).not.toContain("data:image");

    const b = memoryStorage();
    await syncWorkspace(b, cloud.remote);
    saveProject(b, "p1", plan("Loft", 3), [], 2000);
    await syncWorkspace(b, cloud.remote);

    await syncWorkspace(a, cloud.remote);
    const doc = loadProject(a, "p1");
    expect(doc.ok && doc.value.model.rooms.length).toBe(3);
    expect(doc.ok && doc.value.model.underlay).toBeTruthy();
  });

  it("sends only the index entry when a plan is starred, not the whole design", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    saveProject(a, "p1", plan("Loft"), [], 1000);
    await syncWorkspace(a, cloud.remote);
    starPlan(a, "p1", true, 1500);
    await syncWorkspace(a, cloud.remote);
    expect(cloud.calls.at(-1)).toBe("putPlans:p1");
    expect(cloud.plans.get("p1")!.meta.starred).toBe(true);
  });

  it("a plan deleted in one browser disappears from the other, versions and all", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    saveProject(a, "p1", plan("Loft"), [], 1000);
    saveVersion(a, "p1", plan("Loft"), [], { now: 1100 });
    await syncWorkspace(a, cloud.remote);
    const b = memoryStorage();
    await syncWorkspace(b, cloud.remote);

    deletePlan(a, "p1", 3000);
    await syncWorkspace(a, cloud.remote);
    expect(cloud.plans.get("p1")!.deleted).toBe(true);
    expect(cloud.versions.size).toBe(0);

    const out = await syncWorkspace(b, cloud.remote);
    expect(out.deleted).toBe(1);
    expect(listProjects(b)).toEqual([]);
    expect(listVersions(b, "p1")).toEqual([]);
  });

  it("when both browsers changed a plan, the newer edit wins on both", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    saveProject(a, "p1", plan("Loft"), [], 1000);
    await syncWorkspace(a, cloud.remote);
    const b = memoryStorage();
    await syncWorkspace(b, cloud.remote);

    saveProject(a, "p1", plan("Loft A", 2), [], 2000);
    saveProject(b, "p1", plan("Loft B", 4), [], 3000);
    await syncWorkspace(a, cloud.remote); // A's edit reaches the cloud first
    await syncWorkspace(b, cloud.remote); // B's is newer: it wins
    await syncWorkspace(a, cloud.remote);
    expect(listProjects(a)[0].name).toBe("Loft B");
    expect(cloud.plans.get("p1")!.meta.name).toBe("Loft B");
  });

  it("a folded 'edited' event that moved on is sent again", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    recordEdit(a, "p1", "Loft", 1000);
    await syncWorkspace(a, cloud.remote);
    recordEdit(a, "p1", "Loft", 2000); // folds into the same event, later
    await syncWorkspace(a, cloud.remote);
    const [e] = [...cloud.events.values()];
    expect(e).toMatchObject({ at: 2000, count: 2 });
  });

  it("a version pruned here is removed from the cloud", async () => {
    const cloud = memoryCloud();
    const a = memoryStorage();
    saveProject(a, "p1", plan("Loft"), [], 1000);
    for (let i = 0; i < 12; i++) saveVersion(a, "p1", plan("Loft"), [], { auto: true, now: 2000 + i });
    await syncWorkspace(a, cloud.remote);
    expect(cloud.versions.size).toBe(10); // the local cap already applied
    saveVersion(a, "p1", plan("Loft"), [], { auto: true, now: 5000 }); // pushes the oldest out
    await syncWorkspace(a, cloud.remote);
    expect(cloud.versions.size).toBe(10);
    expect([...cloud.versions.values()].some((v) => v.meta.at === 5000)).toBe(true);
  });

  it("stable JSON ignores key order and undefined fields; the cloud copy drops the tracing image", () => {
    expect(stable({ b: 1, a: { d: 2, c: undefined } })).toBe(stable({ a: { d: 2 }, b: 1 }));
    expect(JSON.parse(withoutUnderlay(JSON.stringify({ model: { underlay: { src: "x" }, rooms: [] } }))).model.underlay).toBeNull();
    expect(withoutUnderlay("not json")).toBe("not json");
  });
});
