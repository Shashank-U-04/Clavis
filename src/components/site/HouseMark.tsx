"use client";

/**
 * The Clavis mark set out as a drawing: the walls and the door at full size, with the
 * construction lines a draughtsman would leave. The wall faces run past their corners, the
 * door's swing is completed as a dashed circle, and the opening is dimensioned.
 *
 * When it comes into view the faces are set out, the walls drawn over them, and then the door
 * swings open from the closed position and settles. Reduced motion shows it open.
 */

import { useEffect, useRef, useState } from "react";
import { MARK } from "./Logo";
import { useFirstSight } from "./useFirstSight";

const K = 3; // the 32-unit mark, three times up
const O = 16; // where it sits on the sheet

/** The door's hinge and leaf length on the 32-unit grid (see MARK.door). */
const HINGE = [25.5, 21] as const;
const LEAF = 10;
const SWING: [number, number] = [1350, 2350];

/** The swept part of the door at `deg` open: 0 is shut in the opening, 90 is MARK.door. */
function door(deg: number) {
  const a = (deg * Math.PI) / 180;
  const [hx, hy] = HINGE;
  const ex = hx - LEAF * Math.sin(a);
  const ey = hy - LEAF * Math.cos(a);
  return `M${hx} ${hy}L${ex.toFixed(3)} ${ey.toFixed(3)}A${LEAF} ${LEAF} 0 0 1 ${hx} ${hy - LEAF}Z`;
}

/** Opens past square and settles back, like a door let go. */
const settle = (v: number) => {
  const c = 1.4;
  return 1 + (c + 1) * (v - 1) ** 3 + c * (v - 1) ** 2;
};

export function HouseMark({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const leaf = useRef<SVGPathElement>(null);
  const { seen, still } = useFirstSight(ref, 0.4);
  // shut until JavaScript knows whether to play; the server and no-script render show it open
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      leaf.current?.setAttribute("d", door(0));
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const el = leaf.current;
    if (!seen || !el) return;
    if (still) {
      el.setAttribute("d", MARK.door);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const v = Math.min(1, Math.max(0, (now - start - SWING[0]) / (SWING[1] - SWING[0])));
      el.setAttribute("d", door(90 * settle(v)));
      if (v < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [seen, still]);

  const at = (v: number) => O + v * K;
  const faces = [4, 9, 23, 28];
  const anim = ready ? `${seen ? "hm-on" : ""} ${still ? "hm-still" : ""}` : "hm-on hm-still";
  return (
    <svg ref={ref} viewBox="0 0 128 128" className={`${className} ${anim}`} aria-hidden="true">
      <g stroke="var(--color-ink-3)" strokeWidth={0.5} fill="none">
        {faces.map((f, i) => (
          <g key={f}>
            <path d={`M${at(f)} 6V122`} pathLength={1} className="hm-draw" style={{ transitionDelay: `${i * 90}ms` }} />
            <path d={`M6 ${at(f)}H122`} pathLength={1} className="hm-draw" style={{ transitionDelay: `${120 + i * 90}ms` }} />
          </g>
        ))}
        <circle cx={at(25.5)} cy={at(21)} r={10 * K} strokeDasharray="2 2.5" className="hm-fade" style={{ transitionDelay: "1100ms" }} />
      </g>
      <g transform={`translate(${O} ${O}) scale(${K})`}>
        <path d={MARK.walls} fill="none" stroke="currentColor" strokeWidth={5} pathLength={1} className="hm-draw" style={{ transitionDelay: "550ms", transitionDuration: "1s" }} />
        <path ref={leaf} d={MARK.door} fill="var(--color-marker)" />
      </g>
      {/* the opening, dimensioned on the east side */}
      <g stroke="var(--color-marker)" strokeWidth={0.7} fill="none" className="hm-fade" style={{ transitionDelay: "2300ms" }}>
        <path d={`M${at(31.2)} ${at(11)}V${at(21)}`} />
        <path d={`M${at(30.4)} ${at(11.8)}l${1.6 * K} ${-1.6 * K}M${at(30.4)} ${at(21.8)}l${1.6 * K} ${-1.6 * K}`} />
      </g>
    </svg>
  );
}
