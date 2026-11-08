import { describe, it, expect } from "vitest";
import { planToSvg } from "../src/export/planSvg";
import { doorLeaves } from "../src/model/drawing";
import { templateModel } from "../src/model/templates";
import type { Opening, Wall } from "../src/model/types";

const wall: Wall = { id: "w", ax: 0, ay: 0, bx: 4, by: 0, thickness: 0.1, height: 2.7 };
const door = (p: Partial<Opening>): Opening => ({ id: "d", kind: "door", wallId: "w", t: 0.5, width: 0.9, sill: 0, height: 2.1, ...p });

describe("door drawing", () => {
  it("swings right of A→B by default (south of an eastward wall), left when asked", () => {
    const [r] = doorLeaves(wall, door({}));
    expect(r.hinge.x).toBeCloseTo(1.55);
    expect(r.open.y).toBeGreaterThan(0); // south = +y
    const [l] = doorLeaves(wall, door({ side: "left" }));
    expect(l.open.y).toBeLessThan(0);
  });

  it("hinges on the B jamb when hinge = b, and splits wide doors into two leaves", () => {
    expect(doorLeaves(wall, door({ hinge: "b" }))[0].hinge.x).toBeCloseTo(2.45);
    expect(doorLeaves(wall, door({ width: 1.6 }))).toHaveLength(2);
  });
});

describe("svg export", () => {
  it("draws every room label and escapes text", () => {
    const m = templateModel();
    m.rooms[0] = { ...m.rooms[0], label: "Kids <play> & read" };
    const svg = planToSvg(m, { date: "2026-11-07" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Kids &lt;play&gt; &amp; read");
    for (const r of m.rooms.slice(1)) expect(svg).toContain(r.label);
    expect(svg).toContain("not for construction");
    // one swing arc per door leaf (wide openings are double doors)
    const leaves = m.openings.filter((o) => o.kind === "door").flatMap((o) => doorLeaves(m.walls.find((w) => w.id === o.wallId)!, o));
    expect(svg.match(/<path d="M[^"]+A /g)?.length).toBe(leaves.length);
  });
});
