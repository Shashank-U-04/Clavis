/**
 * Can a person actually get through a room? For every room, a person 0.4 m across (the walker
 * in the 3D walk) starts just inside one of its doors and walks wherever furniture and walls
 * let them; every other door of the room, and most of its floor, must be reachable. This finds
 * what the door's clear zone cannot: a sofa or a piano a metre inside a doorway that leaves no
 * way past, or a hall too full to cross.
 */

import type { PlanModel, Room } from "./types";
import { levelsOf, onLevel } from "./levels";
import { openingCenter } from "./issues";
import { solidsOf, WALKER_RADIUS, type Solid } from "../three/walkCollision";

const CELL = 0.1;

/** A room must let a person reach at least this share of its free floor from its door. */
export const MIN_REACH = 0.6;

export interface Blocked {
  level: string;
  /** the room's label */
  room: string;
  roomId: string;
  /** the doors of this room that cannot be reached from its first door */
  doors: string[];
  /** share of the room's free floor that can be reached (0..1) */
  reach: number;
}

/** How far a point is from a solid box (0 inside it). */
function distance(x: number, y: number, s: Solid): number {
  const b = s.box;
  const c = Math.cos(b.angle);
  const sn = Math.sin(b.angle);
  const dx = x - b.x;
  const dy = y - b.y;
  const lx = Math.abs(dx * c + dy * sn) - b.halfW;
  const ly = Math.abs(-dx * sn + dy * c) - b.halfD;
  return Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
}

/** Rooms on any floor that a person cannot get through, door to door. */
export function blockedRooms(model: PlanModel, r = WALKER_RADIUS): Blocked[] {
  const out: Blocked[] = [];
  for (const level of levelsOf(model)) {
    const floor = onLevel(model, level.id);
    // every door open: we are asking about furniture, not about doors being shut
    const solids = solidsOf(floor).filter((s) => !s.door);
    for (const room of floor.rooms) {
      const result = walkRoom(floor, room, solids, r);
      if (result) out.push({ level: level.name, room: room.label, roomId: room.id, ...result });
    }
  }
  return out;
}

function walkRoom(floor: PlanModel, room: Room, solids: Solid[], r: number): { doors: string[]; reach: number } | null {
  // the doors in this room's walls, and a point just inside the room in front of each
  const inside = (x: number, y: number) => x > room.x && x < room.x + room.w && y > room.y && y < room.y + room.h;
  const starts: { id: string; x: number; y: number }[] = [];
  for (const o of floor.openings) {
    if (o.kind !== "door") continue;
    const wall = floor.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const c = openingCenter(wall, o);
    const len = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay) || 1;
    const n = { x: -(wall.by - wall.ay) / len, y: (wall.bx - wall.ax) / len };
    for (const s of [1, -1]) {
      const p = { x: c.x + n.x * s * (wall.thickness / 2 + r + 0.05), y: c.y + n.y * s * (wall.thickness / 2 + r + 0.05) };
      if (inside(p.x, p.y)) starts.push({ id: o.id, ...p });
    }
  }
  if (starts.length === 0) return null;

  // the room's floor as a grid of cells a person's centre can stand on
  const cols = Math.max(1, Math.round(room.w / CELL));
  const rows = Math.max(1, Math.round(room.h / CELL));
  const free = new Uint8Array(cols * rows).fill(1);
  // each solid blocks only the cells within reach of it: visit those, not the whole room
  for (const s of solids) {
    const b = s.box;
    const c = Math.abs(Math.cos(b.angle));
    const sn = Math.abs(Math.sin(b.angle));
    const ex = c * b.halfW + sn * b.halfD + r;
    const ey = sn * b.halfW + c * b.halfD + r;
    const i0 = Math.max(0, Math.ceil((b.x - ex - room.x) / CELL - 0.5));
    const i1 = Math.min(cols - 1, Math.floor((b.x + ex - room.x) / CELL - 0.5));
    const j0 = Math.max(0, Math.ceil((b.y - ey - room.y) / CELL - 0.5));
    const j1 = Math.min(rows - 1, Math.floor((b.y + ey - room.y) / CELL - 0.5));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * cols + i;
        if (free[k] && distance(room.x + (i + 0.5) * CELL, room.y + (j + 0.5) * CELL, s) < r) free[k] = 0;
      }
  }
  let freeCount = 0;
  for (let k = 0; k < free.length; k++) freeCount += free[k];
  const cellOf = (x: number, y: number) => {
    const i = Math.min(cols - 1, Math.max(0, Math.floor((x - room.x) / CELL)));
    const j = Math.min(rows - 1, Math.max(0, Math.floor((y - room.y) / CELL)));
    return j * cols + i;
  };

  // flood from the first door's step
  const seen = new Uint8Array(cols * rows);
  const first = cellOf(starts[0].x, starts[0].y);
  const queue = free[first] ? [first] : [];
  if (queue.length) seen[first] = 1;
  let reached = 0;
  while (queue.length) {
    const k = queue.pop()!;
    reached++;
    const i = k % cols;
    const j = (k - i) / cols;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nk = nj * cols + ni;
      if (free[nk] && !seen[nk]) (seen[nk] = 1), queue.push(nk);
    }
  }
  const doors = [...new Set(starts.filter((s) => !seen[cellOf(s.x, s.y)]).map((s) => s.id))];
  const reach = freeCount ? reached / freeCount : 0;
  return doors.length || reach < MIN_REACH ? { doors, reach } : null;
}
