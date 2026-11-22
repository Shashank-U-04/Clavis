import { describe, it, expect } from "vitest";
import { solidsOf, step, WALKER_RADIUS } from "../src/three/walkCollision";
import { lindenHeightsModel } from "../src/model/templates";
import { levelsOf, levelOf, onLevel } from "../src/model/levels";
import { openingCenter } from "../src/model/issues";
import type { PlanModel } from "../src/model/types";

const house = lindenHeightsModel();
const ground = onLevel(house, levelsOf(house)[0].id);
const solids = solidsOf(ground);
const shut = () => false;
const allOpen = () => true;

/** Walk from a point in a straight line, in 2 cm steps (60 frames a second at a jog). */
function walk(from: { x: number; y: number }, to: { x: number; y: number }, open: (d: string) => boolean, model: PlanModel = ground) {
  const s = model === ground ? solids : solidsOf(model);
  let p = { ...from };
  const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.05);
  for (let i = 0; i < n; i++) p = step(p.x, p.y, (to.x - from.x) / n, (to.y - from.y) / n, s, open);
  return p;
}

describe("walking: walls stop you, shut doors stop you, you slide along both", () => {
  it("a wall stops the walker, even running at it", () => {
    // from the middle of the hall (y 6.4 to 10) straight north into the dining room's wall (no door there)
    const end = walk({ x: 11.5, y: 8.5 }, { x: 11.5, y: 3 }, allOpen);
    expect(end.y).toBeGreaterThan(6.4 + 0.05 + WALKER_RADIUS - 0.01);
  });

  it("a shut door stops the walker; once it is open they walk through", () => {
    const study = ground.openings.find((o) => o.kind === "door" && ground.walls.find((w) => w.id === o.wallId)!.ay === 10 && openingCenter(ground.walls.find((w) => w.id === o.wallId)!, o).x < 5)!;
    const c = openingCenter(ground.walls.find((w) => w.id === study.wallId)!, study);
    const from = { x: c.x, y: c.y - 1.2 };
    const to = { x: c.x, y: c.y + 1.2 };
    expect(walk(from, to, shut).y).toBeLessThan(c.y);
    expect(walk(from, to, (d) => d === study.id).y).toBeCloseTo(to.y, 1);
  });

  it("walking into a wall at an angle slides along it rather than stopping", () => {
    const from = { x: 3, y: 8.5 };
    const end = walk(from, { x: 7, y: 4.5 }, shut); // north-east, into the living room's wall
    expect(end.x).toBeGreaterThan(5.5); // kept going east along the wall
  });

  it("every door on every floor of Linden Heights can be walked straight through once open", () => {
    for (const level of levelsOf(house)) {
      const floor = onLevel(house, level.id);
      for (const o of floor.openings.filter((x) => x.kind === "door")) {
        const wall = floor.walls.find((w) => w.id === o.wallId)!;
        if (levelOf(wall) !== level.id) continue;
        const c = openingCenter(wall, o);
        const len = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay);
        const n = { x: -(wall.by - wall.ay) / len, y: (wall.bx - wall.ax) / len };
        const from = { x: c.x - n.x * 0.9, y: c.y - n.y * 0.9 };
        const to = { x: c.x + n.x * 0.9, y: c.y + n.y * 0.9 };
        const end = walk(from, to, allOpen, floor);
        expect(Math.hypot(end.x - to.x, end.y - to.y), `${level.name}: door ${o.id} (${o.width} m) at ${c.x.toFixed(2)}, ${c.y.toFixed(2)}`).toBeLessThan(0.05);
      }
    }
  });
});
