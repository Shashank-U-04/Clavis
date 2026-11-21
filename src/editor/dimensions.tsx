/**
 * Measurements drawn on the plan, as a drafter would: dimension lines with ticks and the
 * length written on them.
 *
 *  - the building's overall width and depth, outside its walls;
 *  - the selected room's clear width and depth, inside it;
 *  - the selected piece's size, and how far it stands from each wall of its room.
 *
 * Everything is in metres; the layer draws in screen pixels (metres × k) like the others.
 */

import type { Item, PlanModel, Room } from "../model/types";
import type { Pt } from "../model/geometry";
import { itemSize } from "../model/catalog";
import { extentOf } from "./useViewport";
import { INK } from "./layers";

const fmt = (m: number) => (m >= 10 ? m.toFixed(1) : m.toFixed(2));

/** One dimension line from a to b, pushed `off` metres to its left, with its length written on it. */
export function DimLine({ a, b, off = 0, k, colour = INK.dim, label }: { a: Pt; b: Pt; off?: number; k: number; colour?: string; label?: string }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  // left-hand normal on screen (y grows downwards)
  const nx = uy;
  const ny = -ux;
  const A = { x: (a.x + nx * off) * k, y: (a.y + ny * off) * k };
  const B = { x: (b.x + nx * off) * k, y: (b.y + ny * off) * k };
  const tick = 5;
  // ticks are short 45° strokes, the drafter's mark for a dimension's ends
  const tx = (ux + nx) * tick * 0.7;
  const ty = (uy + ny) * tick * 0.7;
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  let angle = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180; // keep the text upright
  const text = label ?? `${fmt(len)} m`;
  const fs = 11;
  const room = len * k > text.length * fs * 0.62 + 10; // does the text fit between the ticks?
  return (
    <g pointerEvents="none" stroke={colour} fill={colour}>
      {off !== 0 && (
        <>
          <line x1={a.x * k} y1={a.y * k} x2={A.x + nx * 4} y2={A.y + ny * 4} strokeWidth={0.6} opacity={0.6} />
          <line x1={b.x * k} y1={b.y * k} x2={B.x + nx * 4} y2={B.y + ny * 4} strokeWidth={0.6} opacity={0.6} />
        </>
      )}
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} strokeWidth={1} />
      <line x1={A.x - tx} y1={A.y - ty} x2={A.x + tx} y2={A.y + ty} strokeWidth={1.4} />
      <line x1={B.x - tx} y1={B.y - ty} x2={B.x + tx} y2={B.y + ty} strokeWidth={1.4} />
      <text
        x={mid.x + (room ? 0 : nx * 12)}
        y={mid.y + (room ? 0 : ny * 12)}
        transform={`rotate(${angle} ${mid.x + (room ? 0 : nx * 12)} ${mid.y + (room ? 0 : ny * 12)})`}
        textAnchor="middle"
        dy={-4}
        fontSize={fs}
        fontFamily="ui-monospace, monospace"
        stroke="var(--plan-paper)"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {text}
      </text>
    </g>
  );
}

/** The axis-aligned box a placed piece covers, whatever way it faces. */
export function itemBounds(it: Item): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const s = itemSize(it);
  if (!s) return null;
  const a = (it.rotation * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(a)) * s.w + Math.abs(Math.sin(a)) * s.d) / 2;
  const hd = (Math.abs(Math.sin(a)) * s.w + Math.abs(Math.cos(a)) * s.d) / 2;
  return { minX: it.x - hw, minY: it.y - hd, maxX: it.x + hw, maxY: it.y + hd };
}

const roomAt = (rooms: Room[], p: Pt) => rooms.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

/** The building's overall width (above it) and depth (to its left). */
export function OverallDimensions({ model, k }: { model: PlanModel; k: number }) {
  const e = extentOf({ ...model, rooms: [] }) ?? extentOf(model);
  if (!e || e.maxX - e.minX < 0.5) return null;
  const gap = Math.max(0.6, 28 / k);
  return (
    <g data-dims="overall">
      <DimLine a={{ x: e.minX, y: e.minY }} b={{ x: e.maxX, y: e.minY }} off={gap} k={k} />
      <DimLine a={{ x: e.minX, y: e.maxY }} b={{ x: e.minX, y: e.minY }} off={gap} k={k} />
    </g>
  );
}

/** The selected room's clear width and depth, drawn just inside its walls. */
export function RoomDimensions({ room, k }: { room: Room; k: number }) {
  const inset = Math.min(0.35, room.h / 4, room.w / 4);
  return (
    <g data-dims="room">
      <DimLine a={{ x: room.x + room.w, y: room.y + inset }} b={{ x: room.x, y: room.y + inset }} k={k} colour={INK.selected} />
      <DimLine a={{ x: room.x + inset, y: room.y }} b={{ x: room.x + inset, y: room.y + room.h }} k={k} colour={INK.selected} />
    </g>
  );
}

/** The selected piece: its size, and the clear distance from it to each wall of its room. */
export function ItemDimensions({ item, rooms, k }: { item: Item; rooms: Room[]; k: number }) {
  const b = itemBounds(item);
  const s = itemSize(item);
  if (!b || !s) return null;
  const room = roomAt(rooms, item);
  const lines: { a: Pt; b: Pt }[] = [];
  if (room) {
    const cy = item.y;
    const cx = item.x;
    if (b.minX - room.x > 0.02) lines.push({ a: { x: room.x, y: cy }, b: { x: b.minX, y: cy } });
    if (room.x + room.w - b.maxX > 0.02) lines.push({ a: { x: b.maxX, y: cy }, b: { x: room.x + room.w, y: cy } });
    if (b.minY - room.y > 0.02) lines.push({ a: { x: cx, y: room.y }, b: { x: cx, y: b.minY } });
    if (room.y + room.h - b.maxY > 0.02) lines.push({ a: { x: cx, y: b.maxY }, b: { x: cx, y: room.y + room.h } });
  }
  return (
    <g data-dims="item">
      {lines.map((l, i) => (
        <DimLine key={i} a={l.a} b={l.b} k={k} colour={INK.selected} />
      ))}
      <text
        x={item.x * k}
        y={b.maxY * k + 14}
        textAnchor="middle"
        fontSize={11}
        fontFamily="ui-monospace, monospace"
        fill={INK.selected}
        stroke="var(--plan-paper)"
        strokeWidth={3}
        paintOrder="stroke"
        pointerEvents="none"
      >
        {fmt(s.w)} × {fmt(s.d)} m
      </text>
    </g>
  );
}
