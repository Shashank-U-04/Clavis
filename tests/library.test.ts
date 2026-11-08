import { describe, it, expect } from "vitest";
import { CURRENT_KEY, deleteProject, listProjects, loadProject, migrateLegacyAutosave, saveProject, currentProjectId } from "../src/model/library";
import { AUTOSAVE_KEY, saveToStorage, type StorageLike } from "../src/model/persistence";
import { templateModel } from "../src/model/templates";
import { emptyModel } from "../src/model/types";

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe("project library", () => {
  it("saves, lists newest first, loads and deletes", () => {
    const s = memory();
    expect(saveProject(s, "a", templateModel(), [], 1000).ok).toBe(true);
    expect(saveProject(s, "b", { ...emptyModel(), name: "Second" }, [], 2000).ok).toBe(true);
    expect(listProjects(s).map((p) => p.id)).toEqual(["b", "a"]);
    expect(listProjects(s)[1]).toMatchObject({ name: "Compact two-bedroom home", rooms: templateModel().rooms.length });
    const loaded = loadProject(s, "a");
    expect(loaded.ok && loaded.value.model.walls.length).toBe(templateModel().walls.length);
    expect(currentProjectId(s)).toBe("b");
    deleteProject(s, "b");
    expect(listProjects(s).map((p) => p.id)).toEqual(["a"]);
    expect(s.data.has(CURRENT_KEY)).toBe(false);
  });

  it("re-saving a project updates it in place", () => {
    const s = memory();
    saveProject(s, "a", templateModel(), [], 1000);
    saveProject(s, "a", { ...templateModel(), name: "Renamed" }, [], 3000);
    expect(listProjects(s)).toHaveLength(1);
    expect(listProjects(s)[0]).toMatchObject({ name: "Renamed", updatedAt: 3000 });
  });

  it("reports a full or missing store instead of throwing", () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    const r = saveProject(full, "a", templateModel(), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/full/);
    expect(saveProject(null, "a", templateModel(), []).ok).toBe(false);
    expect(loadProject(memory(), "nope").ok).toBe(false);
  });

  it("keeps an unreadable project and says so", () => {
    const s = memory();
    s.setItem("clavis:project:x", "{not json");
    const r = loadProject(s, "x");
    expect(r.ok).toBe(false);
    expect(s.data.has("clavis:project:x")).toBe(true);
  });

  it("migrates the pre-library autosave once", () => {
    const s = memory();
    saveToStorage(s, templateModel(), []);
    const id = migrateLegacyAutosave(s);
    expect(id).toBeTruthy();
    expect(s.data.has(AUTOSAVE_KEY)).toBe(false);
    expect(listProjects(s)[0].name).toBe("Compact two-bedroom home");
    expect(migrateLegacyAutosave(s)).toBeNull();
  });
});
