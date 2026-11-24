import { describe, it, expect } from "vitest";
import { blocksApproach } from "../src/ai/local/approach";
import { Trial } from "../src/ai/local/trial";
import type { PlanModel, Wall } from "../src/model/types";
import { emptyModel } from "../src/model/types";

const wall = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({ id, ax, ay, bx, by, thickness: 0.15, height: 2.7 });

/** a 5 × 4 m room with a door in the middle of its south wall (x = 2.5, y = 4) */
function room(): PlanModel {
  return {
    ...emptyModel(),
    walls: [wall("n", 0, 0, 5, 0), wall("e", 5, 0, 5, 4), wall("s", 5, 4, 0, 4), wall("w", 0, 4, 0, 0)],
    rooms: [{ id: "r", x: 0.075, y: 0.075, w: 4.85, h: 3.85, label: "Living", floor: "oak" }],
    openings: [{ id: "d", kind: "door", wallId: "s", t: 0.5, width: 0.9, sill: 0, height: 2.1 }],
  };
}

describe("the way into a door, kept clear by Clavis Local", () => {
  it("is blocked by a tall piece a metre in from the door, not by one off to the side or by a rug", () => {
    const m = room();
    expect(blocksApproach(m, { id: "a", kind: "armchair", x: 2.5, y: 2.9, rotation: 180 })).toBe(true);
    expect(blocksApproach(m, { id: "a", kind: "armchair", x: 4.3, y: 3.3, rotation: 180 })).toBe(false);
    expect(blocksApproach(m, { id: "a", kind: "rug", x: 2.5, y: 2.9, rotation: 0 })).toBe(false);
    // further in than the strip reaches
    expect(blocksApproach(m, { id: "a", kind: "armchair", x: 2.5, y: 1.2, rotation: 180 })).toBe(false);
  });

  it("makes the engine's trial refuse a new piece in the way, while pieces already there are left alone", () => {
    const t = new Trial(room());
    const inTheWay = t.try([{ op: "place_item", kind: "armchair", x: 2.5, y: 2.9, rotation: 180 }]);
    expect(inTheWay.ok).toBe(false);
    expect(inTheWay.error).toMatch(/in the way into a door/);
    const aside = t.try([{ op: "place_item", kind: "armchair", x: 4.3, y: 3.3, rotation: 180 }]);
    expect(aside.ok).toBe(true);

    const placedByAPerson = new Trial({ ...room(), items: [{ id: "x", kind: "armchair", x: 2.5, y: 2.9, rotation: 180 }] });
    expect(placedByAPerson.try([{ op: "place_item", kind: "plant", x: 0.5, y: 0.5, rotation: 0 }]).ok).toBe(true);
  });
});

describe("repairing a room nobody can walk through", () => {
  it("moves a piece to open a way, and removes nothing", async () => {
    const { repairIssues } = await import("../src/ai/local/repair");
    const { checkModel } = await import("../src/model/issues");
    const m = { ...room(), items: [{ id: "a", kind: "sofa", x: 1.2, y: 2, rotation: 0 }, { id: "b", kind: "sofa", x: 3.75, y: 2, rotation: 0 }] };
    const issue = checkModel(m).find((i) => i.code === "room_not_walkable")!;
    expect(issue).toBeDefined();
    const t = new Trial(m);
    const report = repairIssues(t, [issue.id]);
    expect(report.fixed.map((f) => f.issue.code)).toEqual(["room_not_walkable"]);
    expect(t.model.items).toHaveLength(2);
    // fixed without causing anything else (the room's missing window was there before)
    expect(checkModel(t.model).map((i) => i.code)).toEqual(checkModel(m).map((i) => i.code).filter((c) => c !== "room_not_walkable"));
  });
});
