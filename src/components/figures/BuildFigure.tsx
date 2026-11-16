"use client";

/**
 * The Sunset Loft, built live. The plan is set out on the ground, the walls rise back to
 * front, doors and glazing go in, the furniture is lowered into place, and then a scan band
 * sweeps down the sheet turning the line drawing into a shaded one. Room labels and the
 * build log finish it. Every number on it comes from the real design.
 *
 * It plays once when it comes into view (after the opening sheet has lifted); Replay plays it again. With reduced motion (or
 * without JavaScript) it shows the finished drawing.
 *
 * The drawing is static markup; the animation writes attributes straight onto it each frame,
 * so React renders it once.
 */

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { boxFaces, type Box3 } from "./iso";
import type { FigureData, SolidKind } from "./sunsetFigure";

export interface BuildStep {
  code: string;
  title: string;
  detail: string;
}

const RENDER = {
  wall: { top: "#15171c", left: "#d6d0c2", right: "#c4bdad" },
  item: { top: "#fbfaf6", left: "#e2ddd1", right: "#d2ccbe" },
  leaf: { top: "#fbfaf6", left: "#e9e4d8", right: "#dcd6c8" },
  glass: { top: "#9fb9c6", left: "#c4d8e2", right: "#b6ccd7" },
  rug: { top: "#e3d7c4", left: "#e3d7c4", right: "#e3d7c4" },
} as const satisfies Record<SolidKind, Record<string, string>>;

/** Phases of the build, in milliseconds from the start. */
const PH = {
  plan: [0, 1500],
  walls: [1000, 4400],
  open: [4100, 5300],
  items: [5100, 7900],
  scan: [8000, 10300],
  notes: [10100, 11100],
} as const;
const END = 11200;
/** When each line of the log starts, matching the phases above. */
const STEP_AT = [0, 400, PH.walls[0], PH.open[0], PH.items[0], PH.scan[0], PH.notes[0], END - 200];

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const within = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));

interface Plan {
  start: number;
  dur: number;
  rise: boolean;
}

/** When each solid starts and how it arrives: walls and openings rise, furniture is lowered. */
function schedule(data: FigureData): Plan[] {
  const kindOf = (k: SolidKind) => (k === "wall" ? "walls" : k === "glass" || k === "leaf" ? "open" : "items");
  const groups: Record<string, string[]> = { walls: [], open: [], items: [] };
  for (const s of data.solids) {
    const ph = kindOf(s.kind);
    const key = ph === "walls" ? s.id : s.group;
    if (!groups[ph].includes(key)) groups[ph].push(key);
  }
  // back to front: the order the painter already uses
  return data.solids.map((s) => {
    const ph = kindOf(s.kind);
    const list = groups[ph];
    const i = list.indexOf(ph === "walls" ? s.id : s.group);
    const [a, b] = PH[ph];
    const dur = ph === "walls" ? 650 : ph === "open" ? 450 : 550;
    return { start: a + ((b - a - dur) * i) / Math.max(1, list.length - 1), dur, rise: ph !== "items" };
  });
}

interface Els {
  solids: (SVGGElement | null)[];
  faces: (SVGPolygonElement | null)[][];
  rooms: (SVGPolygonElement | null)[];
  plan: SVGGElement | null;
  arcs: SVGGElement | null;
  clip: SVGRectElement | null;
  band: SVGGElement | null;
  notes: SVGGElement | null;
}

const Drawing = memo(function Drawing({ data, els }: { data: FigureData; els: Els }) {
  const [vx, vy, vw, vh] = data.viewBox.split(" ").map(Number);
  return (
    <svg viewBox={data.viewBox} className="mx-auto block max-h-[min(72vh,680px)] w-full select-none" role="img" aria-label="An isometric drawing of the Sunset Loft being built: walls, doors, windows and furniture.">
      <defs>
        <pattern id="bf-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#15171c" strokeWidth="0.5" strokeOpacity="0.18" />
        </pattern>
        <clipPath id="bf-reveal">
          <rect ref={(n) => void (els.clip = n)} x={vx} y={vy} width={vw} height={0} />
        </clipPath>
      </defs>

      {/* ground: room outlines and overall dimensions, drawn on */}
      <g ref={(n) => void (els.plan = n)} opacity={0} fill="none" stroke="#15171c" strokeLinejoin="round">
        {data.rooms.map((r, i) => (
          <polygon key={r.id} ref={(n) => void (els.rooms[i] = n)} points={r.points} pathLength={1} strokeWidth={0.6} fill="#e7e6de" fillOpacity={0} />
        ))}
        {data.dims.map((d, i) => (
          <g key={i} stroke="#81848b" strokeWidth={0.6}>
            <path d={d.line} />
            {d.ext.map((e, j) => (
              <path key={`e${j}`} d={e} strokeWidth={0.45} />
            ))}
            {d.ticks.map((t, j) => (
              <path key={j} d={t} strokeWidth={1} stroke="#15171c" />
            ))}
            <text x={d.x} y={d.y - 4} transform={`rotate(${d.angle} ${d.x} ${d.y})`} textAnchor="middle" fontSize={8} fill="#43464d" stroke="none" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
              {d.text}
            </text>
          </g>
        ))}
      </g>

      <g ref={(n) => void (els.arcs = n)}>
        {data.arcs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#81848b" strokeWidth={0.6} strokeDasharray="2 2" />
        ))}
      </g>

      {/* the line drawing that is built up */}
      <g strokeLinejoin="round">
        {data.solids.map((s, i) => (
          <g key={s.id} ref={(n) => void (els.solids[i] = n)} opacity={0}>
            {s.faces.map((f, j) => (
              <polygon
                key={j}
                ref={(n) => {
                  (els.faces[i] ??= [])[j] = n;
                }}
                points={f.points}
                fill="#f1f0ea"
                stroke="#15171c"
                strokeWidth={s.kind === "wall" && f.tone === "top" ? 0.35 : 0.55}
              />
            ))}
          </g>
        ))}
      </g>

      {/* the shaded drawing, revealed by the scan */}
      <g className="bf-render" clipPath="url(#bf-reveal)" strokeLinejoin="round">
        {data.rooms.map((r) => (
          <polygon key={r.id} points={r.points} fill="#e7e6de" stroke="#15171c" strokeWidth={0.6} />
        ))}
        {data.arcs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#81848b" strokeWidth={0.6} strokeDasharray="2 2" />
        ))}
        {data.solids.map((s) =>
          s.faces.map((f, j) => (
            <g key={`${s.id}-${j}`}>
              <polygon points={f.points} fill={RENDER[s.kind][f.tone]} fillOpacity={s.kind === "glass" ? 0.7 : 1} stroke="#15171c" strokeWidth={s.kind === "wall" && f.tone === "top" ? 0.3 : 0.6} />
              {s.kind === "wall" && f.tone !== "top" && <polygon points={f.points} fill="url(#bf-hatch)" />}
            </g>
          )),
        )}
      </g>

      {/* the scan band */}
      <g ref={(n) => void (els.band = n)} opacity={0} pointerEvents="none">
        <rect x={vx} y={-34} width={vw} height={34} fill="#2747d4" fillOpacity={0.06} />
        <line x1={vx} x2={vx + vw} y1={0} y2={0} stroke="#2747d4" strokeWidth={0.8} />
        <line x1={vx} x2={vx + vw} y1={-34} y2={-34} stroke="#2747d4" strokeWidth={0.8} />
        <rect x={vx + 8} y={-24} width={5} height={5} fill="#2747d4" />
        <text x={vx + 18} y={-19} fontSize={7} fill="#2747d4" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}>
          RENDER
        </text>
      </g>

      {/* room labels */}
      <g ref={(n) => void (els.notes = n)} className="bf-notes" opacity={0} pointerEvents="none" style={{ fontFamily: "var(--font-mono)" }}>
        {data.labels.map((l) => (
          <g key={l.id} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>
            <rect x={4} y={-8.5} width={Math.max(l.label.length, 7) * 4.9 + 6} height={18} fill="#f1f0ea" fillOpacity={0.88} />
            <rect x={-2.5} y={-2.5} width={5} height={5} fill="#2747d4" />
            <text x={6} y={-1} fontSize={7} fill="#15171c" style={{ letterSpacing: "0.08em" }}>
              {l.label.toUpperCase()}
            </text>
            <text x={6} y={7} fontSize={6.5} fill="#81848b" style={{ letterSpacing: "0.06em" }}>
              {l.area.toFixed(1)} M²
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});

export function BuildFigure({ data, steps, caption, side }: { data: FigureData; steps: BuildStep[]; caption: string; side?: ReactNode }) {
  const els = useRef<Els>({ solids: [], faces: [], rooms: [], plan: null, arcs: null, clip: null, band: null, notes: null }).current;
  const plans = useRef<Plan[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [playing, setPlaying] = useState(false);

  const paint = useCallback(
    (t: number) => {
      const plan = (plans.current ??= schedule(data));
      const [, vy, , vh] = data.viewBox.split(" ").map(Number);
      const k = data.scale;

      const pPlan = easeOut(within(t, PH.plan));
      els.rooms.forEach((r) => {
        if (!r) return;
        r.setAttribute("stroke-dasharray", "1");
        r.setAttribute("stroke-dashoffset", String(1 - pPlan));
      });
      els.plan?.setAttribute("opacity", t <= 0 ? "0" : "1");
      els.arcs?.setAttribute("opacity", String(within(t, PH.open)));

      data.solids.forEach((s, i) => {
        const g = els.solids[i];
        if (!g) return;
        const p = easeOut(clamp((t - plan[i].start) / plan[i].dur));
        g.setAttribute("opacity", p <= 0 ? "0" : plan[i].rise ? "1" : String(Math.min(1, p * 1.6)));
        const b: Box3 = plan[i].rise ? { ...s.box, z1: s.box.z0 + Math.max(0.002, (s.box.z1 - s.box.z0) * p) } : { ...s.box, z0: s.box.z0 + (1 - p) * 1.1, z1: s.box.z1 + (1 - p) * 1.1 };
        const faces = boxFaces(b, k);
        const want = s.faces.map((f) => faces.find((x) => x.tone === f.tone)?.points ?? f.points);
        want.forEach((pts, j) => els.faces[i]?.[j]?.setAttribute("points", pts));
      });

      const pScan = within(t, PH.scan);
      const y = vy + (vh + 34) * pScan;
      els.clip?.setAttribute("height", String(Math.max(0, y - vy)));
      els.band?.setAttribute("opacity", pScan > 0 && pScan < 1 ? "1" : "0");
      els.band?.setAttribute("transform", `translate(0 ${y.toFixed(1)})`);
      els.notes?.setAttribute("opacity", String(easeOut(within(t, PH.notes))));
    },
    [data, els],
  );

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    setPlaying(true);
    let lastStep = -1;
    let lastPct = -1;
    const frame = (now: number) => {
      const t = Math.min(END, now - t0);
      paint(t);
      const s = STEP_AT.filter((at) => t >= at).length - 1;
      if (s !== lastStep) setStep((lastStep = s));
      const pc = Math.round((t / END) * 100);
      if (pc !== lastPct) setPct((lastPct = pc));
      if (t < END) raf.current = requestAnimationFrame(frame);
      else (setStep(steps.length), setPlaying(false));
    };
    raf.current = requestAnimationFrame(frame);
  }, [paint, steps.length]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(END);
      setStep(steps.length);
      setPct(100);
      return;
    }
    // the markup starts as an empty sheet; build once the figure is on screen
    let started = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started) {
          started = true;
          play();
        }
      },
      { threshold: 0.25 },
    );
    if (box.current) io.observe(box.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [paint, play, steps.length]);

  return (
    <div ref={box} className="grid gap-8 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      <noscript>
        <style>{".bf-render{clip-path:none}.bf-notes{opacity:1}"}</style>
      </noscript>

      {/* left: the brand, then the build progress and log; on phones the drawing sits between them */}
      <div className="contents lg:flex lg:flex-col lg:justify-between lg:gap-10">
        <div className="order-1 lg:order-none">{side}</div>
        <div className="order-3 grid gap-5 lg:order-none">
          <div className="flex items-center gap-4">
            <span className="label tabular-nums text-ink">
              <span className="text-ink-3">Build </span>
              {String(pct).padStart(3, "0")} %
            </span>
            <span className="relative h-px flex-1 bg-rule" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 bg-marker" style={{ width: `${pct}%`, height: 1 }} />
            </span>
            <button type="button" onClick={play} disabled={playing} className="label flex items-center gap-1.5 text-ink-2 hover:text-marker disabled:opacity-0">
              <RotateCcw size={12} aria-hidden="true" /> Replay
            </button>
          </div>
          <ol className="font-mono text-[0.68rem] uppercase leading-[1.7] tracking-[0.08em]" aria-label="Build log">
            {steps.map((s, i) => (
              <li key={s.code} className={`grid grid-cols-[2.4rem_7.2rem_1fr] transition-colors duration-300 ${i < step ? "text-ink-2" : i === step ? "text-marker" : "text-ink-3/50"}`}>
                <span>{s.code}</span>
                <span>{s.title}</span>
                <span className="truncate">{i <= step ? s.detail : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="order-2 flex min-w-0 flex-col lg:order-none">
        <div className="flex items-start justify-between gap-4 pb-2">
          <span className="label text-ink-3">Fig. 01</span>
          <span className="label text-right text-ink-2">{caption}</span>
        </div>
        <div className="my-auto">
          <Drawing data={data} els={els} />
        </div>
      </div>
    </div>
  );
}
