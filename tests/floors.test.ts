import { describe, it, expect } from "vitest";
import { applyBatch, type DesignOperation } from "../src/model/operations";
import { emptyModel, type PlanModel } from "../src/model/types";
import { DEFAULT_STOREY, GROUND, levelsOf, levelOf, onLevel } from "../src/model/levels";
import { analyzeModel } from "../src/model/analysis";
import { checkModel } from "../src/model/issues";
import { stairEnds, stairLinks, stairProgress } from "../src/model/stairs";
import { parseDocument, serializeDocument, toDocument } from "../src/model/document";
import { templateModel } from "../src/model/templates";

// one counter for every batch, so ids stay unique across the floors of a design
let n = 0;
const ids = () => (p: string) => `${p}_${n++}`;

function run(model: PlanModel, ops: DesignOperation[], level?: string) {
  const out = applyBatch(model, ops, ids(), { level });
  if (!out.ok) throw new Error(out.error?.message);
  return out;
}

/** Two floors, 8 × 6 m each: a hall downstairs with the entrance and a stair, a landing upstairs. */
function twoFloors(): PlanModel {
  const box = (prefix: string): DesignOperation[] => [
    { op: "build_layout", rooms: [{ as: `${prefix}hall`, label: prefix ? "Landing" : "Hall", x: 0, y: 0, w: 8, h: 6 }], doors: prefix ? [] : [{ from: "hall", to: "exterior", side: "south" }], windows: [{ room: `${prefix}hall`, side: "north", width: 2 }] },
  ];
  let m = run(emptyModel(), [...box(""), { op: "add_level", as: "up" }]).model;
  const up = levelsOf(m)[1].id;
  m = run(m, box("u"), up).model;
  // a stair against the west wall, climbing north: its foot faces south
  m = run(m, [{ op: "place_item", kind: "stair_straight", x: 1, y: 3, rotation: 0 }]).model;
  return m;
}

describe("floors", () => {
  it("a design without levels is one ground floor, and its entities say nothing about levels", () => {
    const m = templateModel();
    expect(levelsOf(m).map((l) => l.id)).toEqual([GROUND]);
    expect([...m.walls, ...m.rooms, ...m.items].every((e) => e.level === undefined)).toBe(true);
  });

  it("adds a floor on top, and new things go on the floor being edited", () => {
    const m = twoFloors();
    const [ground, first] = levelsOf(m);
    expect(first.elevation).toBeCloseTo(ground.height, 6);
    expect(first.name).toBe("First floor");
    expect(onLevel(m, first.id).rooms.map((r) => r.label)).toEqual(["Landing"]);
    expect(onLevel(m, GROUND).rooms.map((r) => r.label)).toEqual(["Hall"]);
    expect(onLevel(m, first.id).walls.every((w) => w.level === first.id)).toBe(true);
  });

  it("rebuilds one floor's layout without touching the other", () => {
    const m = twoFloors();
    const first = levelsOf(m)[1].id;
    const groundWalls = onLevel(m, GROUND).walls.map((w) => w.id);
    const out = run(m, [{ op: "build_layout", level: first, rooms: [{ as: "b", label: "Bedroom", x: 0, y: 0, w: 4, h: 4 }] }]);
    expect(onLevel(out.model, GROUND).walls.map((w) => w.id)).toEqual(groundWalls);
    expect(onLevel(out.model, first).rooms.map((r) => r.label)).toEqual(["Bedroom"]);
  });

  it("changing a floor's height moves the floors above; removing one takes what is on it", () => {
    let m = twoFloors();
    m = run(m, [{ op: "add_level", as: "top" }]).model;
    const [, first, second] = levelsOf(m);
    m = run(m, [{ op: "update_level", id: first.id, height: 4 }]).model;
    expect(levelsOf(m)[2].elevation).toBeCloseTo(DEFAULT_STOREY + 4, 6);
    m = run(m, [{ op: "remove_level", id: first.id }]).model;
    expect(levelsOf(m).map((l) => l.id)).toEqual([GROUND, second.id]);
    expect(levelsOf(m)[1].elevation).toBeCloseTo(DEFAULT_STOREY, 6);
    expect(m.rooms.some((r) => levelOf(r) === first.id)).toBe(false);
    const bad = applyBatch(m, [{ op: "remove_level", id: GROUND }], ids());
    expect(bad.ok).toBe(false);
  });

  it("a stair joins the room at its foot to the room it lands in upstairs", () => {
    const m = twoFloors();
    const stair = m.items[0];
    const ends = stairEnds(stair)!;
    expect(ends.foot.y).toBeGreaterThan(ends.head.y); // faces south, climbs north
    const [link] = stairLinks(m);
    expect(link.a).toBe(onLevel(m, GROUND).rooms[0].id);
    expect(link.b).toBe(onLevel(m, levelsOf(m)[1].id).rooms[0].id);
    expect(stairProgress(stair, ends.foot)).toBeCloseTo(0, 6);
    expect(stairProgress(stair, { x: stair.x, y: stair.y })).toBeCloseTo(0.5, 6);
    expect(stairProgress(stair, { x: stair.x + 3, y: stair.y })).toBeNull();
  });

  it("rooms upstairs are reached by the stair, one step deeper than the room it starts from", () => {
    const m = twoFloors();
    const a = analyzeModel(m);
    const landing = a.rooms.find((r) => r.label === "Landing")!;
    expect(landing.depth).toBe(2);
    expect(landing.routeDoors?.[1]).toBe(m.items[0].id);
    const issues = checkModel(m).map((i) => i.code);
    expect(issues).not.toContain("room_unreachable");
    expect(issues.filter((c) => c.startsWith("stair_"))).toEqual([]);
  });

  it("checks geometry floor by floor, and reports a stair with nowhere to go", () => {
    let m = twoFloors();
    const first = levelsOf(m)[1].id;
    // a sofa upstairs directly over the ground floor's stair does not collide with it
    m = run(m, [{ op: "place_item", kind: "sofa", x: 4, y: 3, rotation: 0 }], first).model;
    m = run(m, [{ op: "place_item", kind: "sofa", x: 4, y: 3, rotation: 0 }]).model;
    expect(checkModel(m).some((i) => i.code === "items_overlap")).toBe(false);
    // a stair on the top floor climbs to nothing
    m = run(m, [{ op: "place_item", kind: "stair_spiral", x: 6, y: 3, rotation: 0 }], first).model;
    expect(checkModel(m).map((i) => i.code)).toContain("stair_no_floor_above");
  });

  it("design files keep the floors", () => {
    const m = twoFloors();
    const back = parseDocument(serializeDocument(toDocument(m, [])));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.doc.model.levels).toEqual(m.levels);
      expect(back.doc.model.rooms.map((r) => r.level)).toEqual(m.rooms.map((r) => r.level));
    }
  });
});
