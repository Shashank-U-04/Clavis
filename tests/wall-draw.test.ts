import { describe, it, expect } from "vitest";
import { wallEnd } from "../src/editor/wallDraw";
import type { Wall } from "../src/model/types";

const wall = (ax: number, ay: number, bx: number, by: number): Wall => ({ id: "w", ax, ay, bx, by, thickness: 0.15, height: 2.7 });

describe("the wall tool", () => {
  it("starts on the 5 cm grid, or on a wall end nearby", () => {
    expect(wallEnd(null, { x: 1.23, y: 2.01 }, [])).toEqual({ x: 1.25, y: 2 });
    expect(wallEnd(null, { x: 3.05, y: 0.04 }, [wall(0, 0, 3, 0)])).toEqual({ x: 3, y: 0 });
  });

  it("snaps the direction to 15° steps", () => {
    const end = wallEnd({ x: 0, y: 0 }, { x: 3, y: 2.9 }, []); // about 44°
    expect(end.x).toBeCloseTo(end.y, 2); // exactly 45°
    const flat = wallEnd({ x: 0, y: 0 }, { x: 4, y: 0.2 }, []);
    expect(flat.y).toBe(0);
  });

  it("follows the pointer exactly with Shift", () => {
    const end = wallEnd({ x: 0, y: 0 }, { x: 3, y: 1.234 }, [], { free: true });
    expect(end).toEqual({ x: 3, y: 1.234 });
  });

  it("takes a typed length along the chosen direction, in any direction", () => {
    expect(wallEnd({ x: 1, y: 1 }, { x: 5, y: 1.1 }, [], { length: 3.2 })).toEqual({ x: 4.2, y: 1 });
    expect(wallEnd({ x: 1, y: 1 }, { x: 1, y: -6 }, [], { length: 2.5 })).toEqual({ x: 1, y: -1.5 });
    const diag = wallEnd({ x: 0, y: 0 }, { x: -2, y: 2 }, [], { length: 2 });
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(2, 2);
    expect(diag.x).toBeCloseTo(-diag.y, 2);
  });

  it("joins the end of an existing wall when the pointer is close to it", () => {
    expect(wallEnd({ x: 0, y: 4 }, { x: 2.93, y: 0.06 }, [wall(3, 0, 6, 0)])).toEqual({ x: 3, y: 0 });
  });
});
