import { describe, it, expect } from "vitest";
import { applyBatch, type DesignOperation } from "../src/model/operations";
import { checkModel } from "../src/model/issues";
import { CHECK_CODES } from "../src/model/checks";
import { emptyModel, type PlanModel } from "../src/model/types";
import { levelOf, levelsOf } from "../src/model/levels";
import { lindenHeightsModel } from "../src/model/templates";

let n = 0;
const run = (model: PlanModel, ops: DesignOperation[], level?: string) => {
  const out = applyBatch(model, ops, (p) => `${p}_${n++}`, { level });
  if (!out.ok) throw new Error(out.error?.message);
  return out.model;
};

/** Two floors of one 8 × 6 m room; a stair along the west wall climbs north through the upper floor. */
function house(): { m: PlanModel; up: string } {
  const box = (prefix: string): DesignOperation[] => [
    { op: "build_layout", rooms: [{ as: `${prefix}hall`, label: prefix ? "Landing" : "Hall", x: 0, y: 0, w: 8, h: 6 }], doors: prefix ? [] : [{ from: "hall", to: "exterior", side: "south" }], windows: [{ room: `${prefix}hall`, side: "north", width: 2 }] },
  ];
  let m = run(emptyModel(), [...box(""), { op: "add_level", as: "up" }]);
  const up = levelsOf(m)[1].id;
  m = run(m, box("u"), up);
  m = run(m, [{ op: "place_item", kind: "stair_straight", x: 1, y: 3, rotation: 0 }]);
  return { m, up };
}

/** A door in the upstairs wall on the given side, at y = 3 (west/east) or x = 4 (north/south). */
function withDoor(m: PlanModel, up: string, side: "west" | "east"): PlanModel {
  const wall = m.walls.find((w) => levelOf(w) === up && (side === "west" ? w.ax === 0 && w.bx === 0 : w.ax === 8 && w.bx === 8))!;
  return run(m, [{ op: "add_opening", kind: "door", wallId: wall.id, t: 0.5 }]);
}

const codes = (m: PlanModel) => checkModel(m).map((i) => i.code);

describe("a door never opens onto a stairwell", () => {
  it("is listed among the checks", () => {
    expect(CHECK_CODES).toContain("door_onto_stairwell");
  });

  it("reports a door upstairs beside the opening the stair comes up through", () => {
    const { m, up } = house();
    expect(codes(withDoor(m, up, "west"))).toContain("door_onto_stairwell");
  });

  it("accepts a door across the landing from it", () => {
    const { m, up } = house();
    expect(codes(withDoor(m, up, "east"))).not.toContain("door_onto_stairwell");
  });

  it("Linden Heights: wide halls, and every door opens onto floor", () => {
    const m = lindenHeightsModel();
    const issues = checkModel(m).filter((i) => i.severity !== "info");
    expect(issues).toEqual([]);
    for (const label of ["Entrance hall", "Landing", "Upper landing"]) expect(m.rooms.find((r) => r.label === label)!.h).toBeGreaterThanOrEqual(3.5);
  });
});
