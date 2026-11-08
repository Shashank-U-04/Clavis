/**
 * The plan's drawing layers, back to front: grid, tracing image, floors, furniture, walls,
 * doors and windows, then overlays. Each layer only draws; interaction is passed in.
 * Everything is drawn in screen pixels: world metres × `k`.
 */

import type { ReactElement, PointerEvent as ReactPointerEvent } from "react";
import type { Item, Opening, PlanModel, Room, Wall } from "../model/types";
import { segLen, type Pt } from "../model/geometry";
import { catalogByKind } from "../model/catalog";
import { doorLeaves, leafPath, openingEnds } from "../model/drawing";

export const INK = {
  paper: "#101317",
  grid: "#1a1f25",
  gridStrong: "#222831",
  wall: "#d8dde4",
  dim: "#8d96a3",
  label: "#c9d0d9",
  door: "#f0a04b",
  window: "#6aa6e0",
  selected: "#f0a04b",
  flagged: "#ff6b5a",
  proposed: "#7fd18b",
};

export const FLOOR_TINT: Record<string, string> = {
  oak: "#3a3328",
  tile: "#2c3337",
  carpet: "#2f3830",
  concrete: "#333539",
};

/** The outline colour for an entity, or null when it is not marked. */
export type Marker = (id: string) => string | null;
type Press = (e: ReactPointerEvent, id: string) => void;

export function GridLayer({ left, top, width, height, k }: { left: number; top: number; width: number; height: number; k: number }) {
  const step = k > 140 ? 0.5 : k > 30 ? 1 : 5;
  const lines: ReactElement[] = [];
  const right = left + width / k;
  const bottom = top + height / k;
  for (let x = Math.floor(left / step) * step; x <= right; x += step) {
    const strong = Math.abs(x / 5 - Math.round(x / 5)) < 1e-6;
    lines.push(<line key={`v${x.toFixed(2)}`} x1={x * k} y1={top * k} x2={x * k} y2={bottom * k} stroke={strong ? INK.gridStrong : INK.grid} />);
  }
  for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
    const strong = Math.abs(y / 5 - Math.round(y / 5)) < 1e-6;
    lines.push(<line key={`h${y.toFixed(2)}`} x1={left * k} y1={y * k} x2={right * k} y2={y * k} stroke={strong ? INK.gridStrong : INK.grid} />);
  }
  return <g pointerEvents="none">{lines}</g>;
}

export function TracingLayer({ model, k }: { model: PlanModel; k: number }) {
  const u = model.underlay;
  if (!u) return null;
  return <image href={u.dataUrl} x={u.x * k} y={u.y * k} width={u.w * k} height={u.h * k} opacity={u.opacity} preserveAspectRatio="none" pointerEvents="none" />;
}

export function RoomsLayer({ rooms, k, mark, onPress, movable }: { rooms: Room[]; k: number; mark: Marker; onPress: Press; movable: boolean }) {
  const size = Math.max(10, Math.min(16, 0.24 * k));
  return (
    <g>
      {rooms.map((r) => {
        const m = mark(r.id);
        const cx = (r.x + r.w / 2) * k;
        const cy = (r.y + r.h / 2) * k;
        return (
          <g key={r.id} data-room={r.label} onPointerDown={(e) => onPress(e, r.id)} style={{ cursor: movable ? "move" : undefined }}>
            <rect x={r.x * k} y={r.y * k} width={r.w * k} height={r.h * k} fill={FLOOR_TINT[r.floor] ?? FLOOR_TINT.oak} stroke={m ?? "none"} strokeWidth={m ? 2.5 : 0} />
            {r.w * k > 40 && (
              <text x={cx} y={cy} textAnchor="middle" fontSize={size} fill={INK.label} fontWeight={600} pointerEvents="none">
                {r.label}
                <tspan x={cx} dy={size * 1.2} fontSize={size * 0.8} fontWeight={400} fill={INK.dim}>
                  {(r.w * r.h).toFixed(1)} m²
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function Piece({ item, k, mark, onPress, movable }: { item: Item; k: number; mark: Marker; onPress: Press; movable: boolean }) {
  const c = catalogByKind(item.kind);
  if (!c) return null;
  const m = mark(item.id);
  const w = c.w * k;
  const d = c.d * k;
  return (
    <g transform={`translate(${item.x * k} ${item.y * k}) rotate(${-item.rotation})`} onPointerDown={(e) => onPress(e, item.id)} style={{ cursor: movable ? "move" : undefined }}>
      <rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        rx={0.05 * k}
        fill={c.isRug ? "none" : c.color}
        fillOpacity={0.55}
        stroke={m ?? (c.isRug ? "#6c7480" : "#9aa3ad")}
        strokeDasharray={c.isRug ? "5 4" : undefined}
        strokeWidth={m ? 2.5 : 1}
      />
      {!c.isRug && <line x1={-w * 0.3} y1={d / 2 - 2} x2={w * 0.3} y2={d / 2 - 2} stroke="#ffffff55" strokeWidth={1.5} />}
      {!c.isRug && k > 70 && (
        <text transform={`rotate(${item.rotation})`} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(8, Math.min(12, 0.16 * k))} fill="#eef2f6" pointerEvents="none">
          {c.label}
        </text>
      )}
    </g>
  );
}

export function FurnitureLayer(props: { items: Item[]; k: number; mark: Marker; onPress: Press; movable: boolean }) {
  return (
    <g>
      {props.items.map((it) => (
        <Piece key={it.id} item={it} {...props} />
      ))}
    </g>
  );
}

/** Furniture a previewed proposal would remove, drawn as dashed ghosts. */
export function RemovedLayer({ items, k }: { items: Item[]; k: number }) {
  return (
    <g pointerEvents="none">
      {items.map((it) => {
        const c = catalogByKind(it.kind);
        return c ? (
          <rect key={it.id} transform={`translate(${it.x * k} ${it.y * k}) rotate(${-it.rotation})`} x={(-c.w / 2) * k} y={(-c.d / 2) * k} width={c.w * k} height={c.d * k} fill="none" stroke={INK.flagged} strokeDasharray="4 3" strokeWidth={1.5} />
        ) : null;
      })}
    </g>
  );
}

export function WallsLayer({ walls, k, mark, onPress, pickable }: { walls: Wall[]; k: number; mark: Marker; onPress: Press; pickable: boolean }) {
  return (
    <g>
      {walls.map((w) => {
        const m = mark(w.id);
        const len = segLen(w.ax, w.ay, w.bx, w.by);
        // dimension label sits just outside the wall, on its right-hand side
        const off = len ? (w.thickness / 2 + 0.18) / len : 0;
        const lx = ((w.ax + w.bx) / 2 - (w.by - w.ay) * off) * k;
        const ly = ((w.ay + w.by) / 2 + (w.bx - w.ax) * off) * k;
        return (
          <g key={w.id} onPointerDown={(e) => onPress(e, w.id)} style={{ cursor: pickable ? "pointer" : undefined }}>
            <line x1={w.ax * k} y1={w.ay * k} x2={w.bx * k} y2={w.by * k} stroke={m ?? INK.wall} strokeWidth={Math.max(2.5, w.thickness * k)} strokeLinecap="square" />
            <line x1={w.ax * k} y1={w.ay * k} x2={w.bx * k} y2={w.by * k} stroke="transparent" strokeWidth={Math.max(14, w.thickness * k + 6)} />
            {k > 35 && len > 0.8 && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(9, Math.min(12, 0.17 * k))} fill={INK.dim} fontFamily="ui-monospace, monospace" pointerEvents="none">
                {len.toFixed(2)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function OpeningMark({ o, wall, k, colour }: { o: Opening; wall: Wall; k: number; colour: string | null }) {
  const [a, b] = openingEnds(wall, o);
  if (o.kind === "door") {
    return (
      <>
        {doorLeaves(wall, o).map((leaf, i) => {
          const d = leafPath(leaf, k);
          return (
            <g key={i}>
              <path d={d.arc} fill="none" stroke={colour ?? INK.door} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.85} />
              <path d={d.leaf} stroke={colour ?? INK.door} strokeWidth={2.4} strokeLinecap="round" />
            </g>
          );
        })}
      </>
    );
  }
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
  const nx = (-(wall.by - wall.ay) / len) * wall.thickness * 0.32;
  const ny = ((wall.bx - wall.ax) / len) * wall.thickness * 0.32;
  return (
    <>
      {[-1, 0, 1].map((s) => (
        <line key={s} x1={(a.x + nx * s) * k} y1={(a.y + ny * s) * k} x2={(b.x + nx * s) * k} y2={(b.y + ny * s) * k} stroke={colour ?? INK.window} strokeWidth={s === 0 ? 2 : 1} />
      ))}
    </>
  );
}

export function OpeningsLayer({ model, k, mark, onPress, pickable }: { model: PlanModel; k: number; mark: Marker; onPress: Press; pickable: boolean }) {
  const walls = new Map(model.walls.map((w) => [w.id, w]));
  return (
    <g>
      {model.openings.map((o) => {
        const wall = walls.get(o.wallId);
        if (!wall) return null;
        const [a, b] = openingEnds(wall, o);
        const gap = Math.max(3, wall.thickness * k + 1);
        return (
          <g key={o.id} onPointerDown={(e) => onPress(e, o.id)} style={{ cursor: pickable ? "pointer" : undefined }}>
            <line x1={a.x * k} y1={a.y * k} x2={b.x * k} y2={b.y * k} stroke={FLOOR_TINT.concrete} strokeWidth={gap} />
            <OpeningMark o={o} wall={wall} k={k} colour={mark(o.id)} />
            <line x1={a.x * k} y1={a.y * k} x2={b.x * k} y2={b.y * k} stroke="transparent" strokeWidth={gap + 8} />
          </g>
        );
      })}
    </g>
  );
}

export function RouteLayer({ points, k }: { points: Pt[]; k: number }) {
  if (points.length < 2) return null;
  return (
    <g pointerEvents="none">
      <polyline points={points.map((p) => `${p.x * k},${p.y * k}`).join(" ")} fill="none" stroke={INK.proposed} strokeWidth={3} strokeDasharray="10 6" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x * k} cy={p.y * k} r={i === 0 || i === points.length - 1 ? 6 : 4} fill={INK.proposed} />
      ))}
    </g>
  );
}
