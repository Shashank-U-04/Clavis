/**
 * Furnishing: room-type recipes placed one piece at a time, each piece kept only when the
 * constraint engine finds no new collision, blocked door or window, or protrusion.
 *
 * Pieces that relate to each other (nightstands beside a bed, a coffee table in front of a
 * sofa, chairs around a table) are positioned relative to their anchor, so the result reads
 * like a furnished room rather than a scatter of objects.
 */

import type { Opening, PlanModel, Room, Wall } from "../../model/types";
import { catalogByKind, type CatalogEntry } from "../../model/catalog";
import { segPoint } from "../../model/geometry";
import { roomTypes, type RoomType } from "../../model/analysis";
import { Trial } from "./trial";

export type Side = "north" | "south" | "east" | "west";
export const SIDES: Side[] = ["north", "south", "east", "west"];
const ROT: Record<Side, number> = { north: 0, south: 180, west: 90, east: 270 };
const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** Which room types a catalog category belongs in. */
export const CATEGORY_ROOM: Record<string, RoomType[]> = {
  living: ["living"],
  bedroom: ["bedroom"],
  kitchen: ["kitchen", "dining"],
  bath: ["bath"],
  office: ["study", "bedroom"],
  decor: ["living", "hall"],
};

export interface Pose {
  x: number;
  y: number;
  rotation: number;
  side?: Side;
}

interface Placed extends Pose {
  kind: string;
  cat: CatalogEntry;
}

const rad = (d: number) => (d * Math.PI) / 180;
/** unit vector the front of a piece faces (rotation 0 faces south, +y) */
export const facing = (rot: number) => ({ x: Math.sin(rad(rot)), y: Math.cos(rad(rot)) });
/** unit vector along the piece's width */
const across = (rot: number) => ({ x: Math.cos(rad(rot)), y: -Math.sin(rad(rot)) });
/** rotation whose facing vector points along v */
const rotToward = (v: { x: number; y: number }) => Math.round(((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360);

const add = (p: { x: number; y: number }, v: { x: number; y: number }, s: number) => ({ x: p.x + v.x * s, y: p.y + v.y * s });

/** Centre and rotation of a piece whose back sits against one side of a room. */
export function againstPose(room: Room, cat: CatalogEntry, side: Side, t: number, gap = 0): Pose | null {
  const { w, d } = cat;
  if (side === "north" || side === "south") {
    if (w > room.w + 1e-6 || d + gap > room.h + 1e-6) return null;
    const x = room.x + w / 2 + t * (room.w - w);
    const y = side === "north" ? room.y + gap + d / 2 : room.y + room.h - gap - d / 2;
    return { x, y, rotation: ROT[side], side };
  }
  if (w > room.h + 1e-6 || d + gap > room.w + 1e-6) return null;
  const y = room.y + w / 2 + t * (room.h - w);
  const x = side === "west" ? room.x + gap + d / 2 : room.x + room.w - gap - d / 2;
  return { x, y, rotation: ROT[side], side };
}

/** t (0..1) that centres a piece of width w at `along` on a side of the room. */
function tFor(room: Room, side: Side, w: number, along: number): number {
  const [start, span] = side === "north" || side === "south" ? [room.x, room.w] : [room.y, room.h];
  if (span - w <= 1e-6) return 0.5;
  return Math.min(1, Math.max(0, (along - start - w / 2) / (span - w)));
}

/** Openings whose centre lies on one side of a room (within the wall's half thickness). */
export function openingsOnSide(model: PlanModel, room: Room, side: Side): Opening[] {
  const walls = new Map<string, Wall>(model.walls.map((w) => [w.id, w]));
  return model.openings.filter((o) => {
    const wall = walls.get(o.wallId);
    if (!wall) return false;
    const c = segPoint({ x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by }, o.t);
    const tol = wall.thickness / 2 + 0.08;
    switch (side) {
      case "north":
        return Math.abs(c.y - room.y) <= tol && c.x >= room.x - tol && c.x <= room.x + room.w + tol;
      case "south":
        return Math.abs(c.y - (room.y + room.h)) <= tol && c.x >= room.x - tol && c.x <= room.x + room.w + tol;
      case "west":
        return Math.abs(c.x - room.x) <= tol && c.y >= room.y - tol && c.y <= room.y + room.h + tol;
      case "east":
        return Math.abs(c.x - (room.x + room.w)) <= tol && c.y >= room.y - tol && c.y <= room.y + room.h + tol;
    }
  });
}

type Prefer = "solid" | "window" | "any";

function sidesBy(model: PlanModel, room: Room, prefer: Prefer): Side[] {
  const score = (s: Side) => {
    const os = openingsOnSide(model, room, s);
    const doors = os.filter((o) => o.kind === "door").length;
    const windows = os.length - doors;
    const len = s === "north" || s === "south" ? room.w : room.h;
    if (prefer === "window") return (windows > 0 ? -10 : 0) + doors * 3 - len * 0.1;
    if (prefer === "solid") return doors * 4 + windows * 2 - len * 0.1;
    return doors * 2 - len * 0.1;
  };
  return [...SIDES].sort((a, b) => score(a) - score(b) || SIDES.indexOf(a) - SIDES.indexOf(b));
}

const ALONG = [0.5, 0.15, 0.85, 0, 1, 0.3, 0.7, 0.4, 0.6];

function wallPoses(model: PlanModel, room: Room, cat: CatalogEntry, prefer: Prefer, along = ALONG): Pose[] {
  const out: Pose[] = [];
  for (const side of sidesBy(model, room, prefer)) {
    for (const t of along) {
      const p = againstPose(room, cat, side, t);
      if (p) out.push(p);
    }
  }
  return out;
}

function gridPoses(room: Room, rotations: number[]): Pose[] {
  const fr = [0.5, 0.35, 0.65, 0.25, 0.75];
  const out: Pose[] = [];
  for (const fy of fr) for (const fx of fr) for (const rotation of rotations) out.push({ x: room.x + room.w * fx, y: room.y + room.h * fy, rotation });
  return out;
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

type Step =
  | { kind: string; at: "wall"; prefer: Prefer; as?: string; along?: number[] }
  | { kind: string; at: "grid"; as?: string }
  /** a table placed together with its chairs: the most chairs that fit wins */
  | { kind: string; at: "set"; chairs: number; chairKind: string }
  | { kind: string; at: "near"; to: string; as?: string; poses: (a: Placed, cat: CatalogEntry, room: Room) => Pose[] };

const longAxisRotations = (room: Room) => (room.w >= room.h ? [0, 90] : [90, 0]);

function bedside(bed: Placed, ns: CatalogEntry, sign: 1 | -1): Pose[] {
  const back = add(bed, facing(bed.rotation), -bed.cat.d / 2 + ns.d / 2);
  return [{ ...add(back, across(bed.rotation), sign * (bed.cat.w / 2 + ns.w / 2 + 0.05)), rotation: bed.rotation }];
}

function inFront(a: Placed, cat: CatalogEntry, gap: number, rotation = a.rotation): Pose[] {
  return [0, 0.15, -0.15].map((shift) => ({
    ...add(add(a, facing(a.rotation), a.cat.d / 2 + gap + cat.d / 2), across(a.rotation), shift),
    rotation,
  }));
}

function chairsAround(table: Placed, chair: CatalogEntry, count: number): Pose[][] {
  const f = facing(table.rotation);
  const r = across(table.rotation);
  const off = table.cat.d / 2 + chair.d / 2 + 0.03;
  const spread = count >= 6 ? [-0.6, 0, 0.6] : count >= 4 ? [-0.38, 0.38] : [0];
  const poses: Pose[] = [];
  for (const s of [1, -1]) {
    for (const k of spread) {
      const p = add(add(table, f, s * off), r, k);
      poses.push({ ...p, rotation: rotToward({ x: table.x - p.x, y: table.y - p.y }) });
    }
  }
  return poses.slice(0, count).map((p) => [p]);
}

function recipe(types: RoomType[], room: Room): Step[] {
  const area = room.w * room.h;
  const short = Math.min(room.w, room.h);
  const steps: Step[] = [];
  const has = (t: RoomType) => types.includes(t);

  if (has("kitchen")) {
    steps.push({ kind: area >= 6 ? "kitchen_counter" : "counter_unit", at: "wall", prefer: "solid", as: "counter" });
    steps.push({ kind: "fridge", at: "wall", prefer: "solid", along: [0, 1, 0.85, 0.15] });
  }
  if (has("living")) {
    steps.push({ kind: area >= 16 && short >= 3.2 ? "sofa_3" : "sofa", at: "wall", prefer: "solid", as: "sofa" });
    steps.push({ kind: "rug", at: "near", to: "sofa", poses: (s, c) => inFront(s, c, 0.1) });
    steps.push({ kind: "coffee_table", at: "near", to: "sofa", as: "table", poses: (s, c) => inFront(s, c, 0.45) });
    steps.push({
      kind: "tv_stand",
      at: "near",
      to: "sofa",
      poses: (s, c, rm) => {
        if (!s.side) return [];
        const side = OPPOSITE[s.side];
        const along = side === "north" || side === "south" ? s.x : s.y;
        return [0, 0.4, -0.4, 0.8, -0.8]
          .map((shift) => againstPose(rm, c, side, tFor(rm, side, c.w, along + shift)))
          .filter((p): p is Pose => !!p);
      },
    });
    steps.push({
      kind: "armchair",
      at: "near",
      to: "table",
      poses: (t, c) =>
        ([1, -1] as const).map((sgn) => {
          const p = add(t, across(t.rotation), sgn * (t.cat.w / 2 + 0.3 + c.d / 2));
          return { ...p, rotation: rotToward({ x: t.x - p.x, y: t.y - p.y }) };
        }),
    });
    if (area >= 14) steps.push({ kind: "bookshelf", at: "wall", prefer: "solid" });
    steps.push({ kind: "plant", at: "wall", prefer: "window", along: [0, 1] });
  }
  if (has("dining") || (has("kitchen") && area >= 12 && short >= 3)) {
    const big = area >= (has("living") ? 30 : 14);
    steps.push({ kind: big ? "dining_table_oval" : "dining_table", at: "set", chairs: big ? 6 : 4, chairKind: "dining_chair" });
    if (has("dining") && !has("living") && area >= 10) steps.push({ kind: "sideboard", at: "wall", prefer: "solid" });
  }
  if (types[0] === "bedroom") {
    const double = short >= 2.8 && area >= 9;
    steps.push({ kind: double ? "bed_double" : "bed_single", at: "wall", prefer: "solid", as: "bed", along: [0.5, 0.35, 0.65, 0.2, 0.8, 0, 1] });
    steps.push({ kind: "nightstand", at: "near", to: "bed", poses: (b, c) => [...bedside(b, c, 1), ...bedside(b, c, -1)] });
    if (double) steps.push({ kind: "nightstand", at: "near", to: "bed", poses: (b, c) => [...bedside(b, c, -1), ...bedside(b, c, 1)] });
    steps.push({ kind: "wardrobe", at: "wall", prefer: "solid", along: [0, 1, 0.5, 0.2, 0.8] });
    if (area >= 12) {
      steps.push({ kind: "desk", at: "wall", prefer: "window", as: "desk" });
      steps.push({ kind: "office_chair", at: "near", to: "desk", poses: (d, c) => inFront(d, c, 0.05, (d.rotation + 180) % 360) });
    }
  }
  if (types[0] === "study" || (has("study") && types[0] !== "bedroom")) {
    steps.push({ kind: "desk", at: "wall", prefer: "window", as: "desk" });
    steps.push({ kind: "office_chair", at: "near", to: "desk", poses: (d, c) => inFront(d, c, 0.05, (d.rotation + 180) % 360) });
    steps.push({ kind: "bookshelf", at: "wall", prefer: "solid" });
  }
  if (types[0] === "bath") {
    const long = Math.max(room.w, room.h);
    if (long >= 2.2 && area >= 4.2) steps.push({ kind: "bathtub", at: "wall", prefer: "solid", along: [0, 1, 0.5] });
    else steps.push({ kind: "shower", at: "wall", prefer: "solid", along: [0, 1] });
    steps.push({ kind: "toilet", at: "wall", prefer: "any", along: [1, 0, 0.8, 0.2, 0.5] });
    steps.push({ kind: "sink", at: "wall", prefer: "any" });
    if (area >= 4) steps.push({ kind: "towel_rail", at: "wall", prefer: "solid" });
  }
  return steps;
}

export interface FurnishReport {
  room: Room;
  placed: string[];
  skipped: string[];
}

/** Furnish one room on the trial model. Returns what was placed and what did not fit. */
export function furnishRoom(trial: Trial, roomId: string, opts: { onlyKinds?: string[] } = {}): FurnishReport | null {
  const room = trial.model.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const types = roomTypes(room.label);
  const anchors = new Map<string, Placed>();
  const placed: string[] = [];
  const skipped: string[] = [];
  for (const [zone, zoneTypes] of zones(room, types)) {
    let steps = recipe(zoneTypes, zone);
    if (opts.onlyKinds) steps = steps.filter((s) => opts.onlyKinds!.includes(s.kind) || s.at === "near");
    runSteps(trial, zone, steps, anchors, placed, skipped);
  }
  return { room, placed, skipped };
}

/**
 * An open-plan room is furnished as zones: the living area at one end of its long axis and
 * the kitchen / dining area at the other, so the sofa and the counters do not compete for
 * the same wall. The zone boundary is not a wall; a sofa may back onto it as a divider.
 */
function zones(room: Room, types: RoomType[]): [Room, RoomType[]][] {
  const rest = types.filter((t) => t !== "living");
  if (!types.includes("living") || rest.length === 0 || room.w * room.h < 18) return [[room, types]];
  const split = 0.55;
  if (room.w >= room.h) {
    const a = { ...room, w: room.w * split };
    const b = { ...room, x: room.x + room.w * split, w: room.w * (1 - split) };
    return [[a, ["living"]], [b, rest]];
  }
  const a = { ...room, h: room.h * split };
  const b = { ...room, y: room.y + room.h * split, h: room.h * (1 - split) };
  return [[a, ["living"]], [b, rest]];
}

function runSteps(trial: Trial, room: Room, steps: Step[], anchors: Map<string, Placed>, placed: string[], skipped: string[]) {
  for (const step of steps) {
    const cat = catalogByKind(step.kind);
    if (!cat) continue;
    let poses: Pose[];
    if (step.at === "set") {
      const n = placeSet(trial, room, cat, step.chairs, step.chairKind);
      if (n === null) skipped.push(cat.label);
      else {
        placed.push(cat.label);
        if (n > 0) placed.push(`${n} × ${catalogByKind(step.chairKind)?.label ?? step.chairKind}`);
        if (n < step.chairs) skipped.push(`${step.chairs - n} × ${catalogByKind(step.chairKind)?.label ?? step.chairKind}`);
      }
      continue;
    }
    if (step.at === "near") {
      const a = anchors.get(step.to);
      if (!a) continue;
      poses = step.poses(a, cat, room);
    } else if (step.at === "grid") {
      poses = gridPoses(room, longAxisRotations(room));
    } else {
      poses = wallPoses(trial.model, room, cat, step.prefer, step.along);
    }
    const chosen = placeFirst(trial, step.kind, poses);
    if (chosen) {
      placed.push(cat.label);
      if (step.as) anchors.set(step.as, { ...chosen, kind: step.kind, cat });
    } else if (step.at !== "near" || anchors.has(step.to)) {
      skipped.push(cat.label);
    }
  }
}

const snap5 = (v: number) => Math.round(v * 20) / 20;
const itemOp = (kind: string, p: Pose) => ({ op: "place_item", kind, x: snap5(p.x), y: snap5(p.y), rotation: Math.round(p.rotation) % 360 });

/** A table with as many of its chairs as fit; null when even the table alone does not fit. */
function placeSet(trial: Trial, room: Room, table: CatalogEntry, chairs: number, chairKind: string): number | null {
  const chair = catalogByKind(chairKind);
  if (!chair) return null;
  const poses = gridPoses(room, longAxisRotations(room));
  for (const n of [chairs, Math.min(chairs, 4), 2, 0]) {
    for (const p of poses) {
      const t = { ...p, x: snap5(p.x), y: snap5(p.y) };
      const ops = [itemOp(table.kind, t), ...chairsAround({ ...t, kind: table.kind, cat: table }, chair, n).flat().map((c) => itemOp(chairKind, c))];
      const r = trial.try(ops);
      if (r.ok && r.introduced.length === 0) {
        trial.accept(ops, r);
        return n;
      }
    }
  }
  return null;
}

/** Place a piece at the first pose the validator accepts. Positions are pre-snapped to 5 cm. */
export function placeFirst(trial: Trial, kind: string, poses: Pose[]): Pose | null {
  const snap = (v: number) => Math.round(v * 20) / 20;
  for (const p of poses) {
    const op = { op: "place_item", kind, x: snap(p.x), y: snap(p.y), rotation: Math.round(p.rotation) % 360 };
    const r = trial.try([op]);
    if (r.ok && r.introduced.length === 0) {
      trial.accept([op], r);
      return { ...p, x: op.x, y: op.y };
    }
  }
  return null;
}

/** Candidate poses for one piece in a room, used by "add a desk to the study". */
export function posesFor(model: PlanModel, room: Room, cat: CatalogEntry, side?: Side): Pose[] {
  const prefer: Prefer = cat.tags?.includes("study") ? "window" : "solid";
  const wall = side
    ? ALONG.map((t) => againstPose(room, cat, side, t)).filter((p): p is Pose => !!p)
    : wallPoses(model, room, cat, prefer);
  if (side) return wall;
  const free = cat.tags?.includes("table") || cat.isRug || cat.kind.startsWith("dining") ? gridPoses(room, longAxisRotations(room)) : [];
  return cat.tags?.includes("table") && !cat.kind.includes("side") ? [...free, ...wall] : [...wall, ...free];
}
