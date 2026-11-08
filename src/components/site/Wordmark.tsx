"use client";

/**
 * CLAVIS in construction lines: straight-edged letters drawn the way a draughtsman sets them
 * out, every edge running a little past its corner. The lines draw on when the footer comes
 * into view (at once with reduced motion).
 */

import { useEffect, useRef, useState } from "react";

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
const OVER = 5;

function lines(word: string) {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let x = 0;
  for (const ch of word) {
    const g = GLYPHS[ch];
    for (const shape of g.shapes) {
      shape.forEach((a, i) => {
        const b = shape[(i + 1) % shape.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / len;
        const uy = (b[1] - a[1]) / len;
        out.push({
          x1: x + a[0] - ux * OVER,
          y1: a[1] - uy * OVER,
          x2: x + b[0] + ux * OVER,
          y2: b[1] + uy * OVER,
        });
      });
    }
    x += g.w + GAP;
  }
  return { out, width: x - GAP };
}

const WORD = lines("CLAVIS");

export function Wordmark() {
  const ref = useRef<SVGSVGElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOn(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <noscript>
        <style>{".wm-line{stroke-dashoffset:0}"}</style>
      </noscript>
      <svg ref={ref} viewBox={`${-OVER - 4} ${-OVER - 4} ${WORD.width + 2 * OVER + 8} ${100 + 2 * OVER + 8}`} className={`block w-full ${on ? "wm-on" : ""}`} role="img" aria-label="Clavis">
        <g stroke="currentColor" strokeWidth={0.7} strokeLinecap="square">
          {WORD.out.map((l, i) => (
            <line key={i} {...l} pathLength={1} className="wm-line" style={{ transitionDelay: `${(i % 23) * 40}ms` }} />
          ))}
        </g>
      </svg>
    </>
  );
}
