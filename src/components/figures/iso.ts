/**
 * A tiny isometric drawing engine for explanatory figures.
 *
 * World: metres, X and Y on the floor, Z up. The viewer looks from the +X/+Y side at 30°
 * above the floor, so of each box we see its top and the faces turned towards +X and +Y.
 * Solids are opaque and painted back to front, so nearer parts hide farther ones; there are
 * no wireframes and no hidden lines.
 */

export interface P2 {
  x: number;
  y: number;
}

/** An axis-aligned box in world metres. */
export interface Box3 {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

export type Tone = "top" | "left" | "right";

export interface Face {
  points: string;
  tone: Tone;
}

const COS30 = Math.cos(Math.PI / 6);

/** World → drawing units (multiply by the figure's scale to get pixels). */
export function project(x: number, y: number, z: number): P2 {
  return { x: (x - y) * COS30, y: (x + y) * 0.5 - z };
}

const fmt = (pts: P2[], k: number) => pts.map((p) => `${(p.x * k).toFixed(1)},${(p.y * k).toFixed(1)}`).join(" ");

/** The three visible faces of a box, as SVG polygon point lists at scale `k`. */
export function boxFaces(b: Box3, k: number): Face[] {
  const { x0, y0, z0, x1, y1, z1 } = b;
  const P = project;
  const faces: Face[] = [];
  // the face turned to +X, then the one turned to +Y, then the top
  if (z1 - z0 > 1e-6) {
    faces.push({ tone: "left", points: fmt([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], k) });
    faces.push({ tone: "right", points: fmt([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], k) });
  }
  faces.push({ tone: "top", points: fmt([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], k) });
  return faces;
}

/** A flat polygon on a horizontal plane at height z. */
export const flatPolygon = (pts: { x: number; y: number }[], z: number, k: number): string => fmt(pts.map((p) => project(p.x, p.y, z)), k);

/** Screen-space bounding box of a world box (in drawing units). */
function screenBounds(b: Box3) {
  const corners = [
    project(b.x0, b.y0, b.z0),
    project(b.x1, b.y0, b.z0),
    project(b.x0, b.y1, b.z0),
    project(b.x1, b.y1, b.z0),
    project(b.x0, b.y0, b.z1),
    project(b.x1, b.y0, b.z1),
    project(b.x0, b.y1, b.z1),
    project(b.x1, b.y1, b.z1),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const EPS = 1e-6;

/**
 * Whether `a` must be painted before `b`. Only boxes whose pictures overlap are compared.
 * Separated along X or Y: the one farther from the viewer (smaller coordinate) goes first.
 * Stacked: the lower one goes first.
 */
function behind(a: Box3, b: Box3): boolean | null {
  if (a.x1 <= b.x0 + EPS) return true;
  if (b.x1 <= a.x0 + EPS) return false;
  if (a.y1 <= b.y0 + EPS) return true;
  if (b.y1 <= a.y0 + EPS) return false;
  if (a.z1 <= b.z0 + EPS) return true;
  if (b.z1 <= a.z0 + EPS) return false;
  return null; // the boxes intersect; fall back to the depth key
}

/**
 * Painter's order for a set of boxes: a topological sort of the "behind" relation between
 * boxes whose pictures overlap, ties (and any cycle) broken by distance from the viewer.
 */
export function paintOrder<T extends { box: Box3 }>(items: T[]): T[] {
  const n = items.length;
  const bounds = items.map((i) => screenBounds(i.box));
  const key = (i: number) => items[i].box.x0 + items[i].box.y0 + items[i].box.z0 * 0.01;
  const after: number[][] = items.map(() => []);
  const incoming = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = bounds[i];
      const B = bounds[j];
      if (A.maxX <= B.minX + EPS || B.maxX <= A.minX + EPS || A.maxY <= B.minY + EPS || B.maxY <= A.minY + EPS) continue;
      const r = behind(items[i].box, items[j].box);
      const [first, second] = r === null ? (key(i) <= key(j) ? [i, j] : [j, i]) : r ? [i, j] : [j, i];
      after[first].push(second);
      incoming[second]++;
    }
  }
  const ready = [...Array(n).keys()].filter((i) => incoming[i] === 0);
  const out: number[] = [];
  const done = new Array(n).fill(false);
  while (out.length < n) {
    if (ready.length === 0) {
      // a cycle: release the farthest unplaced box
      const rest = [...Array(n).keys()].filter((i) => !done[i]).sort((a, b) => key(a) - key(b));
      ready.push(rest[0]);
      incoming[rest[0]] = 0;
    }
    ready.sort((a, b) => key(a) - key(b));
    const i = ready.shift()!;
    if (done[i]) continue;
    done[i] = true;
    out.push(i);
    for (const j of after[i]) if (--incoming[j] === 0 && !done[j]) ready.push(j);
  }
  return out.map((i) => items[i]);
}
