/**
 * The entrance elevation of a design, computed from the model on the server: the west face of
 * the building seen square-on, with its real door and windows at their real sills and heights,
 * the rooms that lie behind it, and the dimensions an elevation carries.
 *
 * The model holds walls and openings, not a roof, so the roof is drawn as a plain flat slab —
 * the one conventional part. Everything else is measured from the design.
 *
 * Two layers come out: `lines` (the line drawing) and `fills` (the tones laid under the same
 * lines when the drawing is rendered). The sheet is centred on the section-cut height, so a
 * figure can run a datum line through its middle.
 */

import type { PlanModel } from "@/model/types";
import { sunsetLoftModel } from "@/model/templates";

/** Pixels per metre. */
const S = 56;
/** The height the plan is cut at; the sheet is centred on it. */
export const DATUM = 1.2;

export type LineTone = "ink" | "mid" | "soft" | "dash";

export interface ElevationLine {
  d: string;
  tone: LineTone;
  w: number;
}

export interface ElevationFill {
  d: string;
  /** a CSS colour or custom property */
  fill: string;
  opacity?: number;
}

export interface ElevationText {
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
  tone: "ink" | "soft";
}

export interface ElevationData {
  viewBox: string;
  box: { x: number; y: number; w: number; h: number };
  /** the sheet y of the section cut, the middle of the sheet */
  datumY: number;
  lines: ElevationLine[];
  fills: ElevationFill[];
  texts: ElevationText[];
  facts: { name: string; width: number; height: number; doors: number; windows: number; rooms: string[] };
}

interface Hole {
  kind: "door" | "window";
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();
const X = (m: number) => m * S;
const Y = (z: number) => -z * S;
const rect = (x0: number, z0: number, x1: number, z1: number) => `M${n(X(x0))} ${n(Y(z1))}H${n(X(x1))}V${n(Y(z0))}H${n(X(x0))}Z`;
const seg = (x0: number, z0: number, x1: number, z1: number) => `M${n(X(x0))} ${n(Y(z0))}L${n(X(x1))} ${n(Y(z1))}`;
const circle = (cx: number, cz: number, r: number) => `M${n(X(cx - r))} ${n(Y(cz))}a${n(r * S)} ${n(r * S)} 0 1 0 ${n(2 * r * S)} 0a${n(r * S)} ${n(r * S)} 0 1 0 ${n(-2 * r * S)} 0Z`;

export function buildElevation(model: PlanModel = sunsetLoftModel()): ElevationData {
  const west = Math.min(...model.walls.flatMap((w) => [w.ax, w.bx]));
  const face = model.walls.filter((w) => Math.abs(w.ax - west) < 1e-6 && Math.abs(w.bx - west) < 1e-6);
  const t = face[0]?.thickness ?? 0.2;
  const H = Math.max(2.4, ...face.map((w) => w.height));
  // along the face, north (plan y = 0) is on the left for someone looking east
  const a0 = Math.min(...face.flatMap((w) => [w.ay, w.by])) - t / 2;
  const a1 = Math.max(...face.flatMap((w) => [w.ay, w.by])) + t / 2;

  const holes: Hole[] = model.openings
    .flatMap((o) => {
      const w = face.find((f) => f.id === o.wallId);
      if (!w) return [];
      const c = w.ay + (w.by - w.ay) * o.t;
      return [{ kind: o.kind, x0: c - o.width / 2, x1: c + o.width / 2, z0: o.sill, z1: o.sill + o.height }];
    })
    .sort((p, q) => p.x0 - q.x0);
  const doors = holes.filter((h) => h.kind === "door");
  const windows = holes.filter((h) => h.kind === "window");
  const behind = model.rooms.filter((r) => r.x - west < t + 0.05).sort((p, q) => p.y - q.y);

  const lines: ElevationLine[] = [];
  const fills: ElevationFill[] = [];
  const texts: ElevationText[] = [];
  const line = (d: string, tone: LineTone = "ink", w = 1) => lines.push({ d, tone, w });
  const fill = (d: string, f: string, opacity?: number) => fills.push({ d, fill: f, opacity });
  const text = (x: number, z: number, s: string, anchor: ElevationText["anchor"] = "middle", tone: ElevationText["tone"] = "soft") => texts.push({ x: X(x), y: Y(z), text: s, anchor, tone });

  const G = -0.3; // the ground, below the floor
  const ROOF = 0.24;
  const EAVE = 0.5;

  // ---- trees, behind the building
  const trees = [
    { x: a0 - 1.75, r: 0.95, top: 2.15 },
    { x: a1 + 3.05, r: 1.05, top: 2.3 },
  ];
  for (const tr of trees) {
    fill(circle(tr.x, tr.top, tr.r), "var(--color-paper-3)", 0.75);
    line(circle(tr.x, tr.top, tr.r), "mid", 0.8);
    line(circle(tr.x - tr.r * 0.18, tr.top + tr.r * 0.1, tr.r * 0.55), "soft", 0.6);
    line(seg(tr.x, G, tr.x, tr.top - tr.r * 0.35), "mid", 1);
    line(seg(tr.x, tr.top - tr.r * 0.75, tr.x - tr.r * 0.4, tr.top - tr.r * 0.3), "mid", 0.7);
    line(seg(tr.x, tr.top - tr.r * 0.95, tr.x + tr.r * 0.45, tr.top - tr.r * 0.45), "mid", 0.7);
  }

  // ---- ground and plinth
  line(seg(a0 - 3.3, G, a1 + 4.2, G), "ink", 1.5);
  for (let x = a0 - 3.1; x < a1 + 4.1; x += 0.42) line(seg(x, G, x - 0.16, G - 0.16), "soft", 0.6);
  fill(rect(a0 - 0.06, G, a1 + 0.06, 0), "var(--color-rule)");
  line(rect(a0 - 0.06, G, a1 + 0.06, 0), "ink", 0.9);

  // ---- the wall, boarded vertically; boards stop at the openings
  fill(rect(a0, 0, a1, H), "var(--color-paper-2)");
  for (let x = a0 + 0.3; x < a1 - 0.05; x += 0.3) {
    let z = 0;
    const cuts = holes.filter((h) => x > h.x0 - 0.09 && x < h.x1 + 0.09).sort((p, q) => p.z0 - q.z0);
    for (const c of cuts) {
      if (c.z0 - 0.07 > z) line(seg(x, z, x, c.z0 - 0.07), "soft", 0.5);
      z = Math.max(z, c.z1);
    }
    if (z < H) line(seg(x, z, x, H), "soft", 0.5);
  }
  fill(rect(a0, H - 0.34, a1, H), "var(--color-ink)", 0.13); // the eave's shadow
  line(rect(a0, 0, a1, H), "ink", 1.2);

  // ---- roof
  fill(rect(a0 - EAVE, H, a1 + EAVE, H + ROOF), "var(--color-ink)");
  line(rect(a0 - EAVE, H, a1 + EAVE, H + ROOF), "ink", 1.2);
  line(seg(a0 - EAVE, H + ROOF * 0.4, a1 + EAVE, H + ROOF * 0.4), "mid", 0.6);

  // ---- windows
  for (const w of windows) {
    const f = 0.06;
    fill(rect(w.x0, w.z0, w.x1, w.z1), "var(--color-marker-soft)");
    fill(rect(w.x0, w.z1 - 0.14, w.x1, w.z1), "var(--color-ink)", 0.2);
    fill(rect(w.x0, w.z0, w.x0 + 0.08, w.z1), "var(--color-ink)", 0.12);
    line(rect(w.x0, w.z0, w.x1, w.z1), "ink", 1.1);
    line(rect(w.x0 + f, w.z0 + f, w.x1 - f, w.z1 - f), "mid", 0.7);
    const panes = Math.max(1, Math.round((w.x1 - w.x0) / 0.85));
    for (let i = 1; i < panes; i++) {
      const x = w.x0 + ((w.x1 - w.x0) * i) / panes;
      line(seg(x - 0.025, w.z0 + f, x - 0.025, w.z1 - f), "mid", 0.7);
      line(seg(x + 0.025, w.z0 + f, x + 0.025, w.z1 - f), "mid", 0.7);
    }
    // a glint across the first pane
    const pw = (w.x1 - w.x0) / panes;
    fills.push({ d: `M${n(X(w.x0 + pw * 0.2))} ${n(Y(w.z0 + f))}L${n(X(w.x0 + pw * 0.75))} ${n(Y(w.z1 - f))}H${n(X(w.x0 + pw * 0.92))}L${n(X(w.x0 + pw * 0.37))} ${n(Y(w.z0 + f))}Z`, fill: "#ffffff", opacity: 0.5 });
    fill(rect(w.x0 - 0.09, w.z0 - 0.07, w.x1 + 0.09, w.z0), "var(--color-paper)");
    line(rect(w.x0 - 0.09, w.z0 - 0.07, w.x1 + 0.09, w.z0), "ink", 0.9);
  }

  // ---- doors, each with a step up from the ground
  for (const d of doors) {
    fill(rect(d.x0 - 0.35, G, d.x1 + 0.35, G / 2), "var(--color-paper-3)");
    line(rect(d.x0 - 0.35, G, d.x1 + 0.35, G / 2), "ink", 0.9);
    fill(rect(d.x0, 0, d.x1, d.z1), "var(--color-marker)");
    fill(rect(d.x0, d.z1 - 0.12, d.x1, d.z1), "var(--color-ink)", 0.25);
    line(rect(d.x0, 0, d.x1, d.z1), "ink", 1.1);
    line(rect(d.x0 + 0.06, 0, d.x1 - 0.06, d.z1 - 0.06), "mid", 0.7);
    for (const z of [0.55, 1.05, 1.55]) line(seg(d.x0 + 0.16, z, d.x1 - 0.16, z), "mid", 0.6);
    line(seg(d.x1 - 0.17, 0.95, d.x1 - 0.17, 1.15), "ink", 1.6);
  }

  // ---- overall width, above the roof
  const top = H + ROOF + 0.62;
  line(seg(a0, top, a1, top), "mid", 0.7);
  for (const x of [a0, a1]) {
    line(seg(x, H + ROOF + 0.14, x, top + 0.14), "mid", 0.5);
    line(seg(x - 0.09, top - 0.09, x + 0.09, top + 0.09), "ink", 1);
  }
  text((a0 + a1) / 2, top + 0.11, `${(a1 - a0).toFixed(2)} M`, "middle", "ink");

  // ---- the openings, as a running string below the ground
  const str = G - 0.5;
  const marks = [a0, ...holes.flatMap((h) => [h.x0, h.x1]), a1];
  line(seg(a0, str, a1, str), "mid", 0.7);
  for (const x of marks) {
    line(seg(x, G - 0.2, x, str - 0.1), "mid", 0.5);
    line(seg(x - 0.07, str - 0.07, x + 0.07, str + 0.07), "ink", 1);
  }
  for (const h of holes) text((h.x0 + h.x1) / 2, str + 0.09, (h.x1 - h.x0).toFixed(2));

  // ---- the rooms behind the face
  const band = str - 0.52;
  for (const r of behind) {
    const r0 = Math.max(a0, r.y);
    const r1 = Math.min(a1, r.y + r.h);
    line(seg(r0 + 0.05, band, r1 - 0.05, band), "dash", 0.6);
    line(seg(r0 + 0.05, band - 0.07, r0 + 0.05, band + 0.07), "mid", 0.6);
    line(seg(r1 - 0.05, band - 0.07, r1 - 0.05, band + 0.07), "mid", 0.6);
    text((r0 + r1) / 2, band - 0.27, r.label.replace(/\s*&.*/, "").toUpperCase());
  }

  // ---- levels, at the south end
  const lx = a1 + EAVE + 0.3;
  for (const [z, label] of [
    [0, "±0.00"],
    [H, `+${H.toFixed(2)}`],
  ] as const) {
    line(seg(lx, z, lx + 0.55, z), "mid", 0.6);
    line(`M${n(X(lx + 0.18))} ${n(Y(z))}l${n(0.09 * S)} ${n(-0.13 * S)}l${n(0.09 * S)} ${n(0.13 * S)}`, "mid", 0.6);
    text(lx + 0.62, z + 0.05, label, "start");
  }

  // the sheet: wide enough for the trees and levels, and as tall above the cut as below it
  const half = Math.max(H + ROOF + 1.15 - DATUM, DATUM - (band - 0.55));
  const x0 = a0 - 3.6;
  const x1 = a1 + 4.5;
  const box = { x: X(x0), y: Y(DATUM + half), w: X(x1 - x0), h: 2 * half * S };

  return {
    viewBox: `${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}`,
    box,
    datumY: Y(DATUM),
    lines,
    fills,
    texts,
    facts: { name: model.name, width: a1 - a0, height: H, doors: doors.length, windows: windows.length, rooms: behind.map((r) => r.label) },
  };
}
