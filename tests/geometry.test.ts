import { describe, it, expect } from "vitest";
import {
  boxCorners,
  boxesOverlap,
  crossesMidSpan,
  pointSegDist,
  projectT,
  rectsOverlap,
  sameLine,
  sharedLength,
  snap,
  wallBox,
  type Box,
} from "../src/model/geometry";

const p = (x: number, y: number) => ({ x, y });

describe("snapping and projection", () => {
  it("snaps to the 5 cm grid by default", () => {
    expect(snap(1.234)).toBeCloseTo(1.25);
    expect(snap(-0.026)).toBeCloseTo(-0.05);
    expect(snap(2.31, 0.1)).toBeCloseTo(2.3);
  });

  it("measures distance to a segment, clamped to its ends", () => {
    expect(pointSegDist(p(2, 3), p(0, 0), p(4, 0))).toBeCloseTo(3);
    expect(pointSegDist(p(7, 4), p(0, 0), p(4, 0))).toBeCloseTo(5);
    expect(projectT(p(1, 9), p(0, 0), p(4, 0))).toBeCloseTo(0.25);
  });
});

describe("wall relations", () => {
  it("detects walls cutting through each other, but not L or T junctions", () => {
    expect(crossesMidSpan(p(0, 0), p(6, 0), p(3, -2), p(3, 2))).toBe(true);
    expect(crossesMidSpan(p(0, 0), p(6, 0), p(6, 0), p(6, 5))).toBe(false); // L
    expect(crossesMidSpan(p(0, 0), p(6, 0), p(3, 0), p(3, 5))).toBe(false); // T
    expect(crossesMidSpan(p(0, 0), p(6, 0), p(0, 1), p(6, 1))).toBe(false); // parallel
  });

  it("measures the length two walls share on one line", () => {
    expect(sameLine(p(0, 0), p(4, 0), p(6, 0), p(9, 0))).toBe(true);
    expect(sharedLength(p(0, 0), p(4, 0), p(3, 0), p(7, 0))).toBeCloseTo(1);
    expect(sharedLength(p(0, 0), p(10, 0), p(8, 0), p(2, 0))).toBeCloseTo(6);
    expect(sharedLength(p(0, 0), p(4, 0), p(4, 0), p(9, 0))).toBe(0); // end to end
    expect(sharedLength(p(0, 0), p(4, 0), p(0, 0.5), p(4, 0.5))).toBe(0); // parallel, apart
    expect(sharedLength(p(0, 0), p(0, 5), p(0, 1), p(0, 2))).toBeCloseTo(1); // vertical
  });
});

describe("oriented boxes", () => {
  const unit: Box = { x: 0, y: 0, halfW: 1, halfD: 0.5, angle: 0 };

  it("places corners according to the angle", () => {
    const turned = boxCorners({ ...unit, angle: Math.PI / 2 });
    const xs = turned.map((c) => c.x);
    expect(Math.max(...xs)).toBeCloseTo(0.5);
    expect(Math.max(...turned.map((c) => c.y))).toBeCloseTo(1);
  });

  it("overlap, touch and separation", () => {
    expect(boxesOverlap(unit, { ...unit, x: 1.5 })).toBe(true);
    expect(boxesOverlap(unit, { ...unit, x: 2 })).toBe(false); // edges touch
    expect(boxesOverlap(unit, { ...unit, x: 3 })).toBe(false);
  });

  it("finds separation that only a rotated axis reveals", () => {
    const diamond: Box = { x: 1.9, y: 1.3, halfW: 0.5, halfD: 0.5, angle: Math.PI / 4 };
    expect(boxesOverlap(unit, diamond)).toBe(false);
    expect(boxesOverlap(unit, { ...diamond, x: 1.3, y: 0.6 })).toBe(true);
  });

  it("lets furniture lean on a wall but not pass through it", () => {
    const wall = wallBox({ ax: 0, ay: 0, bx: 4, by: 0, thickness: 0.15 });
    const sofa = (y: number): Box => ({ x: 2, y, halfW: 0.5, halfD: 0.3, angle: 0 });
    expect(boxesOverlap(sofa(0.075 + 0.3), wall, 0.02)).toBe(false); // touching the face
    expect(boxesOverlap(sofa(0.075 + 0.29), wall, 0.02)).toBe(false); // 1 cm in: still leaning
    expect(boxesOverlap(sofa(0), wall, 0.02)).toBe(true);
  });
});

describe("room rectangles", () => {
  it("shared edges are not overlaps", () => {
    const a = { x: 0, y: 0, w: 4, h: 3 };
    expect(rectsOverlap(a, { x: 4, y: 0, w: 2, h: 3 })).toBe(false);
    expect(rectsOverlap(a, { x: 3.9, y: 1, w: 2, h: 3 })).toBe(true);
  });
});
