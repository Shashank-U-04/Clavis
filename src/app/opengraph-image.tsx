import { ImageResponse } from "next/og";
import { buildTemplate } from "@/lib/buildTemplate";
import { catalogByKind, itemSize } from "@/model/catalog";
import { doorLeaves, leafPath, openingEnds } from "@/model/drawing";
import type { PlanModel } from "@/model/types";

/**
 * The picture shown when a Clavis link is shared: the mark and the promise on drafting paper,
 * beside a real furnished plan from the template library. Built once per deploy.
 */

export const alt = "Clavis: describe a home, check it, walk through it. A furnished floor plan on drafting paper.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#f1f0ea";
const INK = "#15171c";
const INK_2 = "#43464d";
const RULE = "#c9c8be";
const MARKER = "#2747d4";

/** The plan as plain shapes (the image renderer draws inline SVG, not SVG files). */
function Plan({ model, box }: { model: PlanModel; box: number }) {
  const xs = model.walls.flatMap((w) => [w.ax, w.bx]);
  const ys = model.walls.flatMap((w) => [w.ay, w.by]);
  const pad = 0.6;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) + pad;
  const walls = new Map(model.walls.map((w) => [w.id, w]));
  const f = (v: number) => +v.toFixed(3);
  return (
    <svg width={box} height={box} viewBox={`${f(minX)} ${f(minY)} ${f(span)} ${f(span)}`}>
      {model.rooms.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.floor === "tile" ? "#eef0f1" : "#f8f5ee"} />
      ))}
      {model.items.map((it) => {
        const c = itemSize(it);
        const cat = catalogByKind(it.kind);
        if (!c || !cat) return null;
        return (
          <rect
            key={it.id}
            x={-c.w / 2}
            y={-c.d / 2}
            width={c.w}
            height={c.d}
            fill="none"
            stroke="#8d939a"
            strokeWidth={0.04}
            transform={`translate(${f(it.x)} ${f(it.y)}) rotate(${-it.rotation})`}
          />
        );
      })}
      {model.walls.map((w) => (
        <line key={w.id} x1={w.ax} y1={w.ay} x2={w.bx} y2={w.by} stroke={INK} strokeWidth={w.thickness} strokeLinecap="square" />
      ))}
      {model.openings.map((o) => {
        const w = walls.get(o.wallId);
        if (!w) return null;
        const [a, b] = openingEnds(w, o);
        return (
          <g key={o.id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth={w.thickness + 0.02} />
            {o.kind === "window" ? (
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={MARKER} strokeWidth={0.05} />
            ) : (
              doorLeaves(w, o).map((l, i) => {
                const p = leafPath(l);
                return (
                  <g key={i}>
                    <path d={p.arc} fill="none" stroke={MARKER} strokeWidth={0.03} />
                    <path d={p.leaf} fill="none" stroke={MARKER} strokeWidth={0.05} />
                  </g>
                );
              })
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function OpengraphImage() {
  const model = buildTemplate("compact-two-bedroom");
  const grid = `linear-gradient(${RULE}55 1px, transparent 1px), linear-gradient(90deg, ${RULE}55 1px, transparent 1px)`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, backgroundImage: grid, backgroundSize: "30px 30px", color: INK, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "64px 0 56px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="64" height="64" viewBox="0 0 32 32">
              <path d="M25.5 11V6.5H6.5v19h19V21" fill="none" stroke={INK} strokeWidth="5" />
              <path d="M25.5 21h-10a10 10 0 0 1 10-10z" fill={MARKER} />
            </svg>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>Clavis</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <span style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Describe a home. Check it. Walk through it.</span>
            <span style={{ fontSize: 26, color: INK_2, lineHeight: 1.35 }}>Laid out in metres, furnished, checked room by room, and in 3D.</span>
          </div>
          <span style={{ fontSize: 18, letterSpacing: 3, color: MARKER, textTransform: "uppercase" }}>Sheet A-01 · Plan · 1:100</span>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: "48px 56px 48px 24px" }}>
          <div style={{ display: "flex", background: "#ffffff", border: `2px solid ${INK}`, padding: 18, boxShadow: `14px 14px 0 ${RULE}` }}>
            <Plan model={model} box={460} />
          </div>
        </div>
      </div>
    ),
    size,
  );
}
