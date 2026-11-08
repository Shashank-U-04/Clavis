/**
 * Deterministic layout builder.
 *
 * The assistant proposes a room *program* — labelled rectangles on wall centrelines, plus which
 * rooms connect through doors and which sides get windows. This module turns that program into
 * walls, openings and rooms with plain geometry, so generated plans are consistent by
 * construction instead of depending on a language model to place every wall end exactly:
 *
 *  - every room edge becomes wall; shared edges become ONE interior wall, unshared edges exterior;
 *  - walls are split only where the interior/exterior classification changes or at X-junctions;
 *  - doors are centred on the longest stretch of wall two rooms (or a room and the outside) share;
 *  - windows are centred on the longest exterior stretch of the requested side;
 *  - stored room rectangles are the CLEAR floor inside the wall faces.
 *
 * Coordinates: metres, x → east, y → south (the plan's y grows downward).
 */

import { z } from "zod";
import type { Opening, Room, Wall } from "./types";
import { snap } from "./geometry";

export const FLOOR_FINISHES = ["oak", "tile", "carpet", "concrete"] as const;
export const SIDES = ["north", "south", "east", "west"] as const;
export type Side = (typeof SIDES)[number];

const alias = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/)
  .describe("short name for this room, unique within the layout, e.g. bed1 — later operations can reference the created room as $bed1");

export const LayoutRoomSchema = z
  .object({
    as: alias,
    label: z.string().trim().min(1).max(60).describe("human label, e.g. 'Bedroom 1'"),
    x: z.number().finite().min(-100).max(100).describe("west edge (wall centreline), metres"),
    y: z.number().finite().min(-100).max(100).describe("north edge (wall centreline), metres"),
    w: z.number().finite().min(1).max(40).describe("east-west size between wall centrelines, metres"),
    h: z.number().finite().min(1).max(40).describe("north-south size between wall centrelines, metres"),
    floor: z.enum(FLOOR_FINISHES).optional(),
  })
  .strict();

export const LayoutDoorSchema = z
  .object({
    from: alias.describe("room the door leaf swings into"),
    to: z.string().regex(/^([A-Za-z][A-Za-z0-9_]{0,31}|exterior)$/).describe("the other room's name, or 'exterior' for an entrance"),
    side: z.enum(SIDES).optional().describe("for exterior doors: which side of `from` (default: its longest exterior side)"),
    width: z.number().finite().min(0.6).max(2.4).optional().describe("clear width, metres (default 0.9)"),
    position: z.number().finite().min(0).max(1).optional().describe("0..1 along the shared wall stretch (default 0.5 = centred)"),
  })
  .strict();

export const LayoutWindowSchema = z
  .object({
    room: alias,
    side: z.enum(SIDES),
    width: z.number().finite().min(0.4).max(4).optional().describe("metres (default 1.2, reduced to fit)"),
    sill: z.number().finite().min(0).max(1.5).optional(),
    height: z.number().finite().min(0.4).max(2.2).optional(),
  })
  .strict();

export const LayoutSpecSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    rooms: z.array(LayoutRoomSchema).min(1).max(24),
    doors: z.array(LayoutDoorSchema).max(40).optional(),
    windows: z.array(LayoutWindowSchema).max(60).optional(),
    wallHeight: z.number().finite().min(2.2).max(4).optional(),
    exteriorThickness: z.number().finite().min(0.1).max(0.5).optional(),
    interiorThickness: z.number().finite().min(0.05).max(0.3).optional(),
  })
  .strict();

export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;

export type LayoutResult =
  | { ok: true; walls: Wall[]; openings: Opening[]; rooms: Room[]; refs: Record<string, string>; notes: string[] }
  | { ok: false; error: { code: string; message: string } };

const EPS = 1e-6;
const MIN_GAP = 0.3; // rooms closer than this without touching would make overlapping walls
const DOOR_MARGIN = 0.1; // keep door jambs this far from a wall junction

type Orient = "h" | "v";

/** A piece of one grid line between two consecutive breakpoints, with the rooms on each side. */
interface Piece {
  orient: Orient;
  c: number; // y for horizontal lines, x for vertical
  a: number; // start along the line (x or y)
  b: number; // end
  lo?: number; // room index on the low side (north for h, west for v)
  hi?: number; // room index on the high side (south for h, east for v)
}

const fail = (code: string, message: string): LayoutResult => ({ ok: false, error: { code, message } });
const key = (v: number) => Math.round(v * 1000);

export function buildLayout(spec: LayoutSpec, newId: (prefix: string) => string): LayoutResult {
  const extT = spec.exteriorThickness ?? 0.2;
  const intT = spec.interiorThickness ?? 0.1;
  const height = spec.wallHeight ?? 2.7;

  const rooms = spec.rooms.map((r) => ({ ...r, x: snap(r.x), y: snap(r.y), w: snap(r.w), h: snap(r.h) }));

  // ---- program checks ------------------------------------------------------
  const names = new Map<string, number>();
  for (const [i, r] of rooms.entries()) {
    if (names.has(r.as)) return fail("duplicate_room", `Two rooms are named "${r.as}".`);
    names.set(r.as, i);
  }
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > EPS && oy > EPS)
        return fail("rooms_overlap", `Rooms "${a.label}" and "${b.label}" overlap by ${ox.toFixed(2)} × ${oy.toFixed(2)} m. Rooms must tile without overlapping.`);
      // parallel near-miss: facing edges that overlap in projection but sit a sliver apart
      const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
      const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
      if ((oy > EPS && gapX > EPS && gapX < MIN_GAP) || (ox > EPS && gapY > EPS && gapY < MIN_GAP)) {
        const g = oy > EPS ? gapX : gapY;
        return fail(
          "rooms_near_miss",
          `Rooms "${a.label}" and "${b.label}" are ${g.toFixed(2)} m apart. Make their edges coincide to share a wall, or separate them by at least ${MIN_GAP} m.`,
        );
      }
    }
  }

  // ---- edges → pieces ----------------------------------------------------------
  type Edge = { orient: Orient; c: number; a: number; b: number };
  const edges: Edge[] = [];
  for (const r of rooms) {
    edges.push({ orient: "h", c: r.y, a: r.x, b: r.x + r.w });
    edges.push({ orient: "h", c: r.y + r.h, a: r.x, b: r.x + r.w });
    edges.push({ orient: "v", c: r.x, a: r.y, b: r.y + r.h });
    edges.push({ orient: "v", c: r.x + r.w, a: r.y, b: r.y + r.h });
  }

  // room index whose interior lies just on one side of a point on a line
  const roomOn = (orient: Orient, c: number, m: number, side: -1 | 1): number | undefined => {
    const px = orient === "h" ? m : c + side * 1e-3;
    const py = orient === "h" ? c + side * 1e-3 : m;
    const i = rooms.findIndex((r) => px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h);
    return i < 0 ? undefined : i;
  };

  const lines = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = `${e.orient}:${key(e.c)}`;
    lines.set(k, [...(lines.get(k) ?? []), e]);
  }

  const pieces: Piece[] = [];
  for (const group of lines.values()) {
    const { orient, c } = group[0];
    const cuts = [...new Set(group.flatMap((e) => [key(e.a), key(e.b)]))].sort((p, q) => p - q).map((v) => v / 1000);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < EPS) continue;
      const m = (a + b) / 2;
      if (!group.some((e) => e.a <= m && e.b >= m)) continue; // gap between edges on this line
      pieces.push({ orient, c, a, b, lo: roomOn(orient, c, m, -1), hi: roomOn(orient, c, m, 1) });
    }
  }

  const isInterior = (p: Piece) => p.lo !== undefined && p.hi !== undefined;

  // A point on a line where perpendicular walls continue on BOTH sides is an X-junction: split there.
  const perpendicularBothSides = (orient: Orient, c: number, at: number): boolean => {
    const other: Orient = orient === "h" ? "v" : "h";
    const onLine = pieces.filter((p) => p.orient === other && Math.abs(p.c - at) < EPS);
    const before = onLine.some((p) => Math.abs(p.b - c) < EPS);
    const after = onLine.some((p) => Math.abs(p.a - c) < EPS);
    return before && after;
  };

  // ---- pieces → walls -------------------------------------------------------------
  const walls: Wall[] = [];
  const wallSpans: { wall: Wall; orient: Orient; c: number; a: number; b: number }[] = [];
  const byLine = new Map<string, Piece[]>();
  for (const p of pieces) {
    const k = `${p.orient}:${key(p.c)}`;
    byLine.set(k, [...(byLine.get(k) ?? []), p]);
  }
  for (const group of byLine.values()) {
    group.sort((p, q) => p.a - q.a);
    let run: Piece[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const { orient, c } = run[0];
      const a = run[0].a;
      const b = run[run.length - 1].b;
      const thickness = isInterior(run[0]) ? intT : extT;
      const wall: Wall =
        orient === "h"
          ? { id: newId("wall"), ax: a, ay: c, bx: b, by: c, thickness, height }
          : { id: newId("wall"), ax: c, ay: a, bx: c, by: b, thickness, height };
      walls.push(wall);
      wallSpans.push({ wall, orient, c, a, b });
      run = [];
    };
    for (const p of group) {
      const prev = run[run.length - 1];
      const continues =
        prev &&
        Math.abs(prev.b - p.a) < EPS &&
        isInterior(prev) === isInterior(p) &&
        !perpendicularBothSides(p.orient, p.c, p.a);
      if (!continues) flush();
      run.push(p);
    }
    flush();
  }

  // ---- rooms (clear floor inside the wall faces) ---------------------------------------
  const halfOn = (orient: Orient, c: number, a: number, b: number): number => {
    let t = 0;
    for (const p of pieces) {
      if (p.orient !== orient || Math.abs(p.c - c) > EPS || p.b <= a + EPS || p.a >= b - EPS) continue;
      t = Math.max(t, (isInterior(p) ? intT : extT) / 2);
    }
    return t;
  };
  const refs: Record<string, string> = {};
  const outRooms: Room[] = rooms.map((r) => {
    const n = halfOn("h", r.y, r.x, r.x + r.w);
    const s = halfOn("h", r.y + r.h, r.x, r.x + r.w);
    const wv = halfOn("v", r.x, r.y, r.y + r.h);
    const e = halfOn("v", r.x + r.w, r.y, r.y + r.h);
    const id = newId("room");
    refs[r.as] = id;
    return {
      id,
      x: round(r.x + wv),
      y: round(r.y + n),
      w: round(r.w - wv - e),
      h: round(r.h - n - s),
      label: r.label,
      floor: r.floor ?? defaultFloor(r.label),
    };
  });

  // ---- openings ----------------------------------------------------------------
  /** Contiguous stretches of wall between room i and room j (j undefined = outside), optionally on one side of i. */
  const stretches = (i: number, j: number | undefined, side?: Side) => {
    const r = rooms[i];
    const want = (p: Piece): boolean => {
      const iLo = p.lo === i && p.hi === j;
      const iHi = p.hi === i && p.lo === j;
      if (!iLo && !iHi) return false;
      if (!side) return true;
      if (side === "north") return p.orient === "h" && iHi && Math.abs(p.c - r.y) < EPS;
      if (side === "south") return p.orient === "h" && iLo && Math.abs(p.c - (r.y + r.h)) < EPS;
      if (side === "west") return p.orient === "v" && iHi && Math.abs(p.c - r.x) < EPS;
      return p.orient === "v" && iLo && Math.abs(p.c - (r.x + r.w)) < EPS;
    };
    const sel = pieces.filter(want).sort((p, q) => (p.orient + p.c).localeCompare(q.orient + q.c) || p.a - q.a);
    const out: { orient: Orient; c: number; a: number; b: number; roomIsLow: boolean }[] = [];
    for (const p of sel) {
      const last = out[out.length - 1];
      if (last && last.orient === p.orient && Math.abs(last.c - p.c) < EPS && Math.abs(last.b - p.a) < EPS) last.b = p.b;
      else out.push({ orient: p.orient, c: p.c, a: p.a, b: p.b, roomIsLow: p.lo === i });
    }
    return out.sort((p, q) => q.b - q.a - (p.b - p.a));
  };

  /** Host wall + t for a centre point on a stretch. */
  const host = (orient: Orient, c: number, at: number): { wall: Wall; t: number } | null => {
    const span = wallSpans.find((s) => s.orient === orient && Math.abs(s.c - c) < EPS && s.a - EPS <= at && s.b + EPS >= at);
    if (!span) return null;
    return { wall: span.wall, t: (at - span.a) / (span.b - span.a) };
  };

  const openings: Opening[] = [];
  const notes: string[] = [];

  for (const d of spec.doors ?? []) {
    const i = names.get(d.from);
    if (i === undefined) return fail("unknown_room", `Door references unknown room "${d.from}".`);
    const j = d.to === "exterior" ? undefined : names.get(d.to);
    if (d.to !== "exterior" && j === undefined) return fail("unknown_room", `Door references unknown room "${d.to}".`);
    const width = d.width ?? 0.9;
    const options = stretches(i, j, d.to === "exterior" ? d.side : undefined);
    const where = d.to === "exterior" ? `the outside${d.side ? ` on its ${d.side} side` : ""}` : `"${rooms[j!].label}"`;
    if (options.length === 0) return fail("no_shared_wall", `"${rooms[i].label}" shares no wall with ${where}, so no door can join them.`);
    const s = options[0];
    const room = s.b - s.a - 2 * DOOR_MARGIN;
    if (room < width)
      return fail("door_does_not_fit", `"${rooms[i].label}" shares only ${(s.b - s.a).toFixed(2)} m of wall with ${where}; a ${width} m door needs ${(width + 2 * DOOR_MARGIN).toFixed(2)} m.`);
    const centre = s.a + DOOR_MARGIN + width / 2 + (d.position ?? 0.5) * (room - width);
    const h = host(s.orient, s.c, centre);
    if (!h) return fail("internal", "Door host wall not found.");
    // Leaf swings into `from`. Walking a wall A→B (h: +x, v: +y) the right-hand side is +y for
    // horizontal walls and -x for vertical ones — so "right" points at the low side only for v.
    const roomOnRight = s.orient === "h" ? !s.roomIsLow : s.roomIsLow;
    openings.push({
      id: newId("door"),
      kind: "door",
      wallId: h.wall.id,
      t: round(h.t, 4),
      width,
      sill: 0,
      height: Math.min(2.1, height - 0.1),
      hinge: "a",
      side: roomOnRight ? "right" : "left",
    });
  }

  for (const w of spec.windows ?? []) {
    const i = names.get(w.room);
    if (i === undefined) return fail("unknown_room", `Window references unknown room "${w.room}".`);
    const options = stretches(i, undefined, w.side);
    if (options.length === 0)
      return fail("not_exterior", `The ${w.side} side of "${rooms[i].label}" has no exterior wall for a window.`);
    const s = options[0];
    const maxW = s.b - s.a - 2 * 0.15;
    if (maxW < 0.4) return fail("window_does_not_fit", `The ${w.side} exterior wall of "${rooms[i].label}" is too short for a window.`);
    let width = w.width ?? 1.2;
    if (width > maxW) {
      notes.push(`Window in "${rooms[i].label}" narrowed from ${width} m to ${maxW.toFixed(2)} m to fit its wall.`);
      width = round(maxW, 2);
    }
    const sill = w.sill ?? 0.9;
    const wh = Math.min(w.height ?? 1.2, height - sill - 0.1);
    if (wh < 0.4) return fail("window_does_not_fit", `A window with a ${sill} m sill does not fit under a ${height} m wall.`);
    const h = host(s.orient, s.c, (s.a + s.b) / 2);
    if (!h) return fail("internal", "Window host wall not found.");
    openings.push({ id: newId("window"), kind: "window", wallId: h.wall.id, t: round(h.t, 4), width, sill, height: round(wh, 2) });
  }

  return { ok: true, walls, openings, rooms: outRooms, refs, notes };
}

function round(v: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function defaultFloor(label: string): (typeof FLOOR_FINISHES)[number] {
  if (/bath|wc|toilet|shower|laundry|utility|kitchen/i.test(label)) return "tile";
  if (/bed/i.test(label)) return "carpet";
  return "oak";
}
