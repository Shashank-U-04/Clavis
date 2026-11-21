"use client";

/**
 * A home, built live. The plan is set out on the ground, the walls rise back to
 * front, doors and glazing go in, the furniture is lowered into place, and then a scan band
 * sweeps down the sheet turning the line drawing into a shaded one. Room labels and the
 * build log finish it. Every number on it comes from the real design.
 *
 * It plays once when it comes into view (after the opening sheet has lifted); Replay plays it again. With reduced motion (or
 * without JavaScript) it shows the finished drawing.
 *
 * A figure built with `turnable` can be turned by hand once it is on screen: drag across to
 * spin it like a model on a turntable, up or down to look from higher or lower, or use the
 * arrow keys. It re-projects every face and re-sorts the painter's order as it goes.
 *
 * The drawing is static markup; the animation writes attributes straight onto it each frame,
 * so React renders it once.
 */

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { REST, boxFacesAt, flatPolygon, paintIndices, projector, type Box3, type View } from "./iso";
import { SITE_KINDS, SITE_TONES, arcPath, type FigureData, type SiteKind, type SolidKind } from "./sunsetFigure";

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
  ...SITE_TONES,
} as const satisfies Record<SolidKind, Record<string, string>>;

/** Phases of the build, in milliseconds from the start. */
const PH = {
  plan: [0, 1500],
  site: [300, 2200],
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
  const isSite = (k: SolidKind) => SITE_KINDS.includes(k as SiteKind);
  const kindOf = (k: SolidKind) => (k === "wall" ? "walls" : k === "glass" || k === "leaf" ? "open" : isSite(k) ? "site" : "items");
  const groups: Record<string, string[]> = { walls: [], open: [], items: [], site: [] };
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
    const dur = ph === "walls" ? 650 : ph === "open" ? 450 : ph === "site" ? 700 : 550;
    return { start: a + ((b - a - dur) * i) / Math.max(1, list.length - 1), dur, rise: ph !== "items" };
  });
}


interface Els {
  /** the line drawing that is built up, and its solids */
  lines: SVGGElement | null;
  solids: (SVGGElement | null)[];
  faces: (SVGPolygonElement | null)[][];
  /** the shaded drawing's solids, each face with its hatch (walls only) */
  shaded: SVGGElement | null;
  rsolids: (SVGGElement | null)[];
  rfaces: (SVGPolygonElement | null)[][];
  rhatch: (SVGPolygonElement | null)[][];
  rooms: (SVGPolygonElement | null)[];
  rrooms: (SVGPolygonElement | null)[];
  arcPaths: (SVGPathElement | null)[];
  rarcs: (SVGPathElement | null)[];
  groundPolys: (SVGPolygonElement | null)[];
  labels: (SVGGElement | null)[];
  plan: SVGGElement | null;
  dims: SVGGElement | null;
  ground: SVGGElement | null;
  arcs: SVGGElement | null;
  clip: SVGRectElement | null;
  band: SVGGElement | null;
  notes: SVGGElement | null;
}

const newEls = (): Els => ({
  lines: null,
  solids: [],
  faces: [],
  shaded: null,
  rsolids: [],
  rfaces: [],
  rhatch: [],
  rooms: [],
  rrooms: [],
  arcPaths: [],
  rarcs: [],
  groundPolys: [],
  labels: [],
  plan: null,
  dims: null,
  ground: null,
  arcs: null,
  clip: null,
  band: null,
  notes: null,
});

const set = <T,>(list: (T | null)[], i: number) => (n: T | null) => void (list[i] = n);
const set2 = <T,>(list: (T | null)[][], i: number, j: number) => (n: T | null) => void ((list[i] ??= [])[j] = n);

const Drawing = memo(function Drawing({ data, els }: { data: FigureData; els: Els }) {
  const [vx, vy, vw] = data.viewBox.split(" ").map(Number);
  const ts = data.textScale;
  return (
    <svg viewBox={data.viewBox} className="mx-auto block max-h-[min(72vh,680px)] w-full select-none" role="img" aria-label="An isometric drawing of a home being built: walls, doors, windows, furniture and its grounds.">
      <defs>
        <pattern id="bf-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#15171c" strokeWidth="0.5" strokeOpacity="0.18" />
        </pattern>
        <clipPath id="bf-reveal">
          <rect ref={(n) => void (els.clip = n)} x={vx} y={vy} width={vw} height={0} />
        </clipPath>
      </defs>

      {/* the site's ground, under everything */}
      <g ref={(n) => void (els.ground = n)} className="bf-ground" opacity={0}>
        {data.ground.map((g, i) => (
          <polygon key={g.id} ref={set(els.groundPolys, i)} points={g.points} fill={SITE_TONES.lawn.top} stroke="#81848b" strokeWidth={0.4} />
        ))}
      </g>

      {/* ground: room outlines and overall dimensions, drawn on */}
      <g ref={(n) => void (els.plan = n)} opacity={0} fill="none" stroke="#15171c" strokeLinejoin="round">
        {data.rooms.map((r, i) => (
          <polygon key={r.id} ref={set(els.rooms, i)} points={r.points} pathLength={1} strokeWidth={0.6} fill="#e7e6de" fillOpacity={0} />
        ))}
        <g ref={(n) => void (els.dims = n)} className="transition-opacity duration-300">
          {data.dims.map((d, i) => (
            <g key={i} stroke="#81848b" strokeWidth={0.6}>
              <path d={d.line} />
              {d.ext.map((e, j) => (
                <path key={`e${j}`} d={e} strokeWidth={0.45} />
              ))}
              {d.ticks.map((t, j) => (
                <path key={j} d={t} strokeWidth={1} stroke="#15171c" />
              ))}
              <text x={d.x} y={d.y - 4 * ts} transform={`rotate(${d.angle} ${d.x} ${d.y})`} textAnchor="middle" fontSize={8 * ts} fill="#43464d" stroke="none" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
                {d.text}
              </text>
            </g>
          ))}
        </g>
      </g>

      <g ref={(n) => void (els.arcs = n)}>
        {data.arcs.map((d, i) => (
          <path key={i} ref={set(els.arcPaths, i)} d={d} fill="none" stroke="#81848b" strokeWidth={0.6} strokeDasharray="2 2" />
        ))}
      </g>

      {/* the line drawing that is built up */}
      <g ref={(n) => void (els.lines = n)} strokeLinejoin="round">
        {data.solids.map((s, i) => (
          <g key={s.id} ref={set(els.solids, i)} opacity={0}>
            {s.faces.map((f, j) => (
              <polygon key={j} ref={set2(els.faces, i, j)} points={f.points} fill="#f1f0ea" stroke="#15171c" strokeWidth={s.kind === "wall" && f.tone === "top" ? 0.35 : 0.55} />
            ))}
          </g>
        ))}
      </g>

      {/* the shaded drawing, revealed by the scan */}
      <g className="bf-render" clipPath="url(#bf-reveal)" strokeLinejoin="round">
        {data.rooms.map((r, i) => (
          <polygon key={r.id} ref={set(els.rrooms, i)} points={r.points} fill="#e7e6de" stroke="#15171c" strokeWidth={0.6} />
        ))}
        {data.arcs.map((d, i) => (
          <path key={i} ref={set(els.rarcs, i)} d={d} fill="none" stroke="#81848b" strokeWidth={0.6} strokeDasharray="2 2" />
        ))}
        <g ref={(n) => void (els.shaded = n)}>
          {data.solids.map((s, i) => (
            <g key={s.id} ref={set(els.rsolids, i)}>
              {s.faces.map((f, j) => (
                <g key={j}>
                  <polygon ref={set2(els.rfaces, i, j)} points={f.points} fill={RENDER[s.kind][f.tone]} fillOpacity={s.kind === "glass" ? 0.7 : 1} stroke="#15171c" strokeWidth={s.kind === "wall" && f.tone === "top" ? 0.3 : 0.6} />
                  {s.kind === "wall" && f.tone !== "top" && <polygon ref={set2(els.rhatch, i, j)} points={f.points} fill="url(#bf-hatch)" />}
                </g>
              ))}
            </g>
          ))}
        </g>
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
        {data.labels.map((l, i) => (
          <g key={l.id} ref={set(els.labels, i)} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) scale(${ts.toFixed(2)})`}>
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

// ---------------------------------------------------------------------------- turning
// Drag across to turn the drawing like a model on a turntable; drag up or down to look from
// higher or lower. `tilt` runs from -1 (low, the plan foreshortened) through 0 (the drawing as
// published) to 1 (high, heights flattened towards a plan).

const TURN_PER_PX = 0.008;
const TILT_PER_PX = 0.004;
const TAU = 2 * Math.PI;

const viewOf = (turn: number, tilt: number): View => ({ turn, flat: tilt < 0 ? 1 + 0.45 * tilt : 1, lift: tilt > 0 ? 1 - 0.65 * tilt : 1 });
/** the turn from `a` to `b` the short way round */
const towards = (a: number, b: number) => ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
const atRest = (turn: number, tilt: number) => Math.abs(towards(turn, REST.turn)) < 0.004 && Math.abs(tilt) < 0.004;

export function BuildFigure({ data, steps, caption, side }: { data: FigureData; steps: BuildStep[]; caption: string; side?: ReactNode }) {
  const els = useRef<Els>(newEls()).current;
  const plans = useRef<Plan[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [playing, setPlaying] = useState(false);

  // how the drawing is being looked at, and the paint order that goes with it
  const look = useRef({ turn: REST.turn, tilt: 0 });
  const ordered = useRef<{ turn: number; tilt: number } | null>(null);
  /** the painter's order the solids are in on the page, and whether the hidden line drawing lags behind it */
  const order = useRef<{ list: number[]; linesStale: boolean }>({ list: data.solids.map((_, i) => i), linesStale: false });
  const spin = useRef(0);
  const [turned, setTurned] = useState(false);
  const world = data.world;

  const projection = useCallback(() => {
    const v = viewOf(look.current.turn, look.current.tilt);
    return { v, P: projector(v, world?.pivot) };
  }, [world]);

  const paint = useCallback(
    (t: number) => {
      const plan = (plans.current ??= schedule(data));
      const [, vy, , vh] = data.viewBox.split(" ").map(Number);
      const k = data.scale;
      const { v, P } = projection();

      const pPlan = easeOut(within(t, PH.plan));
      els.rooms.forEach((r) => {
        if (!r) return;
        r.setAttribute("stroke-dasharray", "1");
        r.setAttribute("stroke-dashoffset", String(1 - pPlan));
      });
      els.plan?.setAttribute("opacity", t <= 0 ? "0" : "1");
      els.ground?.setAttribute("opacity", String(easeOut(within(t, PH.site))));
      els.arcs?.setAttribute("opacity", String(within(t, PH.open)));

      // once the scan has passed, the shaded drawing covers the line drawing completely
      const built = t >= PH.scan[1];
      els.lines?.setAttribute("display", built ? "none" : "inline");
      if (!built && order.current.linesStale) {
        // the line drawing missed some turns while it was put away: give it the current order
        for (const i of order.current.list) {
          const l = els.solids[i];
          if (l) els.lines?.appendChild(l);
        }
        order.current.linesStale = false;
      }
      if (!built)
        data.solids.forEach((s, i) => {
          const g = els.solids[i];
          if (!g) return;
          const p = easeOut(clamp((t - plan[i].start) / plan[i].dur));
          g.setAttribute("opacity", p <= 0 ? "0" : plan[i].rise ? "1" : String(Math.min(1, p * 1.6)));
          const b: Box3 = plan[i].rise ? { ...s.box, z1: s.box.z0 + Math.max(0.002, (s.box.z1 - s.box.z0) * p) } : { ...s.box, z0: s.box.z0 + (1 - p) * 1.1, z1: s.box.z1 + (1 - p) * 1.1 };
          const faces = boxFacesAt(b, k, P, v.turn);
          faces.forEach((f, j) => els.faces[i]?.[j]?.setAttribute("points", f.points));
        });

      const pScan = within(t, PH.scan);
      const y = vy + (vh + 34) * pScan;
      els.clip?.setAttribute("height", String(Math.max(0, y - vy)));
      els.band?.setAttribute("opacity", pScan > 0 && pScan < 1 ? "1" : "0");
      els.band?.setAttribute("transform", `translate(0 ${y.toFixed(1)})`);
      els.notes?.setAttribute("opacity", String(easeOut(within(t, PH.notes))));
    },
    [data, els, projection],
  );

  /** Redraw everything that does not build up — floors, swings, ground, labels, the shaded solids — for the current look. */
  const turnTo = useCallback(() => {
    if (!world) return;
    const k = data.scale;
    const { v, P } = projection();
    world.rooms.forEach((c, i) => {
      const pts = flatPolygon(c, 0, k, P);
      els.rooms[i]?.setAttribute("points", pts);
      els.rrooms[i]?.setAttribute("points", pts);
    });
    world.arcs.forEach((a, i) => {
      const d = arcPath(a, k, P);
      els.arcPaths[i]?.setAttribute("d", d);
      els.rarcs[i]?.setAttribute("d", d);
    });
    world.ground.forEach((c, i) => els.groundPolys[i]?.setAttribute("points", flatPolygon(c, 0, k, P)));
    world.labels.forEach((l, i) => {
      const q = P(l.x, l.y, l.z);
      els.labels[i]?.setAttribute("transform", `translate(${(q.x * k).toFixed(1)} ${(q.y * k).toFixed(1)}) scale(${data.textScale.toFixed(2)})`);
    });
    const rest = atRest(look.current.turn, look.current.tilt);
    els.dims?.setAttribute("opacity", rest ? "1" : "0");

    data.solids.forEach((s, i) => {
      boxFacesAt(s.box, k, P, v.turn).forEach((f, j) => {
        const poly = els.rfaces[i]?.[j];
        if (!poly) return;
        poly.setAttribute("points", f.points);
        poly.setAttribute("fill", RENDER[s.kind][f.tone]);
        els.rhatch[i]?.[j]?.setAttribute("points", f.points);
      });
    });

    // the painter's order changes as the drawing turns: re-sort when it has moved enough
    const last = ordered.current;
    const quadrant = (a: number) => Math.floor((((a % TAU) + TAU) % TAU) / (Math.PI / 2));
    if (!last || quadrant(last.turn) !== quadrant(look.current.turn) || Math.abs(towards(last.turn, look.current.turn)) > 0.05 || Math.abs(last.tilt - look.current.tilt) > 0.08) {
      ordered.current = { ...look.current };
      const rugs = data.solids.flatMap((s, i) => (s.kind === "rug" ? [i] : []));
      const standing = data.solids.flatMap((s, i) => (s.kind === "rug" ? [] : [i]));
      const list = [...rugs, ...paintIndices(standing.map((i) => data.solids[i].box), P, v.turn).map((j) => standing[j])];
      const now = order.current.list;
      if (list.some((i, n) => now[n] !== i)) {
        // back to front, each solid goes just before the one that should follow it; only what is
        // out of place moves, so the page re-lays out as little as it can
        const linesShown = els.lines?.getAttribute("display") !== "none";
        let prev: SVGGElement | null = null;
        for (let n = list.length - 1; n >= 0; n--) {
          const r = els.rsolids[list[n]];
          if (r && r.nextSibling !== prev) els.shaded?.insertBefore(r, prev);
          prev = r;
        }
        if (linesShown) {
          let next: SVGGElement | null = null;
          for (let n = list.length - 1; n >= 0; n--) {
            const l = els.solids[list[n]];
            if (l && l.nextSibling !== next) els.lines?.insertBefore(l, next);
            next = l;
          }
        }
        order.current = { list, linesStale: !linesShown };
      }
    }
    setTurned(!rest);
  }, [data, els, projection, world]);

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
      cancelAnimationFrame(spin.current);
    };
  }, [paint, play, steps.length]);

  // ---- turning by hand ----
  const queued = useRef(0);
  const look2 = useCallback(
    (turn: number, tilt: number) => {
      look.current = { turn, tilt: Math.max(-1, Math.min(1, tilt)) };
      queued.current ||= requestAnimationFrame(() => {
        queued.current = 0;
        turnTo();
      });
    },
    [turnTo],
  );

  const drag = useRef<{ id: number; x: number; y: number; vx: number; at: number; touch: boolean } | null>(null);
  const onDown = (e: ReactPointerEvent) => {
    if (!world || e.button !== 0) return;
    cancelAnimationFrame(spin.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: 0, at: performance.now(), touch: e.pointerType === "touch" };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const now = performance.now();
    d.vx = (dx * TURN_PER_PX) / Math.max(1, now - d.at);
    Object.assign(d, { x: e.clientX, y: e.clientY, at: now });
    look2(look.current.turn - dx * TURN_PER_PX, look.current.tilt + (d.touch ? 0 : dy * TILT_PER_PX));
  };
  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // let go while moving: it carries on turning and slows to a stop
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || performance.now() - d.at > 80) return;
    let v = -d.vx * 16; // radians per frame
    const coast = () => {
      v *= 0.94;
      if (Math.abs(v) < 0.0008) return;
      look2(look.current.turn + v, look.current.tilt);
      spin.current = requestAnimationFrame(coast);
    };
    spin.current = requestAnimationFrame(coast);
  };

  const reset = useCallback(() => {
    cancelAnimationFrame(spin.current);
    const from = { ...look.current };
    const by = towards(from.turn, REST.turn);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return look2(REST.turn, 0);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = easeOut(clamp((now - t0) / 700));
      look2(from.turn + by * p, from.tilt * (1 - p));
      if (p < 1) spin.current = requestAnimationFrame(step);
    };
    spin.current = requestAnimationFrame(step);
  }, [look2]);

  const onKey = (e: ReactKeyboardEvent) => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [0.26, 0], ArrowRight: [-0.26, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] };
    if (e.key === "Home" || e.key === "0") return (e.preventDefault(), reset());
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    cancelAnimationFrame(spin.current);
    look2(look.current.turn + k[0], look.current.tilt + k[1]);
  };

  return (
    <div ref={box} className="grid gap-8 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      <noscript>
        <style>{".bf-render{clip-path:none}.bf-notes,.bf-ground{opacity:1}"}</style>
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
        {world ? (
          <div
            className="my-auto cursor-grab touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-marker active:cursor-grabbing"
            tabIndex={0}
            aria-label="Turn the drawing: drag, or use the arrow keys; Home puts it back"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
          >
            <Drawing data={data} els={els} />
          </div>
        ) : (
          <div className="my-auto">
            <Drawing data={data} els={els} />
          </div>
        )}
        {world && (
          <div className="flex h-7 items-center justify-between gap-4 pt-2">
            <span className="label text-ink-3">
              <span className="hidden sm:inline">Drag to turn · up or down to tilt</span>
              <span className="sm:hidden">Drag sideways to turn</span>
            </span>
            <button type="button" onClick={reset} className={`label flex items-center gap-1.5 text-ink-2 transition-opacity hover:text-marker ${turned ? "" : "pointer-events-none opacity-0"}`} tabIndex={turned ? 0 : -1}>
              <RotateCcw size={12} aria-hidden="true" /> Reset view
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
