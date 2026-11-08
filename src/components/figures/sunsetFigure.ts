/**
 * The Sunset Loft as an axonometric cutaway, computed from the real design (model/templates.ts)
 * on the server. Like an architect's section, everything is cut at CUT metres: walls show
 * their cut tops in solid ink, and furniture taller than the cut is cut too. Every number the
 * figure's readout shows comes from the same analysis the app uses.
 *
 * The plan is turned so its north-west corner faces the viewer: the open living room and its
 * west window, where the evening sun comes in, are at the front.
 */

import type { Opening, PlanModel, Wall } from "@/model/types";
import { analyzeModel } from "@/model/analysis";
import { catalogByKind } from "@/model/catalog";
import { openingSpan } from "@/model/issues";
import { doorLeaves } from "@/model/drawing";
import { segLen } from "@/model/geometry";
import { sunsetLoftModel } from "@/model/templates";
import { AXIS_X_DEG, AXIS_Y_DEG, boxFaces, flatPolygon, paintOrder, project, type Box3, type Face } from "./iso";

export const CUT = 1.2;
const SCALE = 40;

export type SolidKind = "wall" | "glass" | "leaf" | "item" | "rug";

export interface FigureRoom {
  id: string;
  label: string;
  points: string;
  area: number;
  daylight: number;
  doorsFromEntrance: number | null;
  windows: number;
}

export interface FigureSolid {
  id: string;
  kind: SolidKind;
  faces: Face[];
  /** the solid in world metres, for figures that animate it */
  box: Box3;
  /** what it belongs to: a wall, an opening or a piece of furniture */
  group: string;
}

export interface FigureLabel {
  id: string;
  label: string;
  area: number;
  x: number;
  y: number;
}

/** An overall dimension along one of the two front edges, drawn on the ground. */
export interface FigureDim {
  line: string;
  /** extension lines from the building to the dimension line */
  ext: string[];
  ticks: string[];
  text: string;
  x: number;
  y: number;
  angle: number;
}

export interface FigureData {
  viewBox: string;
  scale: number;
  rooms: FigureRoom[];
  labels: FigureLabel[];
  dims: FigureDim[];
  solids: FigureSolid[];
  arcs: string[];
  halo: { cx: number; cy: number; rx: number; ry: number };
  size: { w: number; h: number };
}

/** Plan (x east, y south) → figure world, turned so the north-west corner is nearest. */
function turner(m: PlanModel) {
  const xs = m.walls.flatMap((w) => [w.ax, w.bx]);
  const ys = m.walls.flatMap((w) => [w.ay, w.by]);
  const maxX = Math.max(...xs) + 0.2;
  const maxY = Math.max(...ys) + 0.2;
  return {
    pt: (x: number, y: number) => ({ x: maxX - x, y: maxY - y }),
    box: (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Box3 => ({
      x0: maxX - Math.max(x0, x1),
      x1: maxX - Math.min(x0, x1),
      y0: maxY - Math.max(y0, y1),
      y1: maxY - Math.min(y0, y1),
      z0,
      z1,
    }),
  };
}

/** The pieces of one wall: solid runs, window sills and glass, cut at CUT. */
function wallPieces(w: Wall, openings: Opening[], T: ReturnType<typeof turner>) {
  const len = segLen(w.ax, w.ay, w.bx, w.by);
  const ux = (w.bx - w.ax) / len;
  const uy = (w.by - w.ay) / len;
  const half = w.thickness / 2;
  const along = (s: number, e: number, z0: number, z1: number, thick = w.thickness) => {
    const a = { x: w.ax + ux * s, y: w.ay + uy * s };
    const b = { x: w.ax + ux * e, y: w.ay + uy * e };
    const h = thick / 2;
    return T.box(Math.min(a.x, b.x) - (ux ? 0 : h), Math.min(a.y, b.y) - (uy ? 0 : h), Math.max(a.x, b.x) + (ux ? 0 : h), Math.max(a.y, b.y) + (uy ? 0 : h), z0, z1);
  };
  const holes = openings
    .map((o) => {
      const [s, e] = openingSpan(w, o);
      return { o, s: Math.max(0, s * len), e: Math.min(len, e * len) };
    })
    .sort((a, b) => a.s - b.s);
  const out: { box: Box3; kind: SolidKind; id: string }[] = [];
  let cursor = -half; // walls run on centrelines; extend each end so corners close
  for (const h of holes) {
    if (h.s > cursor + 1e-4) out.push({ box: along(cursor, h.s, 0, CUT), kind: "wall", id: `${w.id}:${cursor}` });
    if (h.o.kind === "window") {
      const sill = Math.min(h.o.sill, CUT);
      if (sill > 0.01) out.push({ box: along(h.s, h.e, 0, sill), kind: "wall", id: `${h.o.id}:sill` });
      if (sill < CUT) out.push({ box: along(h.s, h.e, sill, CUT, 0.03), kind: "glass", id: `${h.o.id}:glass` });
    }
    cursor = Math.max(cursor, h.e);
  }
  if (len + half > cursor + 1e-4) out.push({ box: along(cursor, len + half, 0, CUT), kind: "wall", id: `${w.id}:end` });
  return out;
}

interface Part {
  lx0: number;
  lx1: number;
  ly0: number;
  ly1: number;
  z0: number;
  z1: number;
}

/**
 * The recognisable parts of a piece of furniture, in its own frame: lx across its width,
 * ly from back (−d/2) to front (+d/2), z up. `h` is already cut at the section height.
 */
function parts(kind: string, w: number, d: number, h: number): Part[] {
  const P = (lx0: number, lx1: number, ly0: number, ly1: number, z0: number, z1: number): Part => ({ lx0, lx1, ly0, ly1, z0, z1: Math.min(z1, h) });
  const W = w / 2;
  const D = d / 2;
  const legs = (top: number, inset = 0.05, s = 0.05) =>
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([a, b]) => P(a * (W - inset) - s / 2, a * (W - inset) + s / 2, b * (D - inset) - s / 2, b * (D - inset) + s / 2, 0.01, top));
  switch (kind) {
    case "bed_double":
    case "bed_single": {
      const pillows = kind === "bed_double" ? 2 : 1;
      const pw = (w - 0.2) / pillows;
      return [
        P(-W, W, -D, D, 0.01, 0.3), // frame
        P(-W, W, -D, -D + 0.07, 0.01, 0.95), // headboard
        P(-W + 0.03, W - 0.03, -D + 0.07, D - 0.03, 0.3, 0.5), // mattress
        P(-W + 0.02, W - 0.02, -D + 0.75, D - 0.02, 0.5, 0.55), // duvet
        ...Array.from({ length: pillows }, (_, i) => P(-W + 0.1 + pw * i + 0.03, -W + 0.1 + pw * (i + 1) - 0.03, -D + 0.12, -D + 0.5, 0.5, 0.61)),
      ];
    }
    case "sofa":
    case "sofa_3":
    case "armchair": {
      const arm = Math.min(0.16, w * 0.15);
      return [
        P(-W, W, -D, D, 0.01, 0.42), // seat base
        P(-W, W, -D, -D + d * 0.24, 0.42, 0.82), // back
        P(-W, -W + arm, -D + d * 0.24, D, 0.42, 0.62), // arms
        P(W - arm, W, -D + d * 0.24, D, 0.42, 0.62),
      ];
    }
    case "dining_table":
    case "dining_table_oval":
    case "coffee_table":
    case "side_table":
    case "desk":
      return [...legs(h - 0.04), P(-W, W, -D, D, h - 0.04, h)];
    case "dining_chair":
    case "office_chair":
      return [...legs(0.44, 0.04, 0.04), P(-W, W, -D, D, 0.44, 0.48), P(-W, W, -D, -D + 0.05, 0.48, 0.92)];
    case "kitchen_counter":
    case "counter_unit":
    case "kitchen_sink_unit":
    case "kitchen_hob_unit":
      return [P(-W + 0.02, W - 0.02, -D, D - 0.04, 0.01, 0.1), P(-W, W, -D, D - 0.02, 0.1, h - 0.04), P(-W - 0.01, W + 0.01, -D, D + 0.01, h - 0.04, h)];
    case "nightstand":
      return [...legs(0.12, 0.04, 0.04), P(-W, W, -D, D, 0.12, h)];
    case "bathtub":
      return [P(-W, W, -D, D, 0.01, h - 0.05), P(-W, W, -D, -D + 0.08, h - 0.05, h), P(-W, W, D - 0.08, D, h - 0.05, h), P(-W, -W + 0.08, -D + 0.08, D - 0.08, h - 0.05, h), P(W - 0.08, W, -D + 0.08, D - 0.08, h - 0.05, h)];
    case "toilet":
      return [P(-W * 0.8, W * 0.8, -D + 0.2, D, 0.01, 0.4), P(-W, W, -D, -D + 0.2, 0.01, 0.78)];
    case "plant":
      return [P(-W * 0.6, W * 0.6, -D * 0.6, D * 0.6, 0.01, 0.32), P(-W, W, -D, D, 0.32, h)];
    case "rug":
      return [P(-W, W, -D, D, 0.002, 0.015)];
    default:
      return [P(-W, W, -D, D, 0.01, h)];
  }
}

export function buildSunsetFigure(model: PlanModel = sunsetLoftModel()): FigureData {
  const T = turner(model);
  const analysis = analyzeModel(model);
  const k = SCALE;

  const rooms: FigureRoom[] = model.rooms.map((r) => {
    const a = analysis.rooms.find((x) => x.id === r.id)!;
    const corners = [T.pt(r.x, r.y), T.pt(r.x + r.w, r.y), T.pt(r.x + r.w, r.y + r.h), T.pt(r.x, r.y + r.h)];
    return {
      id: r.id,
      label: r.label,
      points: flatPolygon(corners, 0, k),
      area: Math.round(a.area * 10) / 10,
      daylight: Math.round(a.daylightRatio * 100),
      doorsFromEntrance: a.depth,
      windows: a.windows.length,
    };
  });

  const solids: { box: Box3; kind: SolidKind; id: string }[] = [];
  for (const w of model.walls) solids.push(...wallPieces(w, model.openings.filter((o) => o.wallId === w.id), T));

  const arcs: string[] = [];
  for (const o of model.openings) {
    if (o.kind !== "door") continue;
    const wall = model.walls.find((w) => w.id === o.wallId)!;
    for (const leaf of doorLeaves(wall, o)) {
      // the open leaf, standing on its hinge, and its swing traced on the floor
      const t = 0.025;
      solids.push({
        box: T.box(Math.min(leaf.hinge.x, leaf.open.x) - t, Math.min(leaf.hinge.y, leaf.open.y) - t, Math.max(leaf.hinge.x, leaf.open.x) + t, Math.max(leaf.hinge.y, leaf.open.y) + t, 0, Math.min(2.05, CUT)),
        kind: "leaf",
        id: `${o.id}:leaf:${leaf.hinge.x}`,
      });
      const a0 = Math.atan2(leaf.closed.y - leaf.hinge.y, leaf.closed.x - leaf.hinge.x);
      let a1 = Math.atan2(leaf.open.y - leaf.hinge.y, leaf.open.x - leaf.hinge.x);
      if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
      if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
      const pts = Array.from({ length: 17 }, (_, i) => {
        const a = a0 + ((a1 - a0) * i) / 16;
        const p = T.pt(leaf.hinge.x + Math.cos(a) * leaf.radius, leaf.hinge.y + Math.sin(a) * leaf.radius);
        const s = project(p.x, p.y, 0.005);
        return `${(s.x * k).toFixed(1)},${(s.y * k).toFixed(1)}`;
      });
      arcs.push(`M ${pts.join(" L ")}`);
    }
  }

  for (const it of model.items) {
    const c = catalogByKind(it.kind);
    if (!c) continue;
    const r = (it.rotation * Math.PI) / 180;
    const across = { x: Math.cos(r), y: -Math.sin(r) };
    const front = { x: Math.sin(r), y: Math.cos(r) };
    parts(c.kind, c.w, c.d, Math.min(c.h, CUT - 0.02)).forEach((p, i) => {
      // a part in the piece's own frame: lx across its width, ly towards its front, from its centre
      const corners = [
        [p.lx0, p.ly0],
        [p.lx1, p.ly0],
        [p.lx0, p.ly1],
        [p.lx1, p.ly1],
      ].map(([lx, ly]) => ({ x: it.x + across.x * lx + front.x * ly, y: it.y + across.y * lx + front.y * ly }));
      const xs = corners.map((q) => q.x);
      const ys = corners.map((q) => q.y);
      solids.push({
        box: T.box(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), p.z0, p.z1),
        kind: c.isRug ? "rug" : "item",
        id: `${it.id}:${i}`,
      });
    });
  }

  // rugs lie on the floor under everything else
  const flat = solids.filter((s) => s.kind === "rug");
  const standing = paintOrder(solids.filter((s) => s.kind !== "rug"));
  const ordered: FigureSolid[] = [...flat, ...standing].map((s) => ({ id: s.id, kind: s.kind, faces: boxFaces(s.box, k), box: s.box, group: s.id.split(":")[0] }));

  const labels: FigureLabel[] = model.rooms.map((r, i) => {
    const c = T.pt(r.x + r.w / 2, r.y + r.h / 2);
    const s = project(c.x, c.y, 0);
    return { id: r.id, label: r.label, area: rooms[i].area, x: s.x * k, y: s.y * k };
  });

  // overall dimensions along the two edges nearest the viewer, set out 0.9 m from the walls
  const walls = solids.filter((s) => s.kind === "wall").map((s) => s.box);
  const bx0 = Math.min(...walls.map((b) => b.x0));
  const bx1 = Math.max(...walls.map((b) => b.x1));
  const by0 = Math.min(...walls.map((b) => b.y0));
  const by1 = Math.max(...walls.map((b) => b.y1));
  const at = (x: number, y: number) => project(x, y, 0);
  const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => `M ${(a.x * k).toFixed(1)} ${(a.y * k).toFixed(1)} L ${(b.x * k).toFixed(1)} ${(b.y * k).toFixed(1)}`;
  const dim = (a: [number, number], b: [number, number], tick: [number, number], angle: number, from: [number, number][]): FigureDim => {
    const pa = at(...a);
    const pb = at(...b);
    const tickAt = (q: [number, number]) => seg(at(q[0] - tick[0], q[1] - tick[1]), at(q[0] + tick[0], q[1] + tick[1]));
    const m = at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ext = from.map((f, i) => {
      const to = i === 0 ? a : b;
      const dx = Math.sign(to[0] - f[0]) * 0.2;
      const dy = Math.sign(to[1] - f[1]) * 0.2;
      return seg(at(f[0] + dx * 0.75, f[1] + dy * 0.75), at(to[0] + dx, to[1] + dy));
    });
    return { line: seg(pa, pb), ext, ticks: [tickAt(a), tickAt(b)], text: `${len.toFixed(2)} m`, x: m.x * k, y: m.y * k, angle };
  };
  const off = 0.9;
  const dims = [
    dim([bx0, by1 + off], [bx1, by1 + off], [0.18, 0.18], AXIS_X_DEG, [
      [bx0, by1],
      [bx1, by1],
    ]),
    dim([bx1 + off, by0], [bx1 + off, by1], [0.18, -0.18], AXIS_Y_DEG, [
      [bx1, by0],
      [bx1, by1],
    ]),
  ];

  // frame the drawing, dimensions included
  const all = [
    ...ordered.flatMap((s) => s.faces.flatMap((f) => f.points.split(" ").map((p) => p.split(",").map(Number)))),
    ...[at(bx0, by1 + off + 0.6), at(bx1, by1 + off + 0.6), at(bx1 + off + 0.6, by0), at(bx1 + off + 0.6, by1)].map((p) => [p.x * k, p.y * k]),
  ];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = 28;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  const centre = project((Math.max(...model.walls.flatMap((x) => [x.ax, x.bx])) + 0.4) / 2, (Math.max(...model.walls.flatMap((x) => [x.ay, x.by])) + 0.4) / 2, 0);

  return {
    viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`,
    scale: k,
    rooms,
    labels,
    dims,
    solids: ordered,
    arcs,
    halo: { cx: centre.x * k, cy: centre.y * k + 6, rx: w * 0.46, ry: h * 0.33 },
    size: { w, h },
  };
}
