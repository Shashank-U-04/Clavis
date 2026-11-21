/**
 * Which way a door opens, chosen the way a person thinks of it: it swings into the side of the
 * wall the pointer is on, and hinges on the jamb nearer the pointer. Every door can be turned
 * through the four ways a single leaf can hang in its opening.
 */

import type { Opening, Wall } from "../model/types";
import { projectT, segLen, type Pt } from "../model/geometry";

export type Swing = { hinge: "a" | "b"; side: "left" | "right" };

/** The four ways a single leaf can hang, in the order R turns through them. */
export const SWINGS: Swing[] = [
  { hinge: "a", side: "right" },
  { hinge: "b", side: "right" },
  { hinge: "b", side: "left" },
  { hinge: "a", side: "left" },
];

/** The swing for a door at t on this wall, opening towards the pointer. */
export function swingToward(wall: Wall, t: number, pointer: Pt): Swing {
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
  const d = { x: (wall.bx - wall.ax) / len, y: (wall.by - wall.ay) / len };
  const c = { x: wall.ax + d.x * len * t, y: wall.ay + d.y * len * t };
  // right of someone walking A → B, in screen coordinates (y down): (-d.y, d.x), as in drawing.ts
  const right = (pointer.x - c.x) * -d.y + (pointer.y - c.y) * d.x > 0;
  const along = projectT(pointer, { x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by });
  return { hinge: along < t ? "a" : "b", side: right ? "right" : "left" };
}

/** The next of the four ways round, from the door's current one. */
export function nextSwing(o: Pick<Opening, "hinge" | "side">): Swing {
  const i = SWINGS.findIndex((s) => s.hinge === (o.hinge ?? "a") && s.side === (o.side ?? "right"));
  return SWINGS[(i + 1) % SWINGS.length];
}
