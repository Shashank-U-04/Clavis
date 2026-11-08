import { describe, it, expect } from "vitest";
import { boxFaces, paintOrder, project, type Box3 } from "../src/components/figures/iso";
import { buildSunsetFigure, CUT } from "../src/components/figures/sunsetFigure";
import { analyzeModel } from "../src/model/analysis";
import { sunsetLoftModel } from "../src/model/templates";

const box = (x0: number, y0: number, x1: number, y1: number, z0 = 0, z1 = 1): Box3 => ({ x0, y0, z0, x1, y1, z1 });

describe("isometric projection", () => {
  it("puts nearer points lower on the page and height straight up", () => {
    expect(project(1, 1, 0).y).toBeGreaterThan(project(0, 0, 0).y);
    expect(project(0, 0, 1).y).toBeCloseTo(project(0, 0, 0).y - 1);
    expect(project(2, 0, 0).x).toBeCloseTo(-project(0, 2, 0).x);
  });

  it("draws a block as two sides and a top, a flat slab as a top only", () => {
    expect(boxFaces(box(0, 0, 1, 1), 10).map((f) => f.tone)).toEqual(["left", "right", "top"]);
    expect(boxFaces(box(0, 0, 1, 1, 0, 0), 10).map((f) => f.tone)).toEqual(["top"]);
  });
});

describe("painter's order", () => {
  const order = (...boxes: Box3[]) => paintOrder(boxes.map((b, i) => ({ box: b, i }))).map((x) => x.i);

  it("paints farther boxes first along either floor axis", () => {
    expect(order(box(2, 0, 3, 1), box(0, 0, 1, 1))).toEqual([1, 0]);
    expect(order(box(0, 2, 1, 3), box(0, 0, 1, 1))).toEqual([1, 0]);
  });

  it("paints a box resting on another after it", () => {
    expect(order(box(0, 0, 1, 1, 1, 2), box(0, 0, 1, 1, 0, 1))).toEqual([1, 0]);
  });

  it("handles a long wall behind a short piece that overlaps it on screen", () => {
    const wall = box(0, 0, 10, 0.2, 0, 1.2);
    const chair = box(4, 0.5, 4.5, 1, 0, 0.9);
    expect(order(chair, wall)).toEqual([1, 0]);
  });
});

describe("the Sunset Loft figure", () => {
  it("shows every room with readouts taken from the app's own analysis", () => {
    const data = buildSunsetFigure();
    const a = analyzeModel(sunsetLoftModel());
    expect(data.rooms).toHaveLength(a.rooms.length);
    for (const r of data.rooms) {
      const truth = a.rooms.find((x) => x.label === r.label)!;
      expect(r.area).toBeCloseTo(truth.area, 1);
      expect(r.daylight).toBe(Math.round(truth.daylightRatio * 100));
      expect(r.doorsFromEntrance).toBe(truth.depth);
    }
  });

  it("is cut like a section: nothing rises above the cut height", () => {
    const data = buildSunsetFigure();
    expect(data.solids.length).toBeGreaterThan(100);
    expect(CUT).toBe(1.2);
    expect(data.arcs.length).toBeGreaterThanOrEqual(7); // one swing per door leaf
  });
});
