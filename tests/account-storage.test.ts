import { describe, it, expect } from "vitest";
import { ScopedStorage, clearScope, readAccount, writeAccount } from "../src/model/account";
import { listProjects, saveProject } from "../src/model/library";
import { emptyModel } from "../src/model/types";

/** a Storage-shaped map, enumerable like localStorage */
export function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
}

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("whose workspace", () => {
  it("keeps a guest's plans and each account's plans apart", () => {
    const base = memoryStorage();
    saveProject(base, "g1", { ...emptyModel(), name: "Guest plan" }, []);
    const a = new ScopedStorage(base, A);
    saveProject(a, "a1", { ...emptyModel(), name: "A plan" }, []);
    const b = new ScopedStorage(base, B);

    expect(listProjects(base).map((p) => p.name)).toEqual(["Guest plan"]);
    expect(listProjects(a).map((p) => p.name)).toEqual(["A plan"]);
    expect(listProjects(b)).toEqual([]);
    expect(base.data.has(`clavis:u:${A}:projects`)).toBe(true);
  });

  it("lists only its own keys, by their plain names, and leaves other keys alone", () => {
    const base = memoryStorage();
    base.setItem("clavis:projects", "[]");
    base.setItem("other-app", "x");
    const a = new ScopedStorage(base, A);
    a.setItem("clavis:profile", "{}");
    a.setItem("not-clavis", "y");
    expect(a.keys()).toEqual(["clavis:profile"]);
    expect(a.length).toBe(1);
    expect(a.key(0)).toBe("clavis:profile");
    expect(base.getItem("not-clavis")).toBe("y");
  });

  it("clears one account's local copy without touching the guest's or another account's", () => {
    const base = memoryStorage();
    base.setItem("clavis:projects", "guest");
    new ScopedStorage(base, A).setItem("clavis:projects", "a");
    new ScopedStorage(base, B).setItem("clavis:projects", "b");
    clearScope(base, A);
    expect(base.getItem("clavis:projects")).toBe("guest");
    expect(new ScopedStorage(base, A).getItem("clavis:projects")).toBeNull();
    expect(new ScopedStorage(base, B).getItem("clavis:projects")).toBe("b");
  });

  it("remembers only a well-formed account", () => {
    const base = memoryStorage();
    writeAccount(base, { id: A, email: "a@example.com" });
    expect(readAccount(base)).toEqual({ id: A, email: "a@example.com", name: undefined });
    base.setItem("clavis:account", JSON.stringify({ id: "../../etc", email: "x" }));
    expect(readAccount(base)).toBeNull();
    base.setItem("clavis:account", "{nope");
    expect(readAccount(base)).toBeNull();
    writeAccount(base, null);
    expect(base.getItem("clavis:account")).toBeNull();
  });
});
