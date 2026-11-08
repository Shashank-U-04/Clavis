/**
 * Plan-drawing geometry shared by the editor and the SVG export, so both draw doors the way
 * the 3D view builds them (three/architecture.ts):
 *  - the leaf hinges on the A-side jamb when hinge = "a", on the B-side jamb when "b";
 *  - it swings to the RIGHT of someone walking the wall from A to B, or to the left when
 *    side = "left";
 *  - openings wider than 1.15 m clear are double doors, one leaf per jamb.
 * Plan coordinates: x east, y south (screen-down).
 */

import type { Opening, Wall } from "./types";
import { segLen, segPoint, type Pt } from "./geometry";
import { openingSpan } from "./issues";

export interface Leaf {
  hinge: Pt;
  /** free edge of the leaf when closed (in the wall line) */
  closed: Pt;
  /** free edge of the leaf when open 90° */
  open: Pt;
  radius: number;
  /** SVG arc sweep flag drawing closed → open around the hinge */
  sweep: 0 | 1;
}

export function openingEnds(wall: Wall, o: Opening): [Pt, Pt] {
  const [t0, t1] = openingSpan(wall, o);
  const a = { x: wall.ax, y: wall.ay };
  const b = { x: wall.bx, y: wall.by };
  return [segPoint(a, b, t0), segPoint(a, b, t1)];
}

export function doorLeaves(wall: Wall, o: Opening): Leaf[] {
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
  const d = { x: (wall.bx - wall.ax) / len, y: (wall.by - wall.ay) / len };
  // right of the walker in screen coordinates (y down) is (-d.y, d.x); left is (d.y, -d.x)
  const n = o.side === "left" ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };
  const [p0, p1] = openingEnds(wall, o);
  const leaf = (hinge: Pt, closed: Pt): Leaf => {
    const radius = Math.hypot(closed.x - hinge.x, closed.y - hinge.y);
    const open = { x: hinge.x + n.x * radius, y: hinge.y + n.y * radius };
    const cross = (closed.x - hinge.x) * (open.y - hinge.y) - (closed.y - hinge.y) * (open.x - hinge.x);
    return { hinge, closed, open, radius, sweep: cross > 0 ? 1 : 0 };
  };
  if (o.width - 0.04 > 1.15) {
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    return [leaf(p0, mid), leaf(p1, mid)];
  }
  return o.hinge === "b" ? [leaf(p1, p0)] : [leaf(p0, p1)];
}

/** SVG path for one leaf's swing arc and the open leaf, in world units multiplied by `s`. */
export function leafPath(l: Leaf, s = 1): { arc: string; leaf: string } {
  const f = (v: number) => (v * s).toFixed(2);
  return {
    arc: `M ${f(l.closed.x)} ${f(l.closed.y)} A ${f(l.radius)} ${f(l.radius)} 0 0 ${l.sweep} ${f(l.open.x)} ${f(l.open.y)}`,
    leaf: `M ${f(l.hinge.x)} ${f(l.hinge.y)} L ${f(l.open.x)} ${f(l.open.y)}`,
  };
}
