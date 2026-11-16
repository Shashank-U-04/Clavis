import { describe, it, expect } from "vitest";
import { ROOM_BLOCKS, nextLabel, roomBlockOps, snapRect, uncovered } from "../src/model/blocks";
import { applyBatch } from "../src/model/operations";
import { checkModel } from "../src/model/issues";
import { emptyModel, type PlanModel } from "../src/model/types";

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_${n++}`;
};
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
});
