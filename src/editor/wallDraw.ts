/**
 * Where the wall tool puts the far end of a wall, from where the pointer is:
 *
 *  1. onto the end of an existing wall, when the pointer is close to one (walls meet cleanly);
 *  2. otherwise along the nearest 15° direction from the start (0°, 45°, 90°… are easy to hit),
 *     or along the pointer's exact direction while Shift is held;
 *  3. at a typed length when one is given, else at the pointer's distance, to the millimetre.
 *
 * Without a start yet, it is where a new wall would begin: a wall end nearby, or the 5 cm grid.
 */

import { snap, type Pt } from "../model/geometry";
import type { Wall } from "../model/types";

export const ANGLE_STEP = 15;

const mm = (v: number) => Math.round(v * 1000) / 1000;

/** The nearest wall end within `reach` metres of p, if any. */
export function nearestEnd(walls: Wall[], p: Pt, reach: number): Pt | null {
  let best: Pt | null = null;
  let bestD = reach;
  for (const w of walls) {
    for (const e of [
      { x: w.ax, y: w.ay },
      { x: w.bx, y: w.by },
    ]) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= bestD) {
        best = e;
        bestD = d;
      }
    }
  }
  return best;
}

export function wallEnd(start: Pt | null, pointer: Pt, walls: Wall[], opts: { free?: boolean; length?: number; scale?: number } = {}): Pt {
  const reach = Math.max(0.12, 12 / (opts.scale ?? 60));
  if (!start) return nearestEnd(walls, pointer, reach) ?? { x: snap(pointer.x), y: snap(pointer.y) };
  if (opts.length === undefined) {
    const end = nearestEnd(walls, pointer, reach);
    if (end && Math.hypot(end.x - start.x, end.y - start.y) > 0.01) return end;
  }
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  let angle = Math.atan2(dy, dx);
  if (!opts.free) {
    const step = (ANGLE_STEP * Math.PI) / 180;
    angle = Math.round(angle / step) * step;
  }
  const length = opts.length ?? (opts.free ? Math.hypot(dx, dy) : snap(Math.hypot(dx, dy)));
  return { x: mm(start.x + Math.cos(angle) * length), y: mm(start.y + Math.sin(angle) * length) };
}
