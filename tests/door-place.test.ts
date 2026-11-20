import { describe, it, expect } from "vitest";
import { nextSwing, SWINGS, swingToward } from "../src/editor/doorPlace";
import type { Wall } from "../src/model/types";

// a wall running east along y = 0; south (y > 0) is the walker's right going A → B
const wall: Wall = { id: "w", ax: 0, ay: 0, bx: 4, by: 0, thickness: 0.15, height: 2.7 };

describe("placing a door", () => {
  it("opens towards the side of the wall the pointer is on", () => {
    expect(swingToward(wall, 0.5, { x: 2.2, y: 0.3 }).side).toBe("right");
    expect(swingToward(wall, 0.5, { x: 2.2, y: -0.3 }).side).toBe("left");
  });

  it("hinges on the jamb nearer the pointer", () => {
    expect(swingToward(wall, 0.5, { x: 1.7, y: 0.2 }).hinge).toBe("a");
    expect(swingToward(wall, 0.5, { x: 2.3, y: 0.2 }).hinge).toBe("b");
  });

  it("turns through all four ways and back", () => {
    let s = SWINGS[0];
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      seen.add(`${s.hinge}${s.side}`);
      s = nextSwing(s);
    }
    expect(seen.size).toBe(4);
    expect(s).toEqual(SWINGS[0]);
  });
});
