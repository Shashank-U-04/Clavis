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

export interface Blocked {
  level: string;
  room: string;
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
      if (result) out.push({ level: level.name, room: room.label, ...result });
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
  const near = solids.filter((s) => s.box.x > room.x - 6 && s.box.x < room.x + room.w + 6 && s.box.y > room.y - 6 && s.box.y < room.y + room.h + 6);
  const free = new Uint8Array(cols * rows);
  let freeCount = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = room.x + (i + 0.5) * CELL;
      const y = room.y + (j + 0.5) * CELL;
      if (near.every((s) => distance(x, y, s) >= r)) (free[j * cols + i] = 1), freeCount++;
    }
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
  return doors.length || reach < 0.6 ? { doors, reach } : null;
}
