/**
 * Room blocks: a room as a person thinks of it — a floor with walls round it — rather than a
 * floor rectangle and four walls drawn one by one.
 *
 * A block becomes one batch of operations: the room, plus walls on its four sides wherever
 * there is not already a wall on that line. Two blocks placed side by side therefore share
 * one wall instead of stacking two, and the validator sees a clean junction. Rooms sit on
 * wall centrelines, as everywhere else in Clavis.
 */

import type { PlanModel } from "./types";

export type Finish = "oak" | "tile" | "carpet" | "concrete";

export interface RoomBlock {
  id: string;
  label: string;
  /** size on wall centrelines, metres */
  w: number;
  h: number;
  floor: Finish;
  note: string;
}

/** Typical concept-design sizes; each clears the validator's minimum for its room type. */
export const ROOM_BLOCKS: RoomBlock[] = [
  { id: "bedroom", label: "Bedroom", w: 3.4, h: 3.6, floor: "carpet", note: "a double bed" },
  { id: "main-bedroom", label: "Main bedroom", w: 4.0, h: 4.2, floor: "carpet", note: "king bed and wardrobe" },
  { id: "living", label: "Living room", w: 5.0, h: 4.2, floor: "oak", note: "sofa, TV and a table" },
  { id: "kitchen", label: "Kitchen", w: 3.0, h: 3.6, floor: "tile", note: "a run of units" },
  { id: "living-kitchen", label: "Living & Kitchen", w: 7.0, h: 4.5, floor: "oak", note: "open plan" },
  { id: "dining", label: "Dining room", w: 3.4, h: 3.4, floor: "oak", note: "a table for six" },
  { id: "bathroom", label: "Bathroom", w: 2.4, h: 2.8, floor: "tile", note: "bath or shower" },
  { id: "wc", label: "WC", w: 1.5, h: 2.0, floor: "tile", note: "toilet and basin" },
  { id: "study", label: "Study", w: 2.8, h: 3.0, floor: "oak", note: "a desk and shelves" },
  { id: "hall", label: "Hall", w: 1.4, h: 4.0, floor: "oak", note: "joins the rooms" },
  { id: "utility", label: "Utility", w: 2.0, h: 2.4, floor: "tile", note: "laundry and storage" },
];

export const blockById = (id: string | null | undefined) => ROOM_BLOCKS.find((b) => b.id === id) ?? null;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EPS = 0.01;
/** shorter leftovers than this are not worth a wall (the validator calls them too short) */
const MIN_WALL = 0.2;
/** how close, in metres, an edge must come to another room's edge to snap flush to it */
export const SNAP_DISTANCE = 0.4;

const round = (v: number) => Math.round(v * 100) / 100;

/** "Bedroom", or "Bedroom 2" when there is already a Bedroom. */
export function nextLabel(model: PlanModel, base: string): string {
  const taken = new Set(model.rooms.map((r) => r.label.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/** The parts of [a, b] along a horizontal or vertical line that no existing wall covers. */
export function uncovered(model: PlanModel, axis: "h" | "v", at: number, a: number, b: number): [number, number][] {
  let gaps: [number, number][] = [[Math.min(a, b), Math.max(a, b)]];
  for (const w of model.walls) {
    const onLine = axis === "h" ? Math.abs(w.ay - at) < EPS && Math.abs(w.by - at) < EPS : Math.abs(w.ax - at) < EPS && Math.abs(w.bx - at) < EPS;
    if (!onLine) continue;
    const lo = axis === "h" ? Math.min(w.ax, w.bx) : Math.min(w.ay, w.by);
    const hi = axis === "h" ? Math.max(w.ax, w.bx) : Math.max(w.ay, w.by);
    gaps = gaps.flatMap(([s, e]): [number, number][] => {
      if (hi <= s + EPS || lo >= e - EPS) return [[s, e]];
      const out: [number, number][] = [];
      if (lo > s + EPS) out.push([s, lo]);
      if (hi < e - EPS) out.push([hi, e]);
      return out;
    });
  }
  return gaps.filter(([s, e]) => e - s >= MIN_WALL);
}

/** Pull a rectangle's edges flush with nearby room edges and wall lines, if any are close. */
export function snapRect(model: PlanModel, r: Rect): Rect {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const room of model.rooms) {
    xs.add(room.x).add(room.x + room.w);
    ys.add(room.y).add(room.y + room.h);
  }
  for (const w of model.walls) {
    if (Math.abs(w.ax - w.bx) < EPS) xs.add(w.ax);
    if (Math.abs(w.ay - w.by) < EPS) ys.add(w.ay);
  }
  const shift = (lo: number, size: number, lines: Set<number>) => {
    let best = SNAP_DISTANCE;
    let move = 0;
    for (const v of lines) {
      for (const d of [v - lo, v - (lo + size)]) {
        if (Math.abs(d) < best) {
          best = Math.abs(d);
          move = d;
        }
      }
    }
    return move;
  };
  return { ...r, x: round(r.x + shift(r.x, r.w, xs)), y: round(r.y + shift(r.y, r.h, ys)) };
}

/** The operations that add a room with walls round it, sharing walls already there. */
export function roomBlockOps(model: PlanModel, r: Rect, label: string, floor: Finish): unknown[] {
  const x0 = round(r.x);
  const y0 = round(r.y);
  const x1 = round(r.x + r.w);
  const y1 = round(r.y + r.h);
  const ops: unknown[] = [{ op: "add_room", x: x0, y: y0, w: round(x1 - x0), h: round(y1 - y0), label, floor }];
  const wall = (ax: number, ay: number, bx: number, by: number) => ops.push({ op: "add_wall", ax: round(ax), ay: round(ay), bx: round(bx), by: round(by), thickness: 0.15, height: 2.7 });
  for (const y of [y0, y1]) for (const [s, e] of uncovered(model, "h", y, x0, x1)) wall(s, y, e, y);
  for (const x of [x0, x1]) for (const [s, e] of uncovered(model, "v", x, y0, y1)) wall(x, s, x, e);
  return ops;
}
