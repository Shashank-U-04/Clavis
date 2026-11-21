/**
 * Stairs join floors. A stair stands on one level and climbs to the level above it: you step
 * on at its front edge (the side it faces) and step off upstairs beyond its back edge. The room
 * in front of the foot and the room beyond the head, one floor up, are linked by it the way a
 * door links two rooms, so routes, depths and "every room reachable" work across floors.
 */

import type { Item, PlanModel, Room } from "./types";
import type { Pt } from "./geometry";
import { catalogByKind, itemSize } from "./catalog";
import { levelAbove, levelOf } from "./levels";

/** How far past each end the rooms a stair joins are looked for. */
const PROBE = 0.3;

export interface StairEnds {
  /** the middle of the front edge, where you step on */
  foot: Pt;
  /** the middle of the back edge, where you step off upstairs */
  head: Pt;
  /** unit vector from foot to head, the way up */
  up: Pt;
  width: number;
  length: number;
}

export const isStair = (it: Pick<Item, "kind">): boolean => !!catalogByKind(it.kind)?.stair;

export function stairEnds(it: Item): StairEnds | null {
  const size = itemSize(it);
  if (!size || !isStair(it)) return null;
  const r = (it.rotation * Math.PI) / 180;
  const front = { x: Math.sin(r), y: Math.cos(r) };
  return {
    foot: { x: it.x + front.x * (size.d / 2), y: it.y + front.y * (size.d / 2) },
    head: { x: it.x - front.x * (size.d / 2), y: it.y - front.y * (size.d / 2) },
    up: { x: -front.x, y: -front.y },
    width: size.w,
    length: size.d,
  };
}

const inside = (r: Room, p: Pt, tol = 0.02) => p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;

export interface StairLink {
  /** the stair's item id */
  id: string;
  /** the level it stands on, and the level it climbs to (null: there is no floor above) */
  from: string;
  to: string | null;
  /** the room you step on from, and the room you step off into upstairs (null: none there) */
  a: string | null;
  b: string | null;
}

/** Every stair in the design and the rooms it joins. */
export function stairLinks(model: PlanModel): StairLink[] {
  const out: StairLink[] = [];
  for (const it of model.items) {
    const ends = stairEnds(it);
    if (!ends) continue;
    const from = levelOf(it);
    const to = levelAbove(model, from)?.id ?? null;
    const before = { x: ends.foot.x - ends.up.x * PROBE, y: ends.foot.y - ends.up.y * PROBE };
    const beyond = { x: ends.head.x + ends.up.x * PROBE, y: ends.head.y + ends.up.y * PROBE };
    const a = model.rooms.find((r) => levelOf(r) === from && inside(r, before))?.id ?? null;
    const b = to ? (model.rooms.find((r) => levelOf(r) === to && inside(r, beyond))?.id ?? null) : null;
    out.push({ id: it.id, from, to, a, b });
  }
  return out;
}

/**
 * How far up a stair a point in plan is, 0 at the foot to 1 at the head, or null when the
 * point is not on the stair.
 */
export function stairProgress(it: Item, p: Pt): number | null {
  const e = stairEnds(it);
  if (!e) return null;
  const along = (p.x - e.foot.x) * e.up.x + (p.y - e.foot.y) * e.up.y;
  const across = (p.x - e.foot.x) * -e.up.y + (p.y - e.foot.y) * e.up.x;
  if (along < 0 || along > e.length || Math.abs(across) > e.width / 2) return null;
  return along / e.length;
}
