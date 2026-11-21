/**
 * A tiny axonometric drawing engine for explanatory figures.
 *
 * The projection is a plan oblique, the architect's 30°/60° axonometric: the plan is drawn
 * true to scale and turned 30°, and heights go straight up. Right angles in plan stay right
 * angles and every length on the floor is measured at the same scale, so the drawing never
 * looks squashed the way an isometric diamond does.
 *
 * World: metres, X and Y on the floor, Z up. X runs down-right at 30° below the horizontal,
 * Y down-left at 60°. The viewer looks from the +X/+Y side, so of each box we see its top and
 * the faces turned towards +X and +Y.
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
const SIN30 = 0.5;

/** On-screen angles of the two floor axes, for text set along them (degrees, reading upright). */
export const AXIS_X_DEG = 30;
export const AXIS_Y_DEG = -60;

/** World → drawing units (multiply by the figure's scale to get pixels). */
export function project(x: number, y: number, z: number): P2 {
  return { x: x * COS30 - y * SIN30, y: x * SIN30 + y * COS30 - z };
}

/**
 * How a figure is being looked at, so it can be turned like a model on a turntable. `turn` is
 * how far the plan is turned (radians; the figures rest at 30°). `flat` foreshortens the plan
 * (1 = true plan oblique, less = looking from lower down) and `lift` scales heights (1 = true,
 * less = looking from higher up, towards a plan).
 */
export interface View {
  turn: number;
  flat: number;
  lift: number;
}

export const REST: View = { turn: Math.PI / 6, flat: 1, lift: 1 };

export type Projector = (x: number, y: number, z: number) => P2;

/**
 * A projection for a view, turning the plan about `pivot`. At REST it is exactly `project`, so
 * a drawing made with `project` can be turned without jumping.
 */
export function projector(v: View, pivot: P2 = { x: 0, y: 0 }): Projector {
  const c = Math.cos(v.turn);
  const s = Math.sin(v.turn);
  const o = project(pivot.x, pivot.y, 0);
  return (x, y, z) => {
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return { x: o.x + dx * c - dy * s, y: o.y + (dx * s + dy * c) * v.flat - z * v.lift };
  };
}

const fmt = (pts: P2[], k: number) => pts.map((p) => `${(p.x * k).toFixed(1)},${(p.y * k).toFixed(1)}`).join(" ");

/** The three visible faces of a box, as SVG polygon point lists at scale `k`. */
export function boxFaces(b: Box3, k: number): Face[] {
  return boxFacesAt(b, k, project, REST.turn);
}

/**
 * The visible faces of a box seen at `turn`: always the face across X towards the viewer,
 * then the one across Y, then the top, so a figure can update its polygons in place as it
 * turns. Light comes from the right: a face looking to the right on the page is the lighter
 * "left" tone, one looking left the darker "right" tone.
 */
export function boxFacesAt(b: Box3, k: number, P: Projector, turn: number): Face[] {
  const { x0, y0, z0, x1, y1, z1 } = b;
  const s = Math.sin(turn);
  const c = Math.cos(turn);
  const fx = s >= 0 ? x1 : x0; // the X face the viewer sees
  const fy = c >= 0 ? y1 : y0;
  const faces: Face[] = [];
  if (z1 - z0 > 1e-6) {
    faces.push({ tone: (s >= 0 ? 1 : -1) * c > 0 ? "left" : "right", points: fmt([P(fx, y0, z0), P(fx, y1, z0), P(fx, y1, z1), P(fx, y0, z1)], k) });
    faces.push({ tone: (c >= 0 ? 1 : -1) * -s > 0 ? "left" : "right", points: fmt([P(x0, fy, z0), P(x1, fy, z0), P(x1, fy, z1), P(x0, fy, z1)], k) });
  }
  faces.push({ tone: "top", points: fmt([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], k) });
  return faces;
}

/** A flat polygon on a horizontal plane at height z. */
export const flatPolygon = (pts: { x: number; y: number }[], z: number, k: number, P: Projector = project): string => fmt(pts.map((p) => P(p.x, p.y, z)), k);

/** Screen-space bounding box of a world box (in drawing units). */
function screenBounds(b: Box3, P: Projector) {
  const corners = [
    P(b.x0, b.y0, b.z0),
    P(b.x1, b.y0, b.z0),
    P(b.x0, b.y1, b.z0),
    P(b.x1, b.y1, b.z0),
    P(b.x0, b.y0, b.z1),
    P(b.x1, b.y0, b.z1),
    P(b.x0, b.y1, b.z1),
    P(b.x1, b.y1, b.z1),
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
export function paintOrder<T extends { box: Box3 }>(items: T[], P: Projector = project, turn = REST.turn): T[] {
  return paintIndices(items.map((i) => i.box), P, turn).map((i) => items[i]);
}

/**
 * Painter's order as indices, for a figure seen at `turn`. The boxes are mirrored so the viewer
 * is always on their +X/+Y side, which is what `behind` assumes.
 */
export function paintIndices(boxes: Box3[], P: Projector = project, turn = REST.turn): number[] {
  const mx = Math.sin(turn) >= 0;
  const my = Math.cos(turn) >= 0;
  const seen = boxes.map((b) => ({ x0: mx ? b.x0 : -b.x1, x1: mx ? b.x1 : -b.x0, y0: my ? b.y0 : -b.y1, y1: my ? b.y1 : -b.y0, z0: b.z0, z1: b.z1 }));
  const items = seen.map((box) => ({ box }));
  const n = items.length;
  const bounds = boxes.map((b) => screenBounds(b, P));
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
  return out;
}
