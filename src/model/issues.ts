/**
 * The constraint engine: the deterministic referee for every change, whether it was made by
 * hand, by Clavis Local or by a hosted model. It never edits anything; it reports findings.
 *
 * A finding's id is built from its code and the ids it refers to, so the same design always
 * produces the same ids. That is what lets the app say precisely which findings a change
 * resolved, kept or introduced.
 */

import type { Issue, Item, Opening, PlanModel, Room, Wall } from "./types";
import {
  boxCorners,
  boxesOverlap,
  crossesMidSpan,
  dist,
  pointInRect,
  pointOnSeg,
  pointSegDist,
  projectT,
  rectsOverlap,
  segLen,
  segPoint,
  sharedLength,
  wallBox,
  type Box,
  type Pt,
} from "./geometry";
import { catalogByKind, itemSize } from "./catalog";
import { reviewFindings } from "./analysis";
import { levelsOf, onLevel } from "./levels";
import { blockedRooms, MIN_REACH } from "./walkable";

/**
 * Tunable early-design heuristics (not building-code values for any jurisdiction).
 */
export const RULES = {
  /** shortest wall worth keeping */
  minWallLength: 0.2,
  /** wall ends closer than this are treated as joined */
  joinTolerance: 0.08,
  /** doors narrower than this get a warning */
  minDoorWidth: 0.7,
  /** clear zone kept free in front of a door (beyond the wall face) and beside its jambs */
  doorClearDepth: 0.8,
  windowClearDepth: 0.4,
  openingSideClearance: 0.1,
  /** room labels that suggest a habitable room expected to have daylight */
  habitableLabel: /\b(bed|bedroom|living|study|office|lounge|kids?|guest|master)\b/i,
  /** how far furniture may poke outside its room before it is reported */
  roomEdgeTolerance: 0.05,
  /** the clear width a person needs to walk through a furnished room */
  walkPath: 0.6,
};

type Draft = Omit<Issue, "id">;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const endA = (w: Wall): Pt => ({ x: w.ax, y: w.ay });
const endB = (w: Wall): Pt => ({ x: w.bx, y: w.by });
const wallLength = (w: Wall) => segLen(w.ax, w.ay, w.bx, w.by);

// ---------------------------------------------------------------------------
// Opening helpers (also used by the editor, the operations and the 3D builder)
// ---------------------------------------------------------------------------

/** Plan position of an opening's centre. */
export const openingCenter = (wall: Wall, o: Opening): Pt => segPoint(endA(wall), endB(wall), o.t);

/** The opening's extent along its wall as [start, end] fractions (may fall outside 0..1). */
export function openingSpan(wall: Wall, o: Opening): [number, number] {
  const half = o.width / 2 / Math.max(wallLength(wall), 1e-9);
  return [o.t - half, o.t + half];
}

/**
 * The nearest centre position at which an opening of `width` lies fully inside the wall,
 * or null when the wall is too short for it.
 */
export function clampOpeningT(wall: Wall, width: number, t: number): number | null {
  const len = wallLength(wall);
  if (width > len - 0.02) return null;
  const half = width / 2 / len;
  return Math.min(1 - half, Math.max(half, t));
}

/** The first room whose rectangle contains the point, if any. */
export const roomAt = (rooms: Room[], p: Pt): Room | undefined => rooms.find((r) => pointInRect(p, r));

const roomCorners = (r: Room): Pt[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
];

/** Distance from a point to the outline of a room. */
function distToOutline(p: Pt, r: Room): number {
  const c = roomCorners(r);
  return Math.min(...c.map((a, i) => pointSegDist(p, a, c[(i + 1) % 4])));
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/** code:sortedRefs, with #2, #3… when the same pair is reported more than once. */
function assignIds(drafts: Draft[]): Issue[] {
  const counts = new Map<string, number>();
  return drafts.map((d) => {
    const key = `${d.code}:${[...d.refs].sort().join("+")}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    return { id: n === 1 ? key : `${key}#${n}`, ...d };
  });
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface Ctx {
  model: PlanModel;
  wallById: Map<string, Wall>;
  out: Draft[];
}

/** Non-finite or non-positive numbers make every other check meaningless. */
function checkNumbers(m: PlanModel): Draft[] {
  const out: Draft[] = [];
  const finite = (...v: unknown[]) => v.every((x) => typeof x === "number" && Number.isFinite(x));
  const positive = (...v: unknown[]) => finite(...v) && v.every((x) => (x as number) > 0);
  const report = (id: string, what: string) =>
    out.push({ severity: "error", code: "invalid_dimension", message: `${what} has a missing or impossible number.`, refs: [id] });
  for (const w of m.walls) if (!finite(w.ax, w.ay, w.bx, w.by) || !positive(w.thickness, w.height)) report(w.id, `Wall ${w.id}`);
  for (const o of m.openings) if (!finite(o.t, o.sill) || o.sill < 0 || !positive(o.width, o.height)) report(o.id, `${o.kind} ${o.id}`);
  for (const r of m.rooms) if (!finite(r.x, r.y) || !positive(r.w, r.h)) report(r.id, `Room "${r.label}"`);
  for (const it of m.items) if (!finite(it.x, it.y, it.rotation)) report(it.id, `Item ${it.id}`);
  return out;
}

function checkWalls({ model, out }: Ctx) {
  const walls = model.walls;
  for (const w of walls) {
    const len = wallLength(w);
    if (len < RULES.minWallLength) {
      out.push({
        severity: "error",
        code: "wall_too_short",
        message: `Wall ${w.id} is only ${Math.round(len * 100)} cm long; the shortest useful wall is ${RULES.minWallLength * 100} cm.`,
        refs: [w.id],
        measurements: { length: r3(len), minimum: RULES.minWallLength },
      });
    }
  }
  walls.forEach((a, i) => {
    for (const b of walls.slice(i + 1)) {
      const shared = sharedLength(endA(a), endB(a), endA(b), endB(b));
      if (shared > 0.01) {
        out.push({
          severity: "error",
          code: "walls_overlap_collinear",
          message: `Walls ${a.id} and ${b.id} run on top of each other for ${Math.round(shared * 100)} cm.`,
          refs: [a.id, b.id],
          measurements: { overlap: r3(shared) },
        });
      } else if (crossesMidSpan(endA(a), endB(a), endA(b), endB(b))) {
        out.push({ severity: "error", code: "walls_cross", message: `Walls ${a.id} and ${b.id} cut through each other.`, refs: [a.id, b.id] });
      }
    }
  });
  if (walls.length < 2) return;
  for (const w of walls) {
    for (const end of [endA(w), endB(w)]) {
      const joined = walls.some(
        (o) => o !== w && (dist(end, endA(o)) < RULES.joinTolerance || dist(end, endB(o)) < RULES.joinTolerance || pointOnSeg(end, endA(o), endB(o), RULES.joinTolerance)),
      );
      if (!joined) {
        out.push({
          severity: "warning",
          code: "wall_loose_end",
          message: `Wall ${w.id} stops at (${end.x.toFixed(2)}, ${end.y.toFixed(2)}) without meeting another wall.`,
          refs: [w.id],
          measurements: { x: end.x, y: end.y },
        });
      }
    }
  }
}

function checkOpenings({ model, wallById, out }: Ctx) {
  const { walls, openings } = model;
  for (const o of openings) {
    const wall = wallById.get(o.wallId);
    if (!wall) {
      out.push({ severity: "error", code: "opening_orphan", message: `${o.kind} ${o.id} sits on wall ${o.wallId}, which does not exist.`, refs: [o.id] });
      continue;
    }
    const [t0, t1] = openingSpan(wall, o);
    if (t0 < -1e-6 || t1 > 1 + 1e-6) {
      out.push({
        severity: "error",
        code: "opening_overflow",
        message: `${o.kind} ${o.id} runs past the end of wall ${wall.id}.`,
        refs: [o.id, wall.id],
        measurements: { openingWidth: o.width, wallLength: r3(wallLength(wall)) },
      });
    }
    if (o.sill + o.height > wall.height + 1e-6) {
      out.push({
        severity: "error",
        code: "opening_too_tall",
        message: `${o.kind} ${o.id} reaches ${(o.sill + o.height).toFixed(2)} m, above wall ${wall.id} (${wall.height} m).`,
        refs: [o.id, wall.id],
        measurements: { top: r3(o.sill + o.height), wallHeight: wall.height },
      });
    }
    if (o.kind === "door" && o.width < RULES.minDoorWidth - 1e-6) {
      out.push({
        severity: "warning",
        code: "door_narrow",
        message: `Door ${o.id} is ${Math.round(o.width * 100)} cm wide; ${Math.round(RULES.minDoorWidth * 100)} cm or more is comfortable.`,
        refs: [o.id],
        measurements: { width: o.width, recommendedMinimum: RULES.minDoorWidth },
      });
    }
    for (const other of openings) {
      if (other.wallId !== o.wallId || other.id <= o.id) continue;
      const [s0, s1] = openingSpan(wall, other);
      if (Math.min(t1, s1) - Math.max(t0, s0) > 1e-6) {
        out.push({ severity: "error", code: "openings_overlap", message: `${o.kind} ${o.id} and ${other.kind} ${other.id} overlap on wall ${wall.id}.`, refs: [o.id, other.id, wall.id] });
      }
    }
    // another wall must not end in the middle of this hole
    for (const other of walls) {
      if (other === wall) continue;
      for (const end of [endA(other), endB(other)]) {
        if (!pointOnSeg(end, endA(wall), endB(wall), 0.02)) continue;
        const t = projectT(end, endA(wall), endB(wall));
        if (t > t0 + 0.01 && t < t1 - 0.01) {
          out.push({ severity: "error", code: "wall_ends_in_opening", message: `Wall ${other.id} ends inside ${o.kind} ${o.id}.`, refs: [other.id, o.id, wall.id] });
        }
      }
    }
  }
}

function checkRooms({ model, wallById, out }: Ctx) {
  const { walls, openings, rooms } = model;
  const near = (kind: Opening["kind"], r: Room) =>
    openings.some((o) => {
      const wall = o.kind === kind ? wallById.get(o.wallId) : undefined;
      return !!wall && distToOutline(openingCenter(wall, o), r) < 0.3;
    });
  for (const r of rooms) {
    if (r.w < 0.5 || r.h < 0.5) {
      out.push({ severity: "error", code: "room_too_small", message: `Room "${r.label}" is under 0.5 × 0.5 m.`, refs: [r.id], measurements: { width: r.w, depth: r.h } });
    }
    const bounded = roomCorners(r).some((c) => walls.some((w) => pointSegDist(c, endA(w), endB(w)) < 0.25));
    if (walls.length > 0 && !bounded) {
      out.push({ severity: "warning", code: "room_floating", message: `Room "${r.label}" has no walls around it.`, refs: [r.id] });
    }
    if (openings.length > 0 && !near("door", r)) {
      out.push({ severity: "warning", code: "room_no_door", message: `Room "${r.label}" has no door.`, refs: [r.id] });
    }
    if (walls.length > 0 && RULES.habitableLabel.test(r.label) && !near("window", r)) {
      out.push({ severity: "warning", code: "room_no_window", message: `"${r.label}" has no window for daylight.`, refs: [r.id] });
    }
  }
  rooms.forEach((a, i) => {
    for (const b of rooms.slice(i + 1)) {
      if (!rectsOverlap(a, b)) continue;
      out.push({
        severity: "error",
        code: "rooms_overlap",
        message: `Rooms "${a.label}" and "${b.label}" overlap.`,
        refs: [a.id, b.id],
        measurements: {
          overlapX: r3(Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)),
          overlapY: r3(Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)),
        },
      });
    }
  });
}

/** The footprint of a placed item; its front (local +y) faces the item's rotation. */
export function itemBox(it: { kind: string; x: number; y: number; rotation: number; w?: number; d?: number }): Box | null {
  const c = itemSize(it);
  return c ? { x: it.x, y: it.y, halfW: c.w / 2, halfD: c.d / 2, angle: (-it.rotation * Math.PI) / 180 } : null;
}

/** What of a piece stands on the floor: its footprint, or only its trunk for a tree whose crown spreads above. */
function groundBox(it: Item): Box | null {
  const box = itemBox(it);
  const trunk = catalogByKind(it.kind)?.trunk;
  return box && trunk ? { ...box, halfW: trunk / 2, halfD: trunk / 2 } : box;
}

function checkFurniture({ model, wallById, out }: Ctx) {
  const { walls, openings, rooms, items } = model;
  const wallBoxes = walls.map((w) => ({ w, box: wallBox(w) }));
  const clearances = openings.flatMap((o) => {
    const wall = wallById.get(o.wallId);
    if (!wall) return [];
    const c = openingCenter(wall, o);
    const box: Box = {
      x: c.x,
      y: c.y,
      halfW: o.width / 2 + RULES.openingSideClearance,
      halfD: wall.thickness / 2 + (o.kind === "door" ? RULES.doorClearDepth : RULES.windowClearDepth),
      angle: Math.atan2(wall.by - wall.ay, wall.bx - wall.ax),
    };
    return [{ o, box, depth: box.halfD - wall.thickness / 2 }];
  });
  // where each door's leaves swing: the width of the opening, as deep as a leaf is wide, on the
  // side the door opens to (a pair of leaves when the opening is wider than 1.25 m)
  const swings = openings.flatMap((o) => {
    const wall = wallById.get(o.wallId);
    if (!wall || o.kind !== "door") return [];
    const clear = o.width - 0.1;
    const leaf = clear > 1.15 ? clear / 2 : clear;
    const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
    const side = o.side === "left" ? -1 : 1;
    const n = { x: (-(wall.by - wall.ay) / len) * side, y: ((wall.bx - wall.ax) / len) * side };
    const c = openingCenter(wall, o);
    const off = wall.thickness / 2 + leaf / 2;
    const box: Box = { x: c.x + n.x * off, y: c.y + n.y * off, halfW: o.width / 2, halfD: leaf / 2, angle: Math.atan2(wall.by - wall.ay, wall.bx - wall.ax) };
    return [{ o, box }];
  });

  items.forEach((it, i) => {
    const cat = catalogByKind(it.kind);
    if (!cat) {
      out.push({ severity: "error", code: "item_unknown", message: `Item ${it.id} is of unknown kind "${it.kind}".`, refs: [it.id] });
      return;
    }
    const box = groundBox(it)!;
    const tall = itemSize(it)!.h;
    // paving, decks and pools are walked over: they run up to walls and past doors
    const ground = cat.category === "outdoor" && !!cat.isRug;
    // leaning on a wall is fine; more than 2 cm into it is not
    for (const { w, box: wb } of ground ? [] : wallBoxes) {
      if (boxesOverlap(box, wb, 0.02)) out.push({ severity: "error", code: "item_through_wall", message: `${cat.label} goes through wall ${w.id}.`, refs: [it.id, w.id] });
    }
    const blocking = new Set<string>();
    for (const { o, box: zone, depth } of ground ? [] : clearances) {
      if (!boxesOverlap(box, zone)) continue;
      if (o.kind === "door") {
        blocking.add(o.id);
        out.push({ severity: "error", code: "item_blocks_door", message: `${cat.label} is in the way of door ${o.id}.`, refs: [it.id, o.id], measurements: { clearanceDepth: r3(depth) } });
      } else if (tall > o.sill) {
        out.push({
          severity: "warning",
          code: "item_blocks_window",
          message: `${cat.label} (${tall} m tall) stands in front of window ${o.id} (sill ${o.sill} m).`,
          refs: [it.id, o.id],
          measurements: { itemHeight: tall, sill: o.sill },
        });
      }
    }
    // a door must be able to swing all the way open (a rug lies under it)
    for (const { o, box: sweep } of ground || cat.isRug ? [] : swings) {
      if (blocking.has(o.id) || !boxesOverlap(box, sweep)) continue;
      out.push({ severity: "error", code: "item_in_door_swing", message: `${cat.label} is where door ${o.id} swings open.`, refs: [it.id, o.id] });
    }
    for (const other of items.slice(i + 1)) {
      const oc = catalogByKind(other.kind);
      if (!oc || cat.isRug || oc.isRug) continue; // rugs lie under other pieces
      if (boxesOverlap(box, groundBox(other)!, 0.01)) {
        const [a, b] = it.id < other.id ? [it, other] : [other, it];
        out.push({ severity: "error", code: "items_overlap", message: `${cat.label} overlaps ${oc.label}.`, refs: [a.id, b.id] });
      }
    }
    // outdoor pieces (pools, loungers, trees…) and structure (railings, columns, pergolas) may stand outside the rooms
    if (rooms.length === 0 || cat.category === "outdoor" || cat.category === "structure") return;
    const host = roomAt(rooms, it);
    if (!rooms.some((r) => pointInRect(it, r, 0.05))) {
      out.push({ severity: "warning", code: "item_outside_rooms", message: `${cat.label} is not in any room.`, refs: [it.id] });
    } else if (host) {
      const protrusion = Math.max(0, ...boxCorners(box).map((p) => Math.max(host.x - p.x, p.x - (host.x + host.w), host.y - p.y, p.y - (host.y + host.h))));
      if (protrusion > RULES.roomEdgeTolerance) {
        out.push({
          severity: "warning",
          code: "item_outside_room",
          message: `${cat.label} sticks ${Math.round(protrusion * 100)} cm out of "${host.label}".`,
          refs: [it.id, host.id],
          measurements: { protrusion: r3(protrusion), tolerance: RULES.roomEdgeTolerance },
        });
      }
    }
  });
}

/**
 * A door must open onto floor. Upstairs, the stair from the floor below comes up through an
 * opening in the slab; a door whose clear zone (0.8 m either side) reaches over that opening
 * opens onto the drop.
 */
function checkStairwells(model: PlanModel, out: Draft[]) {
  const levels = levelsOf(model);
  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  levels.forEach((level, i) => {
    const below = levels[i - 1];
    if (!below) return;
    const wells = model.items
      .filter((it) => (it.level ?? levels[0].id) === below.id && !!catalogByKind(it.kind)?.stair)
      .flatMap((it) => {
        const b = itemBox(it);
        if (!b) return [];
        // the rectangle the stair's footprint covers, whichever way it turns
        const halfW = Math.abs(Math.cos(b.angle)) * b.halfW + Math.abs(Math.sin(b.angle)) * b.halfD;
        const halfD = Math.abs(Math.sin(b.angle)) * b.halfW + Math.abs(Math.cos(b.angle)) * b.halfD;
        return [{ it, box: { x: b.x, y: b.y, halfW, halfD, angle: 0 } as Box }];
      });
    if (!wells.length) return;
    for (const o of model.openings) {
      const wall = wallById.get(o.wallId);
      if (o.kind !== "door" || !wall || (wall.level ?? levels[0].id) !== level.id) continue;
      const c = openingCenter(wall, o);
      const zone: Box = { x: c.x, y: c.y, halfW: o.width / 2, halfD: wall.thickness / 2 + RULES.doorClearDepth, angle: Math.atan2(wall.by - wall.ay, wall.bx - wall.ax) };
      for (const { it, box } of wells) {
        if (!boxesOverlap(zone, box)) continue;
        out.push({ severity: "error", code: "door_onto_stairwell", message: `Door ${o.id} opens onto the stairwell of the stair coming up from ${below.name.toLowerCase()}.`, refs: [o.id, it.id] });
      }
    }
  });
}

/**
 * Can a person walk through each furnished room, door to door, with a comfortable path
 * (RULES.walkPath)? The door clear zones catch furniture right in a doorway; this catches a
 * room so full, or so cut in two, that nobody could cross it.
 */
function checkWalkable(model: PlanModel, out: Draft[]) {
  const path = RULES.walkPath;
  for (const b of blockedRooms(model, path / 2)) {
    const pct = Math.round(b.reach * 100);
    out.push({
      severity: "warning",
      code: "room_not_walkable",
      message: b.doors.length
        ? `Furniture in "${b.room}" leaves no ${path} m path from one door to ${b.doors.length === 1 ? "another" : "the others"}.`
        : `Furniture in "${b.room}" leaves too little room to walk: only ${pct}% of its free floor can be reached from the door with a ${path} m path.`,
      refs: [b.roomId, ...b.doors],
      measurements: { reach: Math.round(b.reach * 100) / 100, minReach: MIN_REACH, path },
    });
  }
}

export function checkModel(model: PlanModel): Issue[] {
  const broken = checkNumbers(model);
  if (broken.length) return assignIds(broken);
  const out: Draft[] = [];
  // geometry is checked floor by floor: a wall upstairs never collides with a sofa downstairs
  for (const level of levelsOf(model)) {
    const here = onLevel(model, level.id);
    const ctx: Ctx = { model: here, wallById: new Map(model.walls.map((w) => [w.id, w])), out };
    checkWalls(ctx);
    checkOpenings(ctx);
    checkRooms(ctx);
    checkFurniture(ctx);
  }
  // openings whose wall is missing belong to no floor: check them against the whole design
  const orphans = model.openings.filter((o) => !model.walls.some((w) => w.id === o.wallId));
  if (orphans.length) checkOpenings({ model: { ...model, walls: [], rooms: [], items: [], openings: orphans }, wallById: new Map(), out });
  checkStairwells(model, out);
  checkWalkable(model, out);
  out.push(...reviewFindings(model));
  return assignIds(out);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export function summarizeIssues(issues: Issue[]): { error: number; warning: number; info: number } {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return counts;
}

/** Which findings a change resolved, kept, or introduced — compared by id. */
export function diffIssues(before: Issue[], after: Issue[]): { resolved: Issue[]; remaining: Issue[]; introduced: Issue[] } {
  const was = new Set(before.map((i) => i.id));
  const now = new Set(after.map((i) => i.id));
  return {
    resolved: before.filter((i) => !now.has(i.id)),
    remaining: after.filter((i) => was.has(i.id)),
    introduced: after.filter((i) => !was.has(i.id)),
  };
}
