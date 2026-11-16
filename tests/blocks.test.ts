import { describe, it, expect } from "vitest";
import { ROOM_BLOCKS, nextLabel, roomBlockOps, snapRect, uncovered } from "../src/model/blocks";
import { applyBatch } from "../src/model/operations";
import { checkModel } from "../src/model/issues";
import { emptyModel, type PlanModel } from "../src/model/types";
import { Trial } from "../src/ai/local/trial";
import { furnishRoom } from "../src/ai/local/furnish";

/** one counter for the whole file, so rooms added one after another never share an id */
let next = 0;
const ids = () => (p: string) => `${p}_${next++}`;
const add = (m: PlanModel, x: number, y: number, w: number, h: number, label = "Bedroom") => {
  const out = applyBatch(m, roomBlockOps(m, { x, y, w, h }, label, "carpet"), ids());
  expect(out.ok, out.error?.message).toBe(true);
  return out.model;
};
const wallProblems = (m: PlanModel) => checkModel(m).filter((i) => i.code.startsWith("wall") || i.code.startsWith("walls"));

describe("room blocks", () => {
  it("adds a room with a closed ring of walls round it", () => {
    const m = add(emptyModel(), 0, 0, 3.4, 3.6);
    expect(m.rooms).toHaveLength(1);
    expect(m.walls).toHaveLength(4);
    expect(wallProblems(m)).toEqual([]);
  });

  it("shares a wall with the room beside it instead of doubling it", () => {
    let m = add(emptyModel(), 0, 0, 3.4, 3.6);
    m = add(m, 3.4, 0, 3.0, 3.6, "Study");
    expect(m.walls).toHaveLength(7);
    expect(wallProblems(m)).toEqual([]);
  });

  it("fills in only the part of a shared side that has no wall yet", () => {
    let m = add(emptyModel(), 0, 0, 3.4, 3.6);
    m = add(m, 3.4, 0, 2.4, 4.6, "Bathroom"); // taller than its neighbour
    const east = m.walls.filter((w) => Math.abs(w.ax - 3.4) < 0.01 && Math.abs(w.bx - 3.4) < 0.01);
    const covered = east.reduce((s, w) => s + Math.abs(w.by - w.ay), 0);
    expect(covered).toBeCloseTo(4.6, 5);
    expect(checkModel(m).filter((i) => i.code === "walls_overlap_collinear")).toEqual([]);
  });

  it("finds the uncovered parts of a line", () => {
    const m = add(emptyModel(), 0, 0, 3, 3);
    expect(uncovered(m, "h", 0, 0, 3)).toEqual([]);
    expect(uncovered(m, "h", 0, -2, 5)).toEqual([
      [-2, 0],
      [3, 5],
    ]);
  });

  it("snaps a block flush against a nearby room", () => {
    const m = add(emptyModel(), 0, 0, 3.4, 3.6);
    expect(snapRect(m, { x: 3.7, y: 0.25, w: 3, h: 3.6 })).toEqual({ x: 3.4, y: 0, w: 3, h: 3.6 });
    expect(snapRect(m, { x: 6, y: 6, w: 3, h: 3 })).toEqual({ x: 6, y: 6, w: 3, h: 3 });
  });

  it("never drops a room on top of another: it is pushed out to the nearest free side", () => {
    const m = add(emptyModel(), 0, 0, 3.4, 3.6);
    // dropped mostly over the bedroom's east half → lands flush against its east wall
    expect(snapRect(m, { x: 2.75, y: 0.4, w: 2.4, h: 2.8 })).toEqual({ x: 3.4, y: 0.4, w: 2.4, h: 2.8 });
    // dropped over its north edge → lands above it, aligned with its west wall
    const above = snapRect(m, { x: 0.2, y: -2, w: 3, h: 2.4 });
    expect(above).toEqual({ x: 0, y: -2.4, w: 3, h: 2.4 });
  });

  it("numbers repeated rooms", () => {
    let m = add(emptyModel(), 0, 0, 3.4, 3.6, "Bedroom");
    expect(nextLabel(m, "Bedroom")).toBe("Bedroom 2");
    m = add(m, 3.4, 0, 3.4, 3.6, "Bedroom 2");
    expect(nextLabel(m, "Bedroom")).toBe("Bedroom 3");
    expect(nextLabel(m, "Kitchen")).toBe("Kitchen");
  });

  it("every block is big enough for the validator", () => {
    for (const b of ROOM_BLOCKS) {
      const m = add(emptyModel(), 0, 0, b.w, b.h, b.label);
      expect(checkModel(m).filter((i) => i.code === "room_too_small"), b.label).toEqual([]);
    }
  });

  it("keeps the floor inside the wall faces, on the 5 cm grid", () => {
    const m = add(emptyModel(), 0, 0, 3.4, 3.6);
    const r = m.rooms[0];
    for (const [got, want] of [[r.x, 0.05], [r.y, 0.05], [r.w, 3.3], [r.h, 3.5]]) expect(got).toBeCloseTo(want, 6);
    expect(m.walls.every((w) => w.thickness === 0.1)).toBe(true);
  });

  it("rooms built from blocks can be furnished without a problem", () => {
    let n = 0;
    const id = (p: string) => `${p}_f${n++}`;
    let m = add(emptyModel(), 0, 0, 3.4, 3.6, "Bedroom");
    m = add(m, 3.4, 1.25, 2.4, 2.8, "Bathroom");
    const on = (test: (w: PlanModel["walls"][number]) => boolean) => m.walls.find(test)!.id;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const out = applyBatch(
      m,
      [
        { op: "add_opening", kind: "door", wallId: on((w) => near(w.ax, 3.4) && near(w.bx, 3.4)), t: 0.6 },
        { op: "add_opening", kind: "door", wallId: on((w) => near(w.ax, 0) && near(w.bx, 0)), t: 0.5 },
        { op: "add_opening", kind: "window", wallId: on((w) => near(w.ay, 3.6) && near(w.by, 3.6) && Math.max(w.ax, w.bx) < 3.5), t: 0.5 },
        { op: "add_opening", kind: "window", wallId: on((w) => near(w.ax, 5.8) && near(w.bx, 5.8)), t: 0.5 },
      ],
      id,
    );
    expect(out.ok, out.error?.message).toBe(true);
    const trial = new Trial(out.model);
    for (const room of out.model.rooms) expect(furnishRoom(trial, room.id)?.placed.length, room.label).toBeGreaterThan(0);
    expect(trial.problems.map((i) => i.code)).toEqual([]);
  });
});
