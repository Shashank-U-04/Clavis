/**
 * A printable plan drawing as standalone SVG:
 * walls to scale, door swings and windows, room labels with clear areas, furniture
 * outlines, overall dimensions, a scale bar and a north arrow. Pure: model in, text out.
 */

import type { PlanModel } from "../model/types";
import { catalogByKind } from "../model/catalog";
import { doorLeaves, leafPath, openingEnds } from "../model/drawing";
import { analyzeModel } from "../model/analysis";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** px per metre in the exported drawing (1:50 at 96 dpi is ~75 px/m) */
const S = 75;

export function planToSvg(model: PlanModel, opts: { title?: string; date?: string } = {}): string {
  const a = analyzeModel(model);
  const xs = [...model.walls.flatMap((w) => [w.ax, w.bx]), ...model.rooms.flatMap((r) => [r.x, r.x + r.w])];
  const ys = [...model.walls.flatMap((w) => [w.ay, w.by]), ...model.rooms.flatMap((r) => [r.y, r.y + r.h])];
  const minX = (xs.length ? Math.min(...xs) : 0) - 1.6;
  const minY = (ys.length ? Math.min(...ys) : 0) - 1.6;
  const maxX = (xs.length ? Math.max(...xs) : 6) + 1.6;
  const maxY = (ys.length ? Math.max(...ys) : 6) + 2.4;
  const W = (maxX - minX) * S;
  const H = (maxY - minY) * S;
  const p = (v: number) => (v * S).toFixed(1);
  const out: string[] = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="${p(minX)} ${p(minY)} ${W.toFixed(1)} ${H.toFixed(1)}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<rect x="${p(minX)}" y="${p(minY)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#ffffff"/>`);

  // rooms
  for (const r of model.rooms) {
    out.push(`<rect x="${p(r.x)}" y="${p(r.y)}" width="${p(r.w)}" height="${p(r.h)}" fill="${r.floor === "tile" ? "#f1f3f4" : r.floor === "carpet" ? "#f3f1ec" : "#faf7f1"}"/>`);
  }
  // furniture
  for (const it of model.items) {
    const c = catalogByKind(it.kind);
    if (!c) continue;
    out.push(
      `<g transform="translate(${p(it.x)} ${p(it.y)}) rotate(${-it.rotation})"><rect x="${p(-c.w / 2)}" y="${p(-c.d / 2)}" width="${p(c.w)}" height="${p(c.d)}" rx="3" fill="none" stroke="#9aa0a6" stroke-width="1"${c.isRug ? ' stroke-dasharray="4 3"' : ""}/></g>`,
    );
  }
  // walls
  for (const w of model.walls) {
    out.push(`<line x1="${p(w.ax)}" y1="${p(w.ay)}" x2="${p(w.bx)}" y2="${p(w.by)}" stroke="#1f2328" stroke-width="${(w.thickness * S).toFixed(1)}" stroke-linecap="square"/>`);
  }
  // openings
  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  for (const o of model.openings) {
    const wall = wallById.get(o.wallId);
    if (!wall) continue;
    const [e0, e1] = openingEnds(wall, o);
    out.push(`<line x1="${p(e0.x)}" y1="${p(e0.y)}" x2="${p(e1.x)}" y2="${p(e1.y)}" stroke="#ffffff" stroke-width="${(wall.thickness * S + 2).toFixed(1)}"/>`);
    if (o.kind === "window") {
      for (const off of [-0.35, 0, 0.35]) {
        const k = (off * wall.thickness * S) / S;
        const len = Math.hypot(wall.bx - wall.ax, wall.by - wall.ay) || 1;
        const nx = (-(wall.by - wall.ay) / len) * k;
        const ny = ((wall.bx - wall.ax) / len) * k;
        out.push(`<line x1="${p(e0.x + nx)}" y1="${p(e0.y + ny)}" x2="${p(e1.x + nx)}" y2="${p(e1.y + ny)}" stroke="#1f2328" stroke-width="1"/>`);
      }
    } else {
      for (const leaf of doorLeaves(wall, o)) {
        const d = leafPath(leaf, S);
        out.push(`<path d="${d.arc}" fill="none" stroke="#5f6368" stroke-width="0.8" stroke-dasharray="3 2"/>`);
        out.push(`<path d="${d.leaf}" stroke="#1f2328" stroke-width="2"/>`);
      }
    }
  }
  // room labels
  for (const r of model.rooms) {
    const fs = Math.min(15, Math.max(8, Math.min(r.w, r.h) * 5.5));
    out.push(
      `<text x="${p(r.x + r.w / 2)}" y="${p(r.y + r.h / 2)}" text-anchor="middle" font-size="${fs}" fill="#1f2328" font-weight="600">${esc(r.label)}</text>`,
      `<text x="${p(r.x + r.w / 2)}" y="${(r.y + r.h / 2) * S + fs * 1.15}" text-anchor="middle" font-size="${fs * 0.78}" fill="#5f6368">${(r.w * r.h).toFixed(1)} m² · ${r.w.toFixed(2)} × ${r.h.toFixed(2)}</text>`,
    );
  }
  // overall dimensions
  const e = a.metrics.envelope;
  if (e) {
    const y = e.y + e.h + 0.6;
    const x = e.x - 0.6;
    out.push(
      `<g stroke="#5f6368" stroke-width="1"><line x1="${p(e.x)}" y1="${p(y)}" x2="${p(e.x + e.w)}" y2="${p(y)}"/><line x1="${p(e.x)}" y1="${p(y - 0.12)}" x2="${p(e.x)}" y2="${p(y + 0.12)}"/><line x1="${p(e.x + e.w)}" y1="${p(y - 0.12)}" x2="${p(e.x + e.w)}" y2="${p(y + 0.12)}"/>`,
      `<line x1="${p(x)}" y1="${p(e.y)}" x2="${p(x)}" y2="${p(e.y + e.h)}"/><line x1="${p(x - 0.12)}" y1="${p(e.y)}" x2="${p(x + 0.12)}" y2="${p(e.y)}"/><line x1="${p(x - 0.12)}" y1="${p(e.y + e.h)}" x2="${p(x + 0.12)}" y2="${p(e.y + e.h)}"/></g>`,
      `<text x="${p(e.x + e.w / 2)}" y="${p(y - 0.12)}" text-anchor="middle" font-size="11" fill="#1f2328">${e.w.toFixed(2)} m</text>`,
      `<text x="${p(x - 0.15)}" y="${p(e.y + e.h / 2)}" text-anchor="middle" font-size="11" fill="#1f2328" transform="rotate(-90 ${p(x - 0.15)} ${p(e.y + e.h / 2)})">${e.h.toFixed(2)} m</text>`,
    );
  }
  // title block, scale bar, north arrow
  const by = maxY - 0.9;
  out.push(
    `<text x="${p(minX + 0.4)}" y="${p(by)}" font-size="16" font-weight="700" fill="#1f2328">${esc(opts.title ?? model.name)}</text>`,
    `<text x="${p(minX + 0.4)}" y="${p(by + 0.32)}" font-size="10" fill="#5f6368">${a.metrics.carpetArea.toFixed(1)} m² clear floor · ${model.rooms.length} rooms${opts.date ? ` · ${esc(opts.date)}` : ""} · concept drawing, not for construction</text>`,
  );
  const sx = maxX - 3.4;
  for (let i = 0; i < 2; i++) out.push(`<rect x="${p(sx + i)}" y="${p(by - 0.1)}" width="${S}" height="6" fill="${i % 2 ? "#ffffff" : "#1f2328"}" stroke="#1f2328" stroke-width="1"/>`);
  out.push(`<text x="${p(sx)}" y="${p(by + 0.25)}" font-size="9" fill="#1f2328">0</text><text x="${p(sx + 2)}" y="${p(by + 0.25)}" font-size="9" fill="#1f2328" text-anchor="middle">2 m</text>`);
  const nx = maxX - 0.7;
  out.push(`<path d="M ${p(nx)} ${p(by - 0.55)} L ${p(nx - 0.14)} ${p(by - 0.1)} L ${p(nx)} ${p(by - 0.2)} L ${p(nx + 0.14)} ${p(by - 0.1)} Z" fill="#1f2328"/><text x="${p(nx)}" y="${p(by + 0.15)}" font-size="10" text-anchor="middle" fill="#1f2328">N</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}

export function downloadText(text: string, filename: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeName = (name: string) => name.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "design";
