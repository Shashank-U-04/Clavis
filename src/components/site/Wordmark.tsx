"use client";

/**
 * CLAVIS set out the way a draughtsman letters a title block. When the footer comes into view,
 * the cap line and baseline run across the sheet, then each letter is drawn edge by edge, every
 * line running a little past its corner, and its width is dimensioned above as it lands.
 * Last, a sweep cuts the letters in section and hatches them like walls on a plan.
 *
 * With a mouse, a drafting crosshair follows the pointer, snaps to the letters' corners and
 * reads out the coordinates; the letter under it is picked out in the marker colour.
 * Reduced motion shows the finished sheet at once.
 */

import { useEffect, useId, useRef } from "react";
import { useFirstSight } from "./useFirstSight";

type Pt = [number, number];
interface Glyph {
  w: number;
  shapes: Pt[][];
}

/** Letters on a 100-unit cap height, stems 22 units thick. */
const GLYPHS: Record<string, Glyph> = {
  C: {
    w: 90,
    shapes: [
      [
        [24, 0],
        [90, 0],
        [90, 22],
        [31, 22],
        [22, 31],
        [22, 69],
        [31, 78],
        [90, 78],
        [90, 100],
        [24, 100],
        [0, 76],
        [0, 24],
      ],
    ],
  },
  L: {
    w: 80,
    shapes: [
      [
        [0, 0],
        [22, 0],
        [22, 78],
        [80, 78],
        [80, 100],
        [0, 100],
      ],
    ],
  },
  A: {
    w: 90,
    shapes: [
      [
        [0, 100],
        [0, 30],
        [30, 0],
        [60, 0],
        [90, 30],
        [90, 100],
        [68, 100],
        [68, 64],
        [22, 64],
        [22, 100],
      ],
      [
        [22, 36],
        [36, 22],
        [54, 22],
        [68, 36],
        [68, 44],
        [22, 44],
      ],
    ],
  },
  V: {
    w: 90,
    shapes: [
      [
        [0, 0],
        [23, 0],
        [45, 70],
        [67, 0],
        [90, 0],
        [58, 100],
        [32, 100],
      ],
    ],
  },
  I: {
    w: 22,
    shapes: [
      [
        [0, 0],
        [22, 0],
        [22, 100],
        [0, 100],
      ],
    ],
  },
  S: {
    w: 90,
    shapes: [
      [
        [20, 0],
        [90, 0],
        [90, 22],
        [22, 22],
        [22, 39],
        [70, 39],
        [90, 59],
        [90, 80],
        [70, 100],
        [0, 100],
        [0, 78],
        [68, 78],
        [68, 61],
        [20, 61],
        [0, 41],
        [0, 20],
      ],
    ],
  },
};

const GAP = 30;
/** How far each construction line runs past its corner. */
const OVER = 5;

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Letter {
  x: number;
  w: number;
  /** The letter as one filled outline; counters are holes (even-odd). */
  d: string;
  edges: Seg[];
  corners: Pt[];
}

function setOut(word: string) {
  const letters: Letter[] = [];
  let x = 0;
  for (const ch of word) {
    const g = GLYPHS[ch];
    const edges: Seg[] = [];
    const corners: Pt[] = [];
    for (const shape of g.shapes) {
      shape.forEach((a, i) => {
        const b = shape[(i + 1) % shape.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / len;
        const uy = (b[1] - a[1]) / len;
        edges.push({ x1: x + a[0] - ux * OVER, y1: a[1] - uy * OVER, x2: x + b[0] + ux * OVER, y2: b[1] + uy * OVER });
        corners.push([x + a[0], a[1]]);
      });
    }
    const d = g.shapes.map((s) => `M${s.map(([px, py]) => `${x + px} ${py}`).join("L")}Z`).join("");
    letters.push({ x, w: g.w, d, edges, corners });
    x += g.w + GAP;
  }
  return { letters, width: x - GAP };
}

const { letters: LETTERS, width: W } = setOut("CLAVIS");
const CORNERS = LETTERS.flatMap((l) => l.corners);

/** The sheet around the letters: guide lines out to the sides, two dimension rows above. */
const VB = { x: -40, y: -56, w: W + 80, h: 100 + 56 + 14 };
const CHAIN_Y = -20;
const TOTAL_Y = -40;

/** The timeline, in milliseconds after the footer comes into view. */
const T = {
  letter: (k: number) => 420 + k * 260,
  edge: 42,
  dim: 560,
  total: 2350,
  fill: [2550, 3650] as const,
};

/** How close, in letter units, the crosshair must come to a corner to snap to it. */
const SNAP = 7;

const ease = (v: number) => 1 - (1 - v) ** 3;

function Dimension({ x1, x2, y, text, tone, delay, k }: { x1: number; x2: number; y: number; text: string; tone: "marker" | "soft"; delay: number; k?: number }) {
  const tick = (x: number) => `M${x - 2.4} ${y + 2.4}L${x + 2.4} ${y - 2.4}`;
  return (
    <g className={`wm-fade wm-dim wm-dim-${tone}`} data-k={k} style={{ transitionDelay: `${delay}ms` }}>
      <line x1={x1} x2={x2} y1={y} y2={y} />
      <path d={tick(x1) + tick(x2)} />
      <text x={(x1 + x2) / 2} y={y - 3} textAnchor="middle" className="wm-text">
        {text}
      </text>
    </g>
  );
}

export function Wordmark() {
  const ref = useRef<SVGSVGElement>(null);
  const reveal = useRef<SVGRectElement>(null);
  const head = useRef<SVGLineElement>(null);
  const cursor = useRef<SVGGElement>(null);
  const hot = useRef(-1);
  const { seen, still } = useFirstSight(ref);
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const hatchId = `wm-hatch-${uid}`;
  const cutId = `wm-cut-${uid}`;
  const fullCut = W + 2 * OVER;

  // the section cut: a sweep line crosses the word and the hatching follows it
  useEffect(() => {
    const rect = reveal.current;
    const line = head.current;
    if (!seen || !rect || !line) return;
    if (still) {
      rect.setAttribute("width", String(fullCut));
      return;
    }
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const v = Math.min(1, Math.max(0, (now - start - T.fill[0]) / (T.fill[1] - T.fill[0])));
      const w = fullCut * ease(v);
      rect.setAttribute("width", w.toFixed(2));
      line.setAttribute("x1", (w - OVER).toFixed(2));
      line.setAttribute("x2", (w - OVER).toFixed(2));
      line.style.opacity = v > 0 && v < 1 ? "1" : "0";
      if (v < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seen, still, fullCut]);

  // the crosshair is written straight onto the drawing, so the letters never re-render
  const pick = (k: number) => {
    if (k === hot.current) return;
    hot.current = k;
    ref.current?.querySelectorAll("[data-k]").forEach((el) => el.classList.toggle("is-hot", el.getAttribute("data-k") === String(k)));
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = ref.current;
    const g = cursor.current;
    const m = svg?.getScreenCTM();
    if (e.pointerType !== "mouse" || !svg || !g || !m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    let x = p.x;
    let y = p.y;
    let best = SNAP;
    for (const [cx, cy] of CORNERS) {
      const dist = Math.hypot(cx - p.x, cy - p.y);
      if (dist < best) {
        best = dist;
        x = cx;
        y = cy;
      }
    }
    const snapped = best < SNAP;
    const [vertical, horizontal, box, label] = Array.from(g.children) as SVGElement[];
    vertical.setAttribute("x1", String(x));
    vertical.setAttribute("x2", String(x));
    horizontal.setAttribute("y1", String(y));
    horizontal.setAttribute("y2", String(y));
    box.setAttribute("x", String(x - 2.5));
    box.setAttribute("y", String(y - 2.5));
    box.style.opacity = snapped ? "1" : "0";
    const flip = x > W - 70;
    label.setAttribute("x", String(flip ? x - 5 : x + 5));
    label.setAttribute("y", String(y - 5));
    label.setAttribute("text-anchor", flip ? "end" : "start");
    label.textContent = `X ${Math.round(x)}  Y ${Math.round(100 - y)}${snapped ? "  END" : ""}`;
    g.style.opacity = "1";
    pick(y > -OVER && y < 100 + OVER ? LETTERS.findIndex((l) => x >= l.x - GAP / 2 && x <= l.x + l.w + GAP / 2) : -1);
  };

  const onLeave = () => {
    if (cursor.current) cursor.current.style.opacity = "0";
    pick(-1);
  };

  return (
    <>
      <noscript>
        <style>{".wm-draw{stroke-dashoffset:0}.wm-fade{opacity:1}.wm-cut{clip-path:none}"}</style>
      </noscript>
      <svg
        ref={ref}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        className={`wm block w-full ${seen ? "wm-on" : ""} ${still ? "wm-still" : ""}`}
        role="img"
        aria-label="Clavis"
        onPointerMove={onMove}
        onPointerLeave={onLeave}
      >
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width={4.5} height={4.5} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={4.5} stroke="var(--color-ink-2)" strokeWidth={0.6} />
          </pattern>
          <clipPath id={cutId}>
            <rect ref={reveal} x={-OVER} y={-OVER} width={0} height={100 + 2 * OVER} />
          </clipPath>
        </defs>

        {/* guide lines: cap line and baseline drawn across, half height dashed */}
        <g>
          {[0, 100].map((y) => (
            <line key={y} x1={VB.x + 4} x2={W + 36} y1={y} y2={y} pathLength={1} className="wm-draw wm-guide" />
          ))}
          <line x1={VB.x + 4} x2={W + 36} y1={50} y2={50} className="wm-fade wm-guide-mid" style={{ transitionDelay: "500ms" }} />
          <g className="wm-fade" style={{ transitionDelay: "300ms" }}>
            <text x={VB.x + 4} y={-3} className="wm-text">
              CAP
            </text>
            <text x={VB.x + 4} y={97} className="wm-text">
              BASE
            </text>
          </g>
        </g>

        {/* the dimension chain: each letter in marker, the spaces between them soft, then the overall */}
        <g className="wm-dims">
          {LETTERS.map((l, k) => (
            <g key={k}>
              <g className="wm-fade wm-ext" style={{ transitionDelay: `${T.letter(k) + T.dim}ms` }}>
                <line x1={l.x} x2={l.x} y1={-8} y2={CHAIN_Y - 4} />
                <line x1={l.x + l.w} x2={l.x + l.w} y1={-8} y2={CHAIN_Y - 4} />
              </g>
              <Dimension x1={l.x} x2={l.x + l.w} y={CHAIN_Y} text={String(l.w)} tone="marker" delay={T.letter(k) + T.dim} k={k} />
              {k > 0 && <Dimension x1={LETTERS[k - 1].x + LETTERS[k - 1].w} x2={l.x} y={CHAIN_Y} text={String(GAP)} tone="soft" delay={T.letter(k) + T.dim} />}
            </g>
          ))}
          <g className="wm-fade wm-ext" style={{ transitionDelay: `${T.total}ms` }}>
            <line x1={0} x2={0} y1={CHAIN_Y - 4} y2={TOTAL_Y - 4} />
            <line x1={W} x2={W} y1={CHAIN_Y - 4} y2={TOTAL_Y - 4} />
          </g>
          <Dimension x1={0} x2={W} y={TOTAL_Y} text={`${W} OVERALL`} tone="soft" delay={T.total} />
        </g>

        {/* the letters: hatched in section behind the cut, construction lines on top */}
        {LETTERS.map((l, k) => (
          <g key={k} className="wm-letter" data-k={k}>
            <g className="wm-cut" clipPath={`url(#${cutId})`}>
              <path d={l.d} fillRule="evenodd" className="wm-tint" />
              <path d={l.d} fillRule="evenodd" fill={`url(#${hatchId})`} />
            </g>
            <g className="wm-edges">
              {l.edges.map((e, j) => (
                <line key={j} {...e} pathLength={1} className="wm-draw" style={{ transitionDelay: `${T.letter(k) + j * T.edge}ms, 0ms` }} />
              ))}
            </g>
          </g>
        ))}

        <line ref={head} x1={0} x2={0} y1={-OVER - 8} y2={100 + OVER + 8} className="wm-head" />

        <g ref={cursor} className="wm-cursor" aria-hidden="true">
          <line x1={0} x2={0} y1={VB.y} y2={VB.y + VB.h} />
          <line x1={VB.x} x2={VB.x + VB.w} y1={0} y2={0} />
          <rect width={5} height={5} />
          <text className="wm-text" />
        </g>
      </svg>
    </>
  );
}
