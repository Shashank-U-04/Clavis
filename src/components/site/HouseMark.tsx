/**
 * The Clavis mark as a solid: the house-shaped keyhole pushed back into depth, drawn in line.
 * Only the side faces turned towards the viewer are drawn, then the front face over them.
 */

type Pt = [number, number];

const FRONT: Pt[] = [
  [10, 45],
  [50, 10],
  [90, 45],
  [90, 95],
  [10, 95],
];
const DEPTH: Pt = [30, -18];

const pts = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

export function HouseMark({ className = "" }: { className?: string }) {
  const sides = FRONT.map((a, i) => {
    const b = FRONT[(i + 1) % FRONT.length];
    // outward normal of a clockwise outline on screen (y down) is (dy, -dx)
    const n: Pt = [b[1] - a[1], -(b[0] - a[0])];
    return { a, b, seen: n[0] * DEPTH[0] + n[1] * DEPTH[1] > 0 };
  }).filter((s) => s.seen);
  const back = (p: Pt): Pt => [p[0] + DEPTH[0], p[1] + DEPTH[1]];

  return (
    <svg viewBox="0 -14 128 116" className={className} aria-hidden="true">
      <g fill="var(--color-paper)" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round">
        {sides.map((s, i) => (
          <polygon key={i} points={pts([s.a, s.b, back(s.b), back(s.a)])} />
        ))}
        <polygon points={pts(FRONT)} />
      </g>
      <circle cx={50} cy={53} r={9} fill="var(--color-marker)" />
      <path d="M46 60h8l3 20H43z" fill="var(--color-marker)" />
    </svg>
  );
}
