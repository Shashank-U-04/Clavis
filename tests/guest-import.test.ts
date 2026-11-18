import { describe, it, expect } from "vitest";
import { declineGuestPlans, guestPlansToOffer, importGuestPlans } from "../src/lib/account/guestImport";
import { ScopedStorage } from "../src/model/account";
import { listProjects, loadProject, saveProject } from "../src/model/library";
import { listEvents, listVersions, saveVersion } from "../src/lib/workspace/browser";
import { emptyModel } from "../src/model/types";
import { memoryStorage } from "./helpers/memoryStorage";

const A = "11111111-1111-4111-8111-111111111111";

describe("plans made before signing in", () => {
  it("are offered once, and come across with their versions", () => {
    const base = memoryStorage();
    saveProject(base, "g1", { ...emptyModel(), name: "Guest loft" }, [], 1000);
    saveVersion(base, "g1", { ...emptyModel(), name: "Guest loft" }, [], { label: "v1", now: 1100 });
    const mine = new ScopedStorage(base, A);
    saveProject(mine, "a1", { ...emptyModel(), name: "Account plan" }, [], 500);

    expect(guestPlansToOffer(base, mine).map((p) => p.name)).toEqual(["Guest loft"]);
    expect(importGuestPlans(base, mine, 2000)).toBe(1);

    const names = listProjects(mine).map((p) => p.name).sort();
    expect(names).toEqual(["Account plan", "Guest loft"]);
    const copy = listProjects(mine).find((p) => p.name === "Guest loft")!;
    expect(copy.id).toBe("g1");
    expect(loadProject(mine, copy.id).ok).toBe(true);
    expect(listVersions(mine, copy.id).map((v) => v.label)).toEqual(["v1"]);
    expect(listEvents(mine)[0]).toMatchObject({ kind: "imported", planName: "Guest loft" });
    expect(listProjects(base).map((p) => p.name)).toEqual(["Guest loft"]); // the guest keeps theirs

    expect(guestPlansToOffer(base, mine)).toEqual([]); // offered once
  });

  it("are not offered or copied again once the account has them (say, after a sync on a fresh browser)", () => {
    const base = memoryStorage();
    saveProject(base, "g1", { ...emptyModel(), name: "Guest loft" }, [], 1000);
    const mine = new ScopedStorage(base, A);
    importGuestPlans(base, mine, 2000);
    mine.removeItem("clavis:guest-import"); // the flag is lost; the plans came back from the cloud
    expect(guestPlansToOffer(base, mine)).toEqual([]);
    expect(importGuestPlans(base, mine, 3000)).toBe(0);
    expect(listProjects(mine)).toHaveLength(1);
  });

  it("a guest plan edited since it was brought along comes across again as a copy, beside the account's", () => {
    const base = memoryStorage();
    saveProject(base, "g1", { ...emptyModel(), name: "Guest loft" }, [], 1000);
    const mine = new ScopedStorage(base, A);
    importGuestPlans(base, mine, 2000);
    saveProject(base, "g1", { ...emptyModel(), name: "Guest loft, edited later" }, [], 4000);
    expect(importGuestPlans(base, mine, 5000)).toBe(1);
    const ids = listProjects(mine).map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("are not offered again after declining", () => {
    const base = memoryStorage();
    saveProject(base, "g1", { ...emptyModel(), name: "Guest loft" }, []);
    const mine = new ScopedStorage(base, A);
    declineGuestPlans(mine);
    expect(guestPlansToOffer(base, mine)).toEqual([]);
  });
});
