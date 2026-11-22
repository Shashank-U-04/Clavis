/**
 * What goes into a design's report, worked out from the design alone (no browser needed, so it
 * can be tested): a summary, then for every floor its rooms with their sizes, its doors and
 * windows with theirs, and every piece of furniture and fitting with its name and size, room by
 * room. The PDF (report.ts) lays these out beside the plans and the 3D views.
 */

import type { PlanModel } from "../model/types";
import { analyzeModel } from "../model/analysis";
import { checkModel, summarizeIssues, openingCenter } from "../model/issues";
import { catalogByKind, itemSize } from "../model/catalog";
import { levelsOf, onLevel } from "../model/levels";

const m2 = (v: number) => `${v.toFixed(1)} m²`;
const m = (v: number) => `${v.toFixed(2)} m`;
const size = (w: number, d: number) => `${w.toFixed(2)} × ${d.toFixed(2)} m`;

export interface ReportData {
  name: string;
  summary: [string, string][];
  floors: {
    id: string;
    name: string;
    rooms: string[][];
    openings: string[][];
    furniture: string[][];
  }[];
}

export const ROOM_HEAD = ["Room", "Size", "Floor area", "Ceiling", "Windows", "Daylight"];
export const OPENING_HEAD = ["", "Between", "Width", "Height", "Sill"];
export const FURNITURE_HEAD = ["Room", "Piece", "Size (w × d × h)", "Count"];

export function reportData(model: PlanModel): ReportData {
  const levels = levelsOf(model);
  const analysis = analyzeModel(model);
  const env = analysis.metrics.envelope;
  const counts = summarizeIssues(checkModel(model));
  const summary: [string, string][] = [
    ["Floors", String(levels.length)],
    ["Rooms", String(model.rooms.length)],
    ["Floor area", m2(analysis.metrics.carpetArea)],
    ["Footprint", env ? size(env.w, env.h) : "—"],
    ["Doors and windows", `${model.openings.filter((o) => o.kind === "door").length} doors · ${model.openings.filter((o) => o.kind === "window").length} windows`],
    ["Furniture and fittings", `${model.items.length} pieces`],
    ["Checks", `${counts.error} errors · ${counts.warning} warnings`],
  ];

  const floors = levels.map((level) => {
    const here = onLevel(model, level.id);
    const ceiling = Math.max(0, ...here.walls.map((w) => w.height));
    const byId = new Map(analysis.rooms.map((r) => [r.id, r]));
    const roomAt = (x: number, y: number) => here.rooms.find((r) => x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01);

    const rooms = here.rooms.map((r) => {
      const a = byId.get(r.id);
      return [r.label, size(r.w, r.h), m2(r.w * r.h), ceiling ? m(ceiling) : "—", String(a?.windows.length ?? 0), a && a.windows.length ? `${Math.round(a.daylightRatio * 100)} %` : "—"];
    });

    // each opening with the rooms either side of it (a probe just off the wall each way)
    const openings = here.openings
      .map((o) => {
        const wall = here.walls.find((w) => w.id === o.wallId);
        if (!wall) return null;
        const c = openingCenter(wall, o);
        const len = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay) || 1;
        const n = { x: -(wall.by - wall.ay) / len, y: (wall.bx - wall.ax) / len };
        const off = wall.thickness / 2 + 0.15;
        const sides = [1, -1].map((s) => roomAt(c.x + n.x * off * s, c.y + n.y * off * s)?.label ?? "Outside");
        const between = [...new Set(sides)].sort((a, b) => (a === "Outside" ? 1 : b === "Outside" ? -1 : a.localeCompare(b))).join(" · ");
        return [o.kind === "door" ? "Door" : "Window", between, m(o.width), m(o.height), o.kind === "window" ? m(o.sill) : "—"];
      })
      .filter((r): r is string[] => r !== null)
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

    // furniture by room, identical pieces counted together
    const groups = new Map<string, { room: string; piece: string; size: string; count: number }>();
    for (const it of here.items) {
      const cat = catalogByKind(it.kind);
      const s = itemSize(it);
      if (!cat || !s) continue;
      const room = roomAt(it.x, it.y)?.label ?? "Outside";
      const dims = `${s.w.toFixed(2)} × ${s.d.toFixed(2)} × ${s.h.toFixed(2)} m`;
      const key = `${room}|${cat.label}|${dims}`;
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { room, piece: cat.label, size: dims, count: 1 });
    }
    const order = new Map(here.rooms.map((r, i) => [r.label, i]));
    const furniture = [...groups.values()]
      .sort((a, b) => (order.get(a.room) ?? 1e9) - (order.get(b.room) ?? 1e9) || a.room.localeCompare(b.room) || a.piece.localeCompare(b.piece))
      .map((g) => [g.room, g.piece, g.size, String(g.count)]);

    return { id: level.id, name: level.name, rooms, openings, furniture };
  });

  return { name: model.name || "Untitled design", summary, floors };
}
