/**
 * Compact, model-derived summaries. This is the context an AI model sees: exact ids, metric
 * dimensions computed here (never by the model), and the current validation issues.
 */

import type { Issue, PlanModel, Wall } from "./types";
import { catalogByKind } from "./catalog";
import { segLen } from "./geometry";
import { openingCenter, roomAt, summarizeIssues } from "./issues";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Which side of the plan a wall runs along, for walls that are axis-aligned. */
function orientation(w: Wall): string {
  if (Math.abs(w.ay - w.by) < 1e-6) return "east-west";
  if (Math.abs(w.ax - w.bx) < 1e-6) return "north-south";
  return "diagonal";
}

export function roomArea(r: { w: number; h: number }): number {
  return r.w * r.h;
}

export function designSummary(model: PlanModel, revision: number, issues: Issue[]) {
  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  return {
    name: model.name,
    revision,
    units: "metres; x grows east, y grows south; rotation 0 faces south (+y), 90 east, 180 north, 270 west",
    totals: {
      rooms: model.rooms.length,
      walls: model.walls.length,
      doors: model.openings.filter((o) => o.kind === "door").length,
      windows: model.openings.filter((o) => o.kind === "window").length,
      items: model.items.length,
      clearFloorArea_m2: r2(model.rooms.reduce((a, r) => a + roomArea(r), 0)),
    },
    rooms: model.rooms.map((r) => ({
      id: r.id,
      label: r.label,
      clearRect: { x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h) },
      area_m2: r2(roomArea(r)),
      floor: r.floor,
    })),
    walls: model.walls.map((w) => ({
      id: w.id,
      a: [r2(w.ax), r2(w.ay)],
      b: [r2(w.bx), r2(w.by)],
      length: r2(segLen(w.ax, w.ay, w.bx, w.by)),
      thickness: w.thickness,
      runs: orientation(w),
    })),
    openings: model.openings.map((o) => {
      const wall = wallById.get(o.wallId);
      const c = wall ? openingCenter(wall, o) : null;
      return {
        id: o.id,
        kind: o.kind,
        wallId: o.wallId,
        t: r2(o.t),
        width: o.width,
        centre: c ? [r2(c.x), r2(c.y)] : null,
      };
    }),
    items: model.items.map((it) => {
      const cat = catalogByKind(it.kind);
      return {
        id: it.id,
        kind: it.kind,
        label: cat?.label ?? it.kind,
        centre: [r2(it.x), r2(it.y)],
        rotation: it.rotation,
        footprint: cat ? { w: cat.w, d: cat.d, h: cat.h } : null,
        room: roomAt(model.rooms, { x: it.x, y: it.y })?.id ?? null,
      };
    }),
    validation: {
      counts: summarizeIssues(issues),
      issues: issues.map(({ id, severity, code, message, refs, measurements }) => ({ id, severity, code, message, refs, measurements })),
    },
  };
}

export type DesignSummary = ReturnType<typeof designSummary>;
