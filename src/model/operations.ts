/**
 * The canonical operation pipeline.
 *
 * Every change to a design — a drag in the 2D editor, an inspector field, or an operation the
 * assistant proposes — is expressed as a `DesignOperation`, validated against the schemas
 * below, and applied by the pure functions in this module. Nothing here touches the store or
 * the DOM, so the same code previews a proposal (dry run) and commits it.
 *
 * Preconditions enforced here (an operation that violates one is rejected and changes nothing):
 *  - input matches the schema (finite numbers inside sane bounds, known enums);
 *  - every entity reference resolves to exactly one existing entity (exact ids only);
 *  - doors and windows fit inside their host wall and under its height;
 *  - walls keep a minimum length and still host their openings after an edit;
 *  - furniture kinds exist in the catalog.
 * Layout quality (overlaps, collisions, blocked doors…) is NOT a precondition: it is reported
 * by the constraint engine (issues.ts) so the person can see and repair it.
 */

import { z } from "zod";
import type { Item, Opening, PlanModel, Room, Wall } from "./types";
import { emptyModel } from "./types";
import { segLen, snap } from "./geometry";
import { clampOpeningT } from "./issues";
import { CATALOG, catalogByKind, ITEM_SIZE_LIMITS } from "./catalog";
import { buildLayout, FLOOR_FINISHES, LayoutSpecSchema, SIDES } from "./layout";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const coord = z.number().finite().min(-200).max(200);
const metres = (min: number, max: number) => z.number().finite().min(min).max(max);
const degrees = z.number().finite().min(-720).max(720).describe("degrees, counterclockwise on the plan");
const ref = z
  .string()
  .min(1)
  .max(80)
  .regex(/^\$?[A-Za-z0-9_:.-]+$/)
  .describe("exact entity id, or $alias for an entity created earlier in the same batch");
const alias = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/)
  .describe("optional name for the created entity; later operations in the batch can reference it as $name");
const label = z.string().trim().min(1).max(60);
const floor = z.enum(FLOOR_FINISHES);
const catalogKind = z.enum(CATALOG.map((c) => c.kind) as [string, ...string[]]);
const along = z.number().finite().min(0).max(1);

export const OPERATION_SCHEMAS = {
  add_wall: z
    .object({
      op: z.literal("add_wall"),
      as: alias.optional(),
      ax: coord, ay: coord, bx: coord, by: coord,
      thickness: metres(0.05, 0.5).optional().describe("default 0.15 m"),
      height: metres(2.1, 5).optional().describe("default 2.7 m"),
    })
    .strict()
    .describe("Add a straight wall between two points (metres, snapped to 5 cm)."),
  update_wall: z
    .object({
      op: z.literal("update_wall"),
      id: ref,
      ax: coord.optional(), ay: coord.optional(), bx: coord.optional(), by: coord.optional(),
      thickness: metres(0.05, 0.5).optional(),
      height: metres(2.1, 5).optional(),
    })
    .strict()
    .describe("Move a wall's endpoints or change its thickness/height. Hosted openings keep their relative position."),
  remove_wall: z
    .object({ op: z.literal("remove_wall"), id: ref })
    .strict()
    .describe("Delete a wall and every door and window it hosts."),
  add_opening: z
    .object({
      op: z.literal("add_opening"),
      as: alias.optional(),
      kind: z.enum(["door", "window"]),
      wallId: ref,
      t: along.optional().describe("centre position along the wall, 0 = start (a), 1 = end (b)"),
      offset: metres(0, 200).optional().describe("alternative to t: metres from the wall's start (a) to the opening centre"),
      width: metres(0.3, 4).optional().describe("default door 0.9 m, window 1.2 m"),
      height: metres(0.3, 3).optional(),
      sill: metres(0, 2).optional().describe("windows only; default 0.9 m"),
      hinge: z.enum(["a", "b"]).optional(),
      side: z.enum(["left", "right"]).optional(),
    })
    .strict()
    .describe("Add a door or window on a wall. It must fit inside the wall."),
  update_opening: z
    .object({
      op: z.literal("update_opening"),
      id: ref,
      t: along.optional(),
      offset: metres(0, 200).optional(),
      width: metres(0.3, 4).optional(),
      height: metres(0.3, 3).optional(),
      sill: metres(0, 2).optional(),
      hinge: z.enum(["a", "b"]).optional(),
      side: z.enum(["left", "right"]).optional(),
    })
    .strict()
    .describe("Move or resize a door/window along its wall, or change a door's swing."),
  remove_opening: z
    .object({ op: z.literal("remove_opening"), id: ref })
    .strict()
    .describe("Delete a door or window."),
  add_room: z
    .object({
      op: z.literal("add_room"),
      as: alias.optional(),
      x: coord, y: coord,
      w: metres(0.5, 50), h: metres(0.5, 50),
      label,
      floor: floor.optional(),
    })
    .strict()
    .describe("Add a room floor rectangle (x, y = north-west corner). Does not create walls."),
  update_room: z
    .object({
      op: z.literal("update_room"),
      id: ref,
      x: coord.optional(), y: coord.optional(),
      w: metres(0.5, 50).optional(), h: metres(0.5, 50).optional(),
      label: label.optional(),
      floor: floor.optional(),
    })
    .strict()
    .describe("Move, resize, relabel or refinish a room rectangle."),
  remove_room: z
    .object({ op: z.literal("remove_room"), id: ref })
    .strict()
    .describe("Delete a room rectangle (walls stay)."),
  place_item: z
    .object({
      op: z.literal("place_item"),
      as: alias.optional(),
      kind: catalogKind,
      x: coord, y: coord,
      rotation: degrees.optional().describe("which way the piece faces: 0 = south (+y), 90 = east, 180 = north, 270 = west"),
    })
    .strict()
    .describe("Place a catalog item with its centre at (x, y)."),
  place_item_in_room: z
    .object({
      op: z.literal("place_item_in_room"),
      as: alias.optional(),
      kind: catalogKind,
      roomId: ref,
      against: z.enum([...SIDES, "center"]).describe("the room wall the item's back sits against, or center"),
      along: along.optional().describe("0..1 position along that wall (west→east or north→south), default 0.5"),
      gap: metres(0, 1).optional().describe("clearance between the wall face and the item's back, default 0"),
      rotation: degrees.optional().describe("only for against=center"),
    })
    .strict()
    .describe("Place a catalog item flush against one wall of a room (rotation and position computed exactly)."),
  move_item: z
    .object({
      op: z.literal("move_item"),
      id: ref,
      x: coord.optional(), y: coord.optional(),
      rotation: degrees.optional(),
    })
    .strict()
    .describe("Move and/or rotate a furniture item."),
  resize_item: z
    .object({
      op: z.literal("resize_item"),
      id: ref,
      w: metres(ITEM_SIZE_LIMITS.min, ITEM_SIZE_LIMITS.maxPlan).optional().describe("width across the front"),
      d: metres(ITEM_SIZE_LIMITS.min, ITEM_SIZE_LIMITS.maxPlan).optional().describe("depth, front to back"),
      h: metres(ITEM_SIZE_LIMITS.min, ITEM_SIZE_LIMITS.maxHeight).optional().describe("height"),
      reset: z.boolean().optional().describe("true puts the piece back to its catalog size"),
    })
    .strict()
    .describe("Change a furniture item's own width, depth or height (or reset it to the catalog size)."),
  remove_item: z
    .object({ op: z.literal("remove_item"), id: ref })
    .strict()
    .describe("Delete a furniture item."),
  rename_plan: z
    .object({ op: z.literal("rename_plan"), name: z.string().trim().min(1).max(80) })
    .strict()
    .describe("Rename the design."),
  build_layout: LayoutSpecSchema.extend({ op: z.literal("build_layout") })
    .strict()
    .describe(
      "Replace the whole plan with a new layout generated deterministically from a room program: rooms as rectangles on wall centrelines (they must tile without overlapping; shared edges become interior walls), doors between named rooms or to the exterior, windows on exterior sides. Removes existing furniture.",
    ),
  clear_plan: z
    .object({ op: z.literal("clear_plan") })
    .strict()
    .describe("Erase every wall, opening, room and item."),
} as const;

export type OperationName = keyof typeof OPERATION_SCHEMAS;
export const OperationSchema = z.discriminatedUnion(
  "op",
  Object.values(OPERATION_SCHEMAS) as unknown as [
    (typeof OPERATION_SCHEMAS)[OperationName],
    ...(typeof OPERATION_SCHEMAS)[OperationName][],
  ],
);

export type DesignOperation = z.infer<typeof OperationSchema>;

/** Operations that delete user work. They always need explicit human confirmation. */
export function isDestructive(op: DesignOperation, model?: PlanModel): boolean {
  switch (op.op) {
    case "remove_wall":
    case "remove_opening":
    case "remove_room":
    case "remove_item":
    case "clear_plan":
      return true;
    case "build_layout":
      return !model || model.walls.length + model.rooms.length + model.items.length > 0;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface OpError {
  code: "invalid_input" | "not_found" | "precondition_failed";
  message: string;
}

export interface StepResult {
  index: number;
  op: string;
  ok: boolean;
  summary: string;
  changed: string[];
  created?: string;
  notes?: string[];
  error?: OpError;
}

export interface BatchOutcome {
  ok: boolean;
  /** the resulting model on success; the untouched input model on failure */
  model: PlanModel;
  steps: StepResult[];
  changed: string[];
  /** alias → created id, for every `as` in the batch (and every room a build_layout created) */
  created: Record<string, string>;
  failedIndex?: number;
  error?: OpError;
}

export interface ApplyContext {
  newId: (prefix: string) => string;
  refs: Map<string, string>;
}

type Applied = { ok: true; model: PlanModel; summary: string; changed: string[]; created?: string; notes?: string[]; refs?: Record<string, string> };
type Failed = { ok: false; error: OpError };

const done = (model: PlanModel, summary: string, changed: string[], extra: Partial<Applied> = {}): Applied => ({
  ok: true,
  model,
  summary,
  changed,
  ...extra,
});
const reject = (code: OpError["code"], message: string): Failed => ({ ok: false, error: { code, message } });

const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
const normDeg = (d: number) => round(((d % 360) + 360) % 360, 2);

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function resolve(ctx: ApplyContext, r: string): string {
  return r.startsWith("$") ? (ctx.refs.get(r.slice(1)) ?? r) : r;
}

function find<T extends { id: string }>(list: T[], ctx: ApplyContext, r: string, what: string): T | Failed {
  const id = resolve(ctx, r);
  if (r.startsWith("$") && id === r) return reject("not_found", `No ${what} was created as "${r}" earlier in this batch.`);
  const hit = list.find((e) => e.id === id);
  return hit ?? reject("not_found", `${what[0].toUpperCase()}${what.slice(1)} "${r}" does not exist. Use an exact id.`);
}
const isFail = (v: unknown): v is Failed => typeof v === "object" && v !== null && (v as Failed).ok === false;

/** Position of an opening along its wall from t or offset (metres); null when neither was given. */
function positionT(wall: Wall, t: number | undefined, offset: number | undefined): number | null | Failed {
  if (t !== undefined && offset !== undefined) return reject("invalid_input", "Give either t or offset, not both.");
  if (offset !== undefined) {
    const len = segLen(wall.ax, wall.ay, wall.bx, wall.by);
    if (offset > len) return reject("precondition_failed", `Offset ${offset} m is beyond the end of wall ${wall.id} (${len.toFixed(2)} m).`);
    return offset / len;
  }
  return t ?? null;
}

/** Fit an opening on a wall: clamp t, check width and height. */
function fitOpening(wall: Wall, o: Opening): { t: number; shifted: boolean } | Failed {
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by);
  const t = clampOpeningT(wall, o.width, o.t);
  if (t === null)
    return reject("precondition_failed", `Wall ${wall.id} is ${len.toFixed(2)} m long — a ${o.width.toFixed(2)} m ${o.kind} does not fit.`);
  if (o.sill + o.height > wall.height + 1e-6)
    return reject("precondition_failed", `The ${o.kind} top (${(o.sill + o.height).toFixed(2)} m) would exceed wall ${wall.id}'s height (${wall.height} m).`);
  return { t: round(t, 4), shifted: Math.abs(t - o.t) > 1e-4 };
}

export function applyOperation(model: PlanModel, op: DesignOperation, ctx: ApplyContext): Applied | Failed {
  switch (op.op) {
    case "add_wall": {
      const w: Wall = {
        id: ctx.newId("wall"),
        ax: snap(op.ax), ay: snap(op.ay), bx: snap(op.bx), by: snap(op.by),
        thickness: op.thickness ?? 0.15,
        height: op.height ?? 2.7,
      };
      const len = segLen(w.ax, w.ay, w.bx, w.by);
      if (len < 0.2) return reject("precondition_failed", `Wall too short (${(len * 100).toFixed(0)} cm after snapping; minimum 20 cm).`);
      return done({ ...model, walls: [...model.walls, w] }, `Wall ${w.id} added (${len.toFixed(2)} m).`, [w.id], { created: w.id });
    }

    case "update_wall": {
      const wall = find(model.walls, ctx, op.id, "wall");
      if (isFail(wall)) return wall;
      const next: Wall = { ...wall };
      for (const k of ["ax", "ay", "bx", "by"] as const) if (op[k] !== undefined) next[k] = snap(op[k]!);
      if (op.thickness !== undefined) next.thickness = op.thickness;
      if (op.height !== undefined) next.height = op.height;
      const len = segLen(next.ax, next.ay, next.bx, next.by);
      if (len < 0.2) return reject("precondition_failed", `Wall ${wall.id} would be ${(len * 100).toFixed(0)} cm long; minimum 20 cm.`);
      const changed = [wall.id];
      const notes: string[] = [];
      const openings: Opening[] = [];
      for (const o of model.openings) {
        if (o.wallId !== wall.id) {
          openings.push(o);
          continue;
        }
        const fit = fitOpening(next, o);
        if (isFail(fit))
          return reject("precondition_failed", `${fit.error.message} Move, resize or remove ${o.kind} ${o.id} first.`);
        if (fit.shifted) {
          changed.push(o.id);
          notes.push(`${o.kind} ${o.id} shifted to t=${fit.t.toFixed(2)} to stay inside the wall.`);
        }
        openings.push({ ...o, t: fit.t });
      }
      return done(
        { ...model, walls: model.walls.map((w) => (w.id === wall.id ? next : w)), openings },
        `Wall ${wall.id} updated (${len.toFixed(2)} m).`,
        changed,
        { notes },
      );
    }

    case "remove_wall": {
      const wall = find(model.walls, ctx, op.id, "wall");
      if (isFail(wall)) return wall;
      const hosted = model.openings.filter((o) => o.wallId === wall.id).map((o) => o.id);
      return done(
        { ...model, walls: model.walls.filter((w) => w.id !== wall.id), openings: model.openings.filter((o) => o.wallId !== wall.id) },
        `Wall ${wall.id} removed${hosted.length ? ` with ${hosted.length} opening(s)` : ""}.`,
        [wall.id, ...hosted],
      );
    }

    case "add_opening": {
      const wall = find(model.walls, ctx, op.wallId, "wall");
      if (isFail(wall)) return wall;
      const door = op.kind === "door";
      const pos = positionT(wall, op.t, op.offset);
      if (isFail(pos)) return pos;
      const draft: Opening = {
        id: ctx.newId(op.kind),
        kind: op.kind,
        wallId: wall.id,
        t: pos ?? 0.5,
        width: op.width ?? (door ? 0.9 : 1.2),
        sill: door ? 0 : (op.sill ?? 0.9),
        height: op.height ?? (door ? 2.1 : 1.2),
      };
      if (door) {
        draft.hinge = op.hinge ?? "a";
        draft.side = op.side ?? "right";
      }
      const fit = fitOpening(wall, draft);
      if (isFail(fit)) return fit;
      draft.t = fit.t;
      const notes = fit.shifted ? [`Shifted to t=${fit.t.toFixed(2)} so the whole opening fits inside the wall.`] : undefined;
      return done(
        { ...model, openings: [...model.openings, draft] },
        `${door ? "Door" : "Window"} ${draft.id} (${draft.width} m) added on wall ${wall.id} at t=${fit.t.toFixed(2)}.`,
        [draft.id],
        { created: draft.id, notes },
      );
    }

    case "update_opening": {
      const o = find(model.openings, ctx, op.id, "opening");
      if (isFail(o)) return o;
      const wall = model.walls.find((w) => w.id === o.wallId);
      if (!wall) return reject("precondition_failed", `${o.kind} ${o.id} has no host wall; remove it instead.`);
      const pos = positionT(wall, op.t, op.offset);
      if (isFail(pos)) return pos;
      if (o.kind === "window" && (op.hinge || op.side)) return reject("invalid_input", "Only doors have a hinge and swing side.");
      const next: Opening = {
        ...o,
        t: pos ?? o.t,
        width: op.width ?? o.width,
        height: op.height ?? o.height,
        sill: o.kind === "door" ? 0 : (op.sill ?? o.sill),
      };
      if (o.kind === "door") {
        next.hinge = op.hinge ?? o.hinge ?? "a";
        next.side = op.side ?? o.side ?? "right";
      }
      const fit = fitOpening(wall, next);
      if (isFail(fit)) return fit;
      next.t = fit.t;
      return done(
        { ...model, openings: model.openings.map((x) => (x.id === o.id ? next : x)) },
        `${o.kind} ${o.id} updated (t=${fit.t.toFixed(2)}, ${next.width} m).`,
        [o.id],
        fit.shifted ? { notes: [`Shifted to t=${fit.t.toFixed(2)} to fit inside the wall.`] } : {},
      );
    }

    case "remove_opening": {
      const o = find(model.openings, ctx, op.id, "opening");
      if (isFail(o)) return o;
      return done({ ...model, openings: model.openings.filter((x) => x.id !== o.id) }, `${o.kind} ${o.id} removed.`, [o.id]);
    }

    case "add_room": {
      const r: Room = {
        id: ctx.newId("room"),
        x: snap(op.x), y: snap(op.y), w: snap(op.w), h: snap(op.h),
        label: op.label,
        floor: op.floor ?? "oak",
      };
      if (r.w < 0.5 || r.h < 0.5) return reject("precondition_failed", "A room must be at least 0.5 × 0.5 m.");
      return done({ ...model, rooms: [...model.rooms, r] }, `Room "${r.label}" ${r.id} added (${r.w} × ${r.h} m).`, [r.id], { created: r.id });
    }

    case "update_room": {
      const room = find(model.rooms, ctx, op.id, "room");
      if (isFail(room)) return room;
      const next: Room = {
        ...room,
        x: op.x !== undefined ? snap(op.x) : room.x,
        y: op.y !== undefined ? snap(op.y) : room.y,
        w: op.w !== undefined ? snap(op.w) : room.w,
        h: op.h !== undefined ? snap(op.h) : room.h,
        label: op.label ?? room.label,
        floor: op.floor ?? room.floor,
      };
      if (next.w < 0.5 || next.h < 0.5) return reject("precondition_failed", "A room must be at least 0.5 × 0.5 m.");
      return done({ ...model, rooms: model.rooms.map((r) => (r.id === room.id ? next : r)) }, `Room "${next.label}" updated.`, [room.id]);
    }

    case "remove_room": {
      const room = find(model.rooms, ctx, op.id, "room");
      if (isFail(room)) return room;
      return done({ ...model, rooms: model.rooms.filter((r) => r.id !== room.id) }, `Room "${room.label}" removed.`, [room.id]);
    }

    case "place_item": {
      const cat = catalogByKind(op.kind)!;
      const it: Item = { id: ctx.newId("item"), kind: cat.kind, x: snap(op.x), y: snap(op.y), rotation: normDeg(op.rotation ?? 0) };
      return done(
        { ...model, items: [...model.items, it] },
        `${cat.label} ${it.id} (${cat.w} × ${cat.d} m) placed at (${it.x.toFixed(2)}, ${it.y.toFixed(2)}).`,
        [it.id],
        { created: it.id },
      );
    }

    case "place_item_in_room": {
      const room = find(model.rooms, ctx, op.roomId, "room");
      if (isFail(room)) return room;
      const cat = catalogByKind(op.kind)!;
      const pos = placeAgainst(room, cat.w, cat.d, op.against, op.along ?? 0.5, op.gap ?? 0, op.rotation ?? 0);
      if (isFail(pos)) return pos;
      const it: Item = { id: ctx.newId("item"), kind: cat.kind, x: round(pos.x), y: round(pos.y), rotation: normDeg(pos.rotation) };
      return done(
        { ...model, items: [...model.items, it] },
        `${cat.label} ${it.id} placed against the ${op.against === "center" ? "centre" : `${op.against} wall`} of "${room.label}".`,
        [it.id],
        { created: it.id },
      );
    }

    case "move_item": {
      const it = find(model.items, ctx, op.id, "item");
      if (isFail(it)) return it;
      const next: Item = {
        ...it,
        x: op.x !== undefined ? snap(op.x) : it.x,
        y: op.y !== undefined ? snap(op.y) : it.y,
        rotation: op.rotation !== undefined ? normDeg(op.rotation) : it.rotation,
      };
      return done(
        { ...model, items: model.items.map((i) => (i.id === it.id ? next : i)) },
        `Item ${it.id} moved to (${next.x.toFixed(2)}, ${next.y.toFixed(2)}), facing ${next.rotation}°.`,
        [it.id],
      );
    }

    case "resize_item": {
      const it = find(model.items, ctx, op.id, "item");
      if (isFail(it)) return it;
      const cat = catalogByKind(it.kind);
      if (!cat) return reject("invalid_input", `Item ${it.id} is not a catalog piece, so it has no size to change.`);
      const { w: _w, d: _d, h: _h, ...base } = it;
      const own = (v: number | undefined, was: number | undefined, nominal: number) => {
        const next = op.reset ? undefined : v !== undefined ? round(v) : was;
        // a size equal to the catalog's is no override at all
        return next === undefined || Math.abs(next - nominal) < 1e-9 ? undefined : next;
      };
      const size = { w: own(op.w, _w, cat.w), d: own(op.d, _d, cat.d), h: own(op.h, _h, cat.h) };
      const next: Item = { ...base, ...(size.w !== undefined && { w: size.w }), ...(size.d !== undefined && { d: size.d }), ...(size.h !== undefined && { h: size.h }) };
      const shown = { w: size.w ?? cat.w, d: size.d ?? cat.d, h: size.h ?? cat.h };
      return done(
        { ...model, items: model.items.map((i) => (i.id === it.id ? next : i)) },
        op.reset ? `${cat.label} ${it.id} back to its catalog size (${cat.w} × ${cat.d} × ${cat.h} m).` : `${cat.label} ${it.id} resized to ${shown.w} × ${shown.d} × ${shown.h} m.`,
        [it.id],
      );
    }

    case "remove_item": {
      const it = find(model.items, ctx, op.id, "item");
      if (isFail(it)) return it;
      return done({ ...model, items: model.items.filter((i) => i.id !== it.id) }, `Item ${it.id} removed.`, [it.id]);
    }

    case "rename_plan":
      return done({ ...model, name: op.name }, `Design renamed to "${op.name}".`, []);

    case "build_layout": {
      const { op: _op, ...spec } = op;
      const built = buildLayout(spec, ctx.newId);
      if (!built.ok) return reject("precondition_failed", built.error.message);
      const next: PlanModel = {
        ...model,
        name: spec.name ?? model.name,
        walls: built.walls,
        openings: built.openings,
        rooms: built.rooms,
        items: [],
      };
      const removed = [...model.walls, ...model.openings, ...model.rooms, ...model.items].map((e) => e.id);
      const added = [...built.walls, ...built.openings, ...built.rooms].map((e) => e.id);
      return done(
        next,
        `Layout built: ${built.rooms.length} rooms, ${built.walls.length} walls, ${built.openings.length} openings.`,
        [...removed, ...added],
        { notes: built.notes, refs: built.refs },
      );
    }

    case "clear_plan": {
      const removed = [...model.walls, ...model.openings, ...model.rooms, ...model.items].map((e) => e.id);
      return done({ ...emptyModel(), name: model.name, underlay: model.underlay }, "Plan cleared.", removed);
    }
  }
}

/** Centre + rotation for an item whose back sits against one side of a room's clear rectangle. */
function placeAgainst(
  room: Room,
  w: number,
  d: number,
  against: (typeof SIDES)[number] | "center",
  t: number,
  gap: number,
  centerRotation: number,
): { x: number; y: number; rotation: number } | Failed {
  const tooBig = (span: number, size: number, axis: string) =>
    reject("precondition_failed", `It is ${size.toFixed(2)} m along the ${axis} but "${room.label}" is only ${span.toFixed(2)} m.`);
  switch (against) {
    case "north":
    case "south": {
      if (w > room.w + 1e-6) return tooBig(room.w, w, "wall");
      if (d + gap > room.h + 1e-6) return tooBig(room.h, d + gap, "depth");
      const x = room.x + w / 2 + t * (room.w - w);
      return against === "north"
        ? { x, y: room.y + gap + d / 2, rotation: 0 }
        : { x, y: room.y + room.h - gap - d / 2, rotation: 180 };
    }
    case "west":
    case "east": {
      if (w > room.h + 1e-6) return tooBig(room.h, w, "wall");
      if (d + gap > room.w + 1e-6) return tooBig(room.w, d + gap, "depth");
      const y = room.y + w / 2 + t * (room.h - w);
      return against === "west"
        ? { x: room.x + gap + d / 2, y, rotation: 90 }
        : { x: room.x + room.w - gap - d / 2, y, rotation: 270 };
    }
    case "center":
      return { x: room.x + room.w / 2, y: room.y + room.h / 2, rotation: centerRotation };
  }
}

/** Human-readable path + message for each schema problem. */
export function describeSchemaError(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join(".") : "input"}: ${i.message}`)
    .join("; ");
}

/**
 * Validate and apply a batch atomically: either every operation applies, or none do and the
 * original model is returned with the first failure. Input is `unknown` on purpose — it may
 * come straight from a language model.
 */
export function applyBatch(model: PlanModel, ops: unknown, newId: (prefix: string) => string): BatchOutcome {
  const steps: StepResult[] = [];
  const failed = (index: number, op: string, error: OpError): BatchOutcome => {
    steps.push({ index, op, ok: false, summary: error.message, changed: [], error });
    return { ok: false, model, steps, changed: [], created: {}, failedIndex: index, error };
  };

  if (!Array.isArray(ops)) return failed(-1, "batch", { code: "invalid_input", message: "Expected a list of operations." });
  if (ops.length === 0) return failed(-1, "batch", { code: "invalid_input", message: "The batch is empty." });
  if (ops.length > 200) return failed(-1, "batch", { code: "invalid_input", message: "At most 200 operations per batch." });

  const ctx: ApplyContext = { newId, refs: new Map() };
  let current = model;
  const changed = new Set<string>();

  for (const [index, raw] of ops.entries()) {
    const opName = typeof raw === "object" && raw && "op" in raw ? String((raw as { op: unknown }).op) : "unknown";
    const parsed = OperationSchema.safeParse(raw);
    if (!parsed.success) return failed(index, opName, { code: "invalid_input", message: describeSchemaError(parsed.error) });
    const op = parsed.data;
    if ("as" in op && op.as && ctx.refs.has(op.as))
      return failed(index, op.op, { code: "invalid_input", message: `Alias "${op.as}" is already used in this batch.` });

    const res = applyOperation(current, op, ctx);
    if (!res.ok) return failed(index, op.op, res.error);

    current = res.model;
    res.changed.forEach((id) => changed.add(id));
    if (res.created && "as" in op && op.as) ctx.refs.set(op.as, res.created);
    for (const [name, id] of Object.entries(res.refs ?? {})) ctx.refs.set(name, id);
    steps.push({ index, op: op.op, ok: true, summary: res.summary, changed: res.changed, created: res.created, notes: res.notes });
  }

  // ids that were created and removed again within the batch are not "changed" in the result
  const ids = new Set([...current.walls, ...current.openings, ...current.rooms, ...current.items].map((e) => e.id));
  const before = new Set([...model.walls, ...model.openings, ...model.rooms, ...model.items].map((e) => e.id));
  return {
    ok: true,
    model: current,
    steps,
    changed: [...changed].filter((id) => ids.has(id) || before.has(id)),
    created: Object.fromEntries(ctx.refs),
  };
}
