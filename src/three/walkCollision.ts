/**
 * What stops the walker, and how it slides along what stops it. Free of three.js so it can be
 * tested on its own.
 *
 * The walker is a round body (a person seen from above, about 0.4 m across at the shoulders).
 * Walls are solid; a doorway is solid while its door is shut and open once it swings open; tall
 * furniture is solid, a little inside its footprint (people brush past the edge of a sofa).
 * Rugs, paving and stairs are walked on. A tree or a parasol stops you only at its trunk or
 * pole, a pergola only at its corner posts.
 *
 * Moving is "move, then push out of anything you went into": a step into a wall at an angle
 * keeps the part of the step along the wall, so the walker slides round corners and through
 * doorways instead of sticking on a jamb.
 */

import type { PlanModel } from "../model/types";
import { segLen, wallBox, type Box } from "../model/geometry";
import { itemBox, openingSpan } from "../model/issues";
import { catalogByKind, itemSize } from "../model/catalog";

/** The walker's radius: half the width of an adult at the shoulders. */
export const WALKER_RADIUS = 0.2;

/** A solid thing on one floor: a box, and the door it is (a doorway is only solid while shut). */
export interface Solid {
  box: Box;
  door?: string;
}

/** How far inside its footprint a piece of furniture starts to stop you. */
const FURNITURE_INSET = 0.06;

export function solidsOf(model: PlanModel): Solid[] {
  const out: Solid[] = [];
  for (const w of model.walls) {
    const length = segLen(w.ax, w.ay, w.bx, w.by);
    if (length < 1e-6) continue;
    const ux = (w.bx - w.ax) / length;
    const uy = (w.by - w.ay) / length;
    const piece = (s: number, e: number, door?: string) => {
      const a = { x: w.ax + ux * s, y: w.ay + uy * s };
      const b = { x: w.ax + ux * e, y: w.ay + uy * e };
      out.push({ box: wallBox({ ax: a.x, ay: a.y, bx: b.x, by: b.y, thickness: w.thickness }), door });
    };
    const doors = model.openings
      .filter((o) => o.wallId === w.id && o.kind === "door")
      .map((o) => ({ id: o.id, span: openingSpan(w, o).map((t) => t * length) as [number, number] }))
      .sort((a, b) => a.span[0] - b.span[0]);
    // the wall runs a little past each end (its corners close), and is cut at its doorways
    let cursor = -w.thickness / 2;
    for (const { id, span } of doors) {
      if (span[0] > cursor) piece(cursor, span[0]);
      piece(span[0], span[1], id);
      cursor = Math.max(cursor, span[1]);
    }
    if (cursor < length + w.thickness / 2) piece(cursor, length + w.thickness / 2);
  }
  for (const it of model.items) {
    const c = catalogByKind(it.kind);
    // stairs are walked on, rugs and paving walked over, low things stepped past
    if (!c || c.isRug || c.stair || (itemSize(it)?.h ?? c.h) < 0.3) continue;
    const box = itemBox(it);
    if (!box) continue;
    if (c.trunk) out.push({ box: { ...box, halfW: c.trunk / 2, halfD: c.trunk / 2 } });
    else if (c.posts) {
      const p = c.posts / 2;
      const [cos, sin] = [Math.cos(box.angle), Math.sin(box.angle)];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = u * (box.halfW - p);
        const ly = v * (box.halfD - p);
        out.push({ box: { x: box.x + lx * cos - ly * sin, y: box.y + lx * sin + ly * cos, halfW: p, halfD: p, angle: box.angle } });
      }
    } else out.push({ box: { ...box, halfW: Math.max(0.05, box.halfW - FURNITURE_INSET), halfD: Math.max(0.05, box.halfD - FURNITURE_INSET) } });
  }
  return out;
}

/**
 * Push a round body at (x, y) out of every solid it overlaps. Doorways whose door is open
 * (in `open`) are passed through. Returns where it ends up.
 */
export function pushOut(x: number, y: number, solids: readonly Solid[], open: (door: string) => boolean, r = WALKER_RADIUS): { x: number; y: number } {
  let px = x;
  let py = y;
  // a few rounds settle a body pressed into a corner between two solids
  for (let round = 0; round < 4; round++) {
    let moved = false;
    for (const { box: b, door } of solids) {
      if (door && open(door)) continue;
      const c = Math.cos(b.angle);
      const s = Math.sin(b.angle);
      // the body's centre in the box's own frame
      const dx = px - b.x;
      const dy = py - b.y;
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      if (Math.abs(lx) > b.halfW + r || Math.abs(ly) > b.halfD + r) continue;
      const cx = Math.max(-b.halfW, Math.min(b.halfW, lx));
      const cy = Math.max(-b.halfD, Math.min(b.halfD, ly));
      let ox = lx - cx;
      let oy = ly - cy;
      const d = Math.hypot(ox, oy);
      if (d >= r) continue;
      if (d > 1e-9) {
        // out along the line from the nearest point of the box
        ox = (ox / d) * (r - d);
        oy = (oy / d) * (r - d);
      } else {
        // the centre is inside the box: out through the nearest face
        const outX = b.halfW - Math.abs(lx) + r;
        const outY = b.halfD - Math.abs(ly) + r;
        if (outX < outY) (ox = Math.sign(lx || 1) * outX), (oy = 0);
        else (ox = 0), (oy = Math.sign(ly || 1) * outY);
      }
      px += ox * c - oy * s;
      py += ox * s + oy * c;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, y: py };
}

/**
 * Take a step of (dx, dy) from (x, y), sliding along whatever is in the way. Long steps are
 * taken in short pieces, so a fast walker never passes through a thin wall.
 */
export function step(x: number, y: number, dx: number, dy: number, solids: readonly Solid[], open: (door: string) => boolean, r = WALKER_RADIUS): { x: number; y: number } {
  const pieces = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (r * 0.5)));
  let p = { x, y };
  for (let i = 0; i < pieces; i++) p = pushOut(p.x + dx / pieces, p.y + dy / pieces, solids, open, r);
  return p;
}
