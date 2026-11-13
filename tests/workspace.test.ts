import { describe, it, expect } from "vitest";
import {
  CHECKPOINT_MS,
  FOLD_MS,
  MAX_AUTO_VERSIONS,
  MAX_EVENTS,
  checkpoint,
  createPlan,
  deletePlan,
  duplicatePlan,
  getPlan,
  getProfile,
  initials,
  lastPlan,
  listEvents,
  listPlans,
  listVersions,
  loadVersion,
  logEvent,
  markOpened,
  recordEdit,
  renamePlan,
  restoreVersion,
  saveProfile,
  saveVersion,
  starPlan,
  storageUsed,
  versionAsCopy,
  versionsKey,
} from "../src/lib/workspace/browser";
import { currentProjectId, loadProject, saveProject } from "../src/model/library";
import type { StorageLike } from "../src/model/persistence";
import { templateModel } from "../src/model/templates";
import { emptyModel } from "../src/model/types";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
};

const made = (s: StorageLike, now = 1000, name = "Compact two-bedroom home") => {
  const r = createPlan(s, { ...templateModel(), name }, [], "template:compact-two-bedroom", now);
  if (!r.ok) throw new Error(r.message);
  return r.value;
};

describe("plans", () => {
  it("creating records the source and dates, makes it current and logs it", () => {
    const s = memory();
    const p = made(s);
    expect(p).toMatchObject({ createdAt: 1000, openedAt: 1000, source: "template:compact-two-bedroom" });
    expect(currentProjectId(s)).toBe(p.id);
    expect(listEvents(s)[0]).toMatchObject({ kind: "created", planId: p.id, detail: "From a template" });
  });

  it("index fields survive the studio's ordinary saves", () => {
    const s = memory();
    const p = made(s);
    starPlan(s, p.id, true, 1500);
    saveProject(s, p.id, { ...templateModel(), name: "Edited" }, [], 2000);
    expect(getPlan(s, p.id)).toMatchObject({ name: "Edited", createdAt: 1000, openedAt: 1000, starred: true, source: "template:compact-two-bedroom", updatedAt: 2000 });
  });

  it("renames, duplicates and deletes without moving the current plan", () => {
    const s = memory();
    const a = made(s, 1000, "A");
    const b = made(s, 2000, "B");
    expect(renamePlan(s, a.id, "  Lake house ", 3000).ok).toBe(true);
    expect(getPlan(s, a.id)?.name).toBe("Lake house");
    expect(listEvents(s)[0]).toMatchObject({ kind: "renamed", detail: "Was “A”" });
    expect(renamePlan(s, a.id, "   ").ok).toBe(false);

    const c = duplicatePlan(s, a.id, 4000);
    expect(c.ok && c.value).toMatchObject({ name: "Lake house (copy)", source: "duplicate", createdAt: 4000 });
    expect(currentProjectId(s)).toBe(b.id);

    deletePlan(s, a.id, 5000);
    expect(getPlan(s, a.id)).toBeNull();
    expect(listEvents(s)[0]).toMatchObject({ kind: "deleted", planName: "Lake house" });
    expect(listPlans(s)).toHaveLength(2);
  });

  it("the last plan is the current one, or else the last opened", () => {
    const s = memory();
    const a = made(s, 1000, "A");
    const b = made(s, 2000, "B");
    expect(lastPlan(s)?.id).toBe(b.id);
    deletePlan(s, b.id);
    markOpened(s, a.id, 9000);
    expect(lastPlan(s)?.id).toBe(a.id);
  });
});

describe("activity", () => {
  it("folds saves of the same plan close together into one edit", () => {
    const s = memory();
    const p = made(s);
    recordEdit(s, p.id, p.name, 2000);
    recordEdit(s, p.id, p.name, 3000);
    recordEdit(s, p.id, p.name, 3000 + FOLD_MS + 1);
    const edits = listEvents(s).filter((e) => e.kind === "edited");
    expect(edits.map((e) => e.count)).toEqual([1, 2]);
  });

  it("opening the same plan twice in a row is one visit", () => {
    const s = memory();
    const p = made(s, 1000);
    markOpened(s, p.id, 1000 + FOLD_MS + 1);
    markOpened(s, p.id, 1000 + FOLD_MS + 2);
    expect(listEvents(s).filter((e) => e.kind === "opened")).toHaveLength(1);
    expect(getPlan(s, p.id)?.openedAt).toBe(1000 + FOLD_MS + 2);
  });

  it("keeps only the newest events and filters by plan", () => {
    const s = memory();
    for (let i = 0; i < MAX_EVENTS + 20; i++) logEvent(s, { at: i, kind: "opened", planId: i % 2 ? "odd" : "even", planName: "x" });
    expect(listEvents(s)).toHaveLength(MAX_EVENTS);
    expect(listEvents(s)[0].at).toBe(MAX_EVENTS + 19);
    expect(listEvents(s, { planId: "odd", limit: 3 }).every((e) => e.planId === "odd")).toBe(true);
  });

  it("reads a damaged log as empty instead of throwing", () => {
    const s = memory();
    s.setItem("clavis:activity", "{not json");
    expect(listEvents(s)).toEqual([]);
    expect(listEvents(null)).toEqual([]);
  });
});

describe("versions", () => {
  it("saves named versions and leaves the tracing image out", () => {
    const s = memory();
    const p = made(s);
    const m = { ...templateModel(), underlay: { dataUrl: "data:image/png;base64,AAAA", opacity: 0.5, x: 0, y: 0, w: 10, h: 8 } };
    const v = saveVersion(s, p.id, m, [], { label: "Before the study", now: 2000 });
    expect(v.ok && v.value).toMatchObject({ label: "Before the study", auto: false, rooms: m.rooms.length });
    const back = loadVersion(s, p.id, v.ok ? v.value.id : "");
    expect(back.ok && back.value.model.underlay).toBeNull();
    expect(listEvents(s)[0]).toMatchObject({ kind: "version_saved", detail: "Before the study" });
  });

  it("checkpoints only when enough time has passed and the design changed", () => {
    const s = memory();
    const p = made(s);
    const m = templateModel();
    expect(checkpoint(s, p.id, emptyModel(), [], 0)).toBeNull();
    expect(checkpoint(s, p.id, m, [], 1000)).not.toBeNull();
    expect(checkpoint(s, p.id, { ...m, name: "Changed" }, [], 1000 + CHECKPOINT_MS - 1)).toBeNull();
    expect(checkpoint(s, p.id, m, [], 1000 + CHECKPOINT_MS)).toBeNull(); // unchanged
    expect(checkpoint(s, p.id, { ...m, name: "Changed" }, [], 1000 + CHECKPOINT_MS)).not.toBeNull();
    expect(listVersions(s, p.id).every((v) => v.auto)).toBe(true);
    // checkpoints are not history events
    expect(listEvents(s).some((e) => e.kind === "version_saved")).toBe(false);
  });

  it("keeps a bounded number of checkpoints without dropping named versions", () => {
    const s = memory();
    const p = made(s);
    saveVersion(s, p.id, templateModel(), [], { label: "Keep me", now: 1 });
    for (let i = 0; i < MAX_AUTO_VERSIONS + 5; i++) saveVersion(s, p.id, templateModel(), [], { auto: true, now: 10 + i });
    const list = listVersions(s, p.id);
    expect(list.filter((v) => v.auto)).toHaveLength(MAX_AUTO_VERSIONS);
    expect(list.some((v) => v.label === "Keep me")).toBe(true);
  });

  it("restores a version, keeping the name and checkpointing what was there", () => {
    const s = memory();
    const p = made(s, 1000, "Home");
    const v = saveVersion(s, p.id, { ...templateModel(), name: "Home" }, [], { label: "Original", now: 2000 });
    saveProject(s, p.id, { ...emptyModel(), name: "Home", walls: [] }, [], 3000);
    const r = restoreVersion(s, p.id, v.ok ? v.value.id : "", 4000);
    expect(r.ok).toBe(true);
    const doc = loadProject(s, p.id);
    expect(doc.ok && doc.value.model.walls.length).toBe(templateModel().walls.length);
    expect(listVersions(s, p.id)[0]).toMatchObject({ auto: true, label: "Before restoring “Original”" });
    expect(listEvents(s)[0]).toMatchObject({ kind: "restored", detail: "Original" });
  });

  it("opens a version as a new plan and forgets versions with their plan", () => {
    const s = memory();
    const p = made(s, 1000, "Home");
    const v = saveVersion(s, p.id, templateModel(), [], { label: "Draft 1", now: 2000 });
    const c = versionAsCopy(s, p.id, v.ok ? v.value.id : "", 3000);
    expect(c.ok && c.value).toMatchObject({ source: "restore" });
    expect(c.ok && c.value.name).toContain("Draft 1");
    deletePlan(s, p.id);
    expect(s.data.has(versionsKey(p.id))).toBe(false);
  });
});

describe("profile", () => {
  it("defaults sensibly, saves, and dates itself from the oldest work", () => {
    const s = memory();
    made(s, 500);
    expect(getProfile(s, 9000)).toMatchObject({ name: "", role: "", since: 500 });
    expect(saveProfile(s, { name: "  Ada Lovelace ", hue: 30, role: "My own home", since: 500 })).toBe(true);
    expect(getProfile(s)).toMatchObject({ name: "Ada Lovelace", hue: 30 });
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("   ")).toBe("G");
  });

  it("counts the storage Clavis uses", () => {
    const s = memory();
    s.setItem("other", "x".repeat(100));
    made(s);
    expect(storageUsed(s)).toBeGreaterThan(1000);
    expect(storageUsed(s)).toBe([...s.data].filter(([k]) => k.startsWith("clavis:")).reduce((t, [k, v]) => t + (k.length + v.length) * 2, 0));
  });
});
