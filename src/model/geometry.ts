/**
 * Plane geometry for the plan. Metres; x grows east, y grows south (screen-down).
 *
 * Everything here is pure and deterministic: the validator, the layout builder and the
 * local design engine all rely on getting the same answer for the same input.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Grid used for snapping coordinates typed or dragged by a person. */
export const SNAP = 0.05;

export const snap = (value: number, step = SNAP): number => Math.round(value / step) * step;
export const clamp = (value: number, lo: number, hi: number): number => (value < lo ? lo : value > hi ? hi : value);
export const nearly = (a: number, b: number, tolerance = 1e-6): boolean => Math.abs(a - b) <= tolerance;

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
/** z component of the 3D cross product: > 0 when b is clockwise of a on screen (y down) */
const perp = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const segLen = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);

/** The point a fraction t of the way from a to b. */
export const segPoint = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Fraction along a→b of the point on that line closest to p (not clamped). */
export function projectT(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  return len2 === 0 ? 0 : dot(sub(p, a), ab) / len2;
}

/** Shortest distance from p to the segment a–b. */
export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  return dist(p, segPoint(a, b, clamp(projectT(p, a, b), 0, 1)));
}

export const pointOnSeg = (p: Pt, a: Pt, b: Pt, tolerance = 1e-6): boolean => pointSegDist(p, a, b) <= tolerance;

// ---------------------------------------------------------------------------
// Segment relations (walls)
// ---------------------------------------------------------------------------

/** Both points of q lie on the infinite line through p1–p2 (within `tolerance` metres). */
export function sameLine(p1: Pt, p2: Pt, q1: Pt, q2: Pt, tolerance = 1e-5): boolean {
  const d = sub(p2, p1);
  const len = Math.hypot(d.x, d.y);
  if (len < 1e-9 || dist(q1, q2) < 1e-9) return false;
  return Math.abs(perp(d, sub(q1, p1))) / len <= tolerance && Math.abs(perp(d, sub(q2, p1))) / len <= tolerance;
}

/**
 * Length shared by two segments on the same line. Zero when they are not on one line or
 * only touch end to end.
 */
export function sharedLength(p1: Pt, p2: Pt, q1: Pt, q2: Pt): number {
  if (!sameLine(p1, p2, q1, q2)) return 0;
  const len = dist(p1, p2);
  const a = projectT(q1, p1, p2) * len;
  const b = projectT(q2, p1, p2) * len;
  const overlap = Math.min(len, Math.max(a, b)) - Math.max(0, Math.min(a, b));
  return overlap > 1e-6 ? overlap : 0;
}

/**
 * True when the two segments pass through each other strictly inside both of them.
 * Segments that only meet at an end (an L or a T junction) do not cross.
 */
export function crossesMidSpan(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const denom = perp(r, s);
  if (Math.abs(denom) < 1e-12) return false; // parallel
  const qp = sub(q1, p1);
  const t = perp(qp, s) / denom;
  const u = perp(qp, r) / denom;
  const inside = (v: number, length: number) => v * length > 1e-6 && (1 - v) * length > 1e-6;
  return inside(t, Math.hypot(r.x, r.y)) && inside(u, Math.hypot(s.x, s.y));
}

// ---------------------------------------------------------------------------
// Oriented boxes (furniture, walls, clearance zones)
// ---------------------------------------------------------------------------

/**
 * A rectangle rotated about its centre. `halfW` runs along the local x axis, `halfD` along
 * local y; `angle` turns local x towards +y (radians).
 */
export interface Box {
  x: number;
  y: number;
  halfW: number;
  halfD: number;
  angle: number;
}

const axesOf = (b: Box): [Pt, Pt] => {
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return [
    { x: c, y: s },
    { x: -s, y: c },
  ];
};

export function boxCorners(b: Box): Pt[] {
  const [u, v] = axesOf(b);
  return [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([i, j]) => ({ x: b.x + u.x * b.halfW * i + v.x * b.halfD * j, y: b.y + u.y * b.halfW * i + v.y * b.halfD * j }));
}

/** Half the length of a box's shadow on a unit axis. */
const radiusOn = (b: Box, axis: Pt): number => {
  const [u, v] = axesOf(b);
  return b.halfW * Math.abs(dot(u, axis)) + b.halfD * Math.abs(dot(v, axis));
};

/**
 * Separating-axis test. The boxes intersect when they overlap by more than `margin` metres
 * on every one of their four edge directions; touching (or overlapping less than the margin)
 * does not count.
 */
export function boxesOverlap(a: Box, b: Box, margin = 1e-9): boolean {
  const centres = { x: b.x - a.x, y: b.y - a.y };
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const gap = Math.abs(dot(centres, axis)) - (radiusOn(a, axis) + radiusOn(b, axis));
    if (gap >= -margin) return false;
  }
  return true;
}

/** The solid body of a wall as a box. */
export function wallBox(w: { ax: number; ay: number; bx: number; by: number; thickness: number }): Box {
  return {
    x: (w.ax + w.bx) / 2,
    y: (w.ay + w.by) / 2,
    halfW: segLen(w.ax, w.ay, w.bx, w.by) / 2,
    halfD: w.thickness / 2,
    angle: Math.atan2(w.by - w.ay, w.bx - w.ax),
  };
}

// ---------------------------------------------------------------------------
// Axis-aligned rectangles (rooms)
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Interiors intersect by more than `margin`; shared edges do not count. */
export function rectsOverlap(a: Rect, b: Rect, margin = 1e-9): boolean {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > margin && oy > margin;
}

export const pointInRect = (p: Pt, r: Rect, tolerance = 0): boolean =>
  p.x >= r.x - tolerance && p.x <= r.x + r.w + tolerance && p.y >= r.y - tolerance && p.y <= r.y + r.h + tolerance;
