"use client";

/**
 * A home, from plan to model. It starts as a 2D floor plan, north up, cut at 1.20 m the way an
 * architect draws one: the ground and room outlines are set out, the walls go in as solid ink,
 * then doors with their swings and the glazing, then the furniture seen from above, then the
 * room names. Then the plan lifts into 3D — the sheet swings round and tilts up into an
 * axonometric while the cut rises from 1.20 m to the full height of the walls, so lintels close
 * over the doors and windows and the tall pieces stand up — and it ends as a whole model.
 * Every number on it comes from the real design.
 *
 * It plays once when it comes into view; Replay plays it again. Afterwards it can be turned by
 * hand: drag across to spin it, up or down to look from higher or lower, or use the arrow keys.
 * With reduced motion (or without JavaScript) it shows the finished model.
 *
 * The drawing is static markup; the animation writes attributes straight onto it each frame,
 * so React renders it once.
 */

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { REST, boxFacesAt, flatPolygon, paintIndices, projector, type Box3, type View } from "./iso";
import { CUT, SITE_KINDS, SITE_TONES, arcPath, type FigureData, type SiteKind, type SolidKind } from "./sunsetFigure";

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

/** Phases, in milliseconds from the start: the plan is drawn, then lifted into a model. */
const PH = {
  site: [0, 1200],
  plan: [100, 1500],
  walls: [600, 2600],
  open: [2300, 3300],
  items: [2900, 4700],
  notes: [3600, 4400],
  lift: [5000, 8600],
  raise: [6200, 9000],
} as const;
const END = 9200;
/** When each line of the log starts, matching the phases above. */
const STEP_AT = [0, 400, PH.walls[0], PH.open[0], PH.items[0], PH.lift[0], PH.raise[0], END - 200];

/** The plan as drawn on a sheet: north up, nothing standing up from it. */
const PLAN: View = { turn: Math.PI, flat: 1, lift: 0 };

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const within = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));

const TAU = 2 * Math.PI;
/** the turn from `a` to `b` the short way round */
const towards = (a: number, b: number) => ((((b - a) % TAU) + TAU + Math.PI) % TAU) - Math.PI;

/** How the drawing is seen at time t: the flat plan, swinging up into the axonometric. */
function viewAt(t: number): View {
  const e = easeInOut(within(t, PH.lift));
  return { turn: PLAN.turn + towards(PLAN.turn, REST.turn) * e, flat: 1, lift: e };
}

interface Plan {
  start: number;
  dur: number;
}

/** When each solid appears on the plan: the site, then walls, openings and furniture in turn. */
function schedule(data: FigureData): Plan[] {
  const isSite = (k: SolidKind) => SITE_KINDS.includes(k as SiteKind);
  const kindOf = (k: SolidKind) => (k === "wall" ? "walls" : k === "glass" || k === "leaf" ? "open" : isSite(k) ? "site" : "items");
  const groups: Record<string, string[]> = { walls: [], open: [], items: [], site: [] };
  for (const s of data.solids) {
    const ph = kindOf(s.kind);
    if (!groups[ph].includes(s.group)) groups[ph].push(s.group);
  }
  return data.solids.map((s) => {
    const ph = kindOf(s.kind);
    const list = groups[ph];
    const i = list.indexOf(s.group);
    const [a, b] = PH[ph];
    const dur = ph === "site" ? 700 : 420;
    return { start: a + ((b - a - dur) * i) / Math.max(1, list.length - 1), dur };
  });
}

interface Els {
  shaded: SVGGElement | null;
  rsolids: (SVGGElement | null)[];
  rfaces: (SVGPolygonElement | null)[][];
  rhatch: (SVGPolygonElement | null)[][];
  rooms: (SVGPolygonElement | null)[];
  floors: (SVGPolygonElement | null)[];
  arcPaths: (SVGPathElement | null)[];
  groundPolys: (SVGPolygonElement | null)[];
  labels: (SVGGElement | null)[];
  plan: SVGGElement | null;
  floorGroup: SVGGElement | null;
  dims: SVGGElement | null;
  ground: SVGGElement | null;
  arcs: SVGGElement | null;
  notes: SVGGElement | null;
}

const newEls = (): Els => ({
  shaded: null,
  rsolids: [],
  rfaces: [],
  rhatch: [],
  rooms: [],
  floors: [],
  arcPaths: [],
  groundPolys: [],
  labels: [],
  plan: null,
  floorGroup: null,
  dims: null,
  ground: null,
  arcs: null,
  notes: null,
});

const set = <T,>(list: (T | null)[], i: number) => (n: T | null) => void (list[i] = n);
const set2 = <T,>(list: (T | null)[][], i: number, j: number) => (n: T | null) => void ((list[i] ??= [])[j] = n);

const Drawing = memo(function Drawing({ data, els }: { data: FigureData; els: Els }) {
  const ts = data.textScale;
  return (
    <svg viewBox={data.viewBox} className="mx-auto block max-h-[min(72vh,680px)] w-full select-none" role="img" aria-label="A home drawn as a 2D floor plan, then lifted into a 3D model: walls, doors, windows, furniture and its grounds.">
      <defs>
        <pattern id="bf-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="#15171c" strokeWidth="0.5" strokeOpacity="0.18" />
        </pattern>
      </defs>

      {/* the site's ground, under everything */}
      <g ref={(n) => void (els.ground = n)} className="bf-show" opacity={0}>
        {data.ground.map((g, i) => (
          <polygon key={g.id} ref={set(els.groundPolys, i)} points={g.points} fill={SITE_TONES.lawn.top} stroke="#81848b" strokeWidth={0.4} />
        ))}
      </g>

      {/* the floors */}
      <g ref={(n) => void (els.floorGroup = n)} className="bf-show" opacity={0}>
        {data.rooms.map((r, i) => (
          <polygon key={r.id} ref={set(els.floors, i)} points={r.points} fill="#e7e6de" />
        ))}
      </g>

      {/* room outlines, drawn on, and the overall dimensions of the finished model */}
      <g ref={(n) => void (els.plan = n)} className="bf-show" opacity={0} fill="none" stroke="#15171c" strokeLinejoin="round">
        {data.rooms.map((r, i) => (
          <polygon key={r.id} ref={set(els.rooms, i)} points={r.points} pathLength={1} strokeWidth={0.6} />
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

      {/* door swings */}
      <g ref={(n) => void (els.arcs = n)} className="bf-show" opacity={0}>
        {data.arcs.map((d, i) => (
          <path key={i} ref={set(els.arcPaths, i)} d={d} fill="none" stroke="#81848b" strokeWidth={0.6} strokeDasharray="2 2" />
        ))}
      </g>

      {/* walls, openings, furniture and the site, shaded */}
      <g ref={(n) => void (els.shaded = n)} strokeLinejoin="round">
        {data.solids.map((s, i) => (
          <g key={s.id} ref={set(els.rsolids, i)} className="bf-show" opacity={0}>
            {s.faces.map((f, j) => (
              <g key={j}>
                <polygon ref={set2(els.rfaces, i, j)} points={f.points} fill={RENDER[s.kind][f.tone]} fillOpacity={s.kind === "glass" ? 0.7 : 1} stroke="#15171c" strokeWidth={s.kind === "wall" && f.tone === "top" ? 0.3 : 0.6} />
                {s.kind === "wall" && f.tone !== "top" && <polygon ref={set2(els.rhatch, i, j)} points={f.points} fill="url(#bf-hatch)" />}
              </g>
            ))}
          </g>
        ))}
      </g>

      {/* room labels */}
      <g ref={(n) => void (els.notes = n)} className="bf-show" opacity={0} pointerEvents="none" style={{ fontFamily: "var(--font-mono)" }}>
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
// After the lift, drag across to turn the model like one on a turntable; drag up or down to
// look from higher or lower. `tilt` runs from -1 (low, the plan foreshortened) through 0 (the
// drawing as published) to 1 (high, heights flattened towards a plan).

const TURN_PER_PX = 0.008;
const TILT_PER_PX = 0.004;

const viewOf = (turn: number, tilt: number): View => ({ turn, flat: tilt < 0 ? 1 + 0.45 * tilt : 1, lift: tilt > 0 ? 1 - 0.65 * tilt : 1 });
const atRest = (turn: number, tilt: number) => Math.abs(towards(turn, REST.turn)) < 0.004 && Math.abs(tilt) < 0.004;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function BuildFigure({ data, steps, caption, side }: { data: FigureData; steps: BuildStep[]; caption: string; side?: ReactNode }) {
  const els = useRef<Els>(newEls()).current;
  const plans = useRef<Plan[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);

  const look = useRef({ turn: REST.turn, tilt: 0 });
  const sorted = useRef<{ turn: number; lift: number; flat: number } | null>(null);
  const order = useRef<number[]>(data.solids.map((_, i) => i));
  const spin = useRef(0);
  const [turned, setTurned] = useState(false);
  const world = data.world;

  /**
   * Draw the whole figure seen through `v`, cut at `cut`, as it stands at time `t` of the
   * build (END: everything in place).
   */
  const draw = useCallback(
    (v: View, cut: number, t: number) => {
      const plan = (plans.current ??= schedule(data));
      const k = data.scale;
      const P = projector(v, world?.pivot);
      const done = t >= END;

      // the ground, the floors and their outlines, the swings and the labels
      els.ground?.setAttribute("opacity", String(easeOut(within(t, PH.site))));
      els.floorGroup?.setAttribute("opacity", String(easeOut(within(t, PH.plan))));
      els.plan?.setAttribute("opacity", t <= 0 ? "0" : "1");
      const pPlan = easeOut(within(t, PH.plan));
      els.rooms.forEach((r) => {
        r?.setAttribute("stroke-dasharray", "1");
        r?.setAttribute("stroke-dashoffset", String(1 - pPlan));
      });
      els.arcs?.setAttribute("opacity", String(within(t, PH.open)));
      els.notes?.setAttribute("opacity", String(easeOut(within(t, PH.notes))));
      els.dims?.setAttribute("opacity", done && Math.abs(towards(v.turn, REST.turn)) < 0.004 && v.lift === 1 && v.flat === 1 ? "1" : "0");
      if (world) {
        world.rooms.forEach((c, i) => {
          const pts = flatPolygon(c, 0, k, P);
          els.rooms[i]?.setAttribute("points", pts);
          els.floors[i]?.setAttribute("points", pts);
        });
        world.arcs.forEach((a, i) => els.arcPaths[i]?.setAttribute("d", arcPath(a, k, P)));
        world.ground.forEach((c, i) => els.groundPolys[i]?.setAttribute("points", flatPolygon(c, 0, k, P)));
        // labels are set smaller on the flat plan, where the narrow rooms sit side by side
        const size = (data.textScale * (0.7 + 0.3 * v.lift)).toFixed(2);
        world.labels.forEach((l, i) => {
          const q = P(l.x, l.y, Math.min(l.z, cut));
          els.labels[i]?.setAttribute("transform", `translate(${(q.x * k).toFixed(1)} ${(q.y * k).toFixed(1)}) scale(${size})`);
        });
      }

      // every solid of the house, cut at `cut`: what starts above the cut is not drawn at all.
      // The grounds are never cut: trees stand at their full height in the plan too.
      data.solids.forEach((s, i) => {
        const g = els.rsolids[i];
        if (!g) return;
        const top = s.site ? Infinity : cut;
        const shown = s.box.z0 < top - 1e-3;
        const fade = done ? 1 : easeOut(clamp((t - plan[i].start) / plan[i].dur));
        g.setAttribute("opacity", shown ? String(fade) : "0");
        if (!shown || fade <= 0) return;
        const b: Box3 = { ...s.box, z1: Math.min(s.box.z1, top) };
        boxFacesAt(b, k, P, v.turn).forEach((f, j) => {
          const poly = els.rfaces[i]?.[j];
          if (!poly) return;
          poly.setAttribute("points", f.points);
          poly.setAttribute("fill", RENDER[s.kind][f.tone]);
          els.rhatch[i]?.[j]?.setAttribute("points", f.points);
        });
      });

      // the painter's order changes as the view turns and tilts: re-sort when it has moved enough
      const last = sorted.current;
      const quadrant = (a: number) => Math.floor((((a % TAU) + TAU) % TAU) / (Math.PI / 2));
      if (!last || quadrant(last.turn) !== quadrant(v.turn) || Math.abs(towards(last.turn, v.turn)) > 0.05 || Math.abs(last.lift - v.lift) > 0.08 || Math.abs(last.flat - v.flat) > 0.05) {
        sorted.current = { turn: v.turn, lift: v.lift, flat: v.flat };
        const rugs = data.solids.flatMap((s, i) => (s.kind === "rug" ? [i] : []));
        const standing = data.solids.flatMap((s, i) => (s.kind === "rug" ? [] : [i]));
        const list = [...rugs, ...paintIndices(standing.map((i) => data.solids[i].box), P, v.turn).map((j) => standing[j])];
        if (list.some((i, n) => order.current[n] !== i)) {
          // back to front, each solid goes just before the one that should follow it; only
          // what is out of place moves, so the page re-lays out as little as it can
          let next: SVGGElement | null = null;
          for (let n = list.length - 1; n >= 0; n--) {
            const g = els.rsolids[list[n]];
            if (g && g.nextSibling !== next) els.shaded?.insertBefore(g, next);
            next = g;
          }
          order.current = list;
        }
      }
    },
    [data, els, world],
  );

  /** The build at time t: the plan drawn, then lifted and raised into a model. */
  const paint = useCallback((t: number) => draw(world ? viewAt(t) : REST, CUT + (data.top - CUT) * easeInOut(within(t, PH.raise)), t), [data.top, draw, world]);

  /** The finished model, seen however it has been turned. */
  const turnTo = useCallback(() => {
    draw(viewOf(look.current.turn, look.current.tilt), data.top, END);
    setTurned(!atRest(look.current.turn, look.current.tilt));
  }, [data.top, draw]);

  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    playingRef.current = false;
    setPlaying(false);
    setStep(steps.length);
    setPct(100);
    look.current = { turn: REST.turn, tilt: 0 };
    paint(END);
  }, [paint, steps.length]);

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(spin.current);
    look.current = { turn: REST.turn, tilt: 0 };
    setTurned(false);
    const t0 = performance.now();
    playingRef.current = true;
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
      else finish();
    };
    raf.current = requestAnimationFrame(frame);
  }, [finish, paint]);

  useEffect(() => {
    if (reducedMotion()) return finish();
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
  }, [finish, play]);

  // ---- turning by hand ----
  const queued = useRef(0);
  const lookAt = useCallback(
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
    if (playingRef.current) finish(); // grabbing it mid-build skips to the model
    cancelAnimationFrame(spin.current);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that has already gone (or was never real) cannot be captured; the drag still works inside the figure
    }
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
    lookAt(look.current.turn - dx * TURN_PER_PX, look.current.tilt + (d.touch ? 0 : dy * TILT_PER_PX));
  };
  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // let go while moving: it carries on turning and slows to a stop
    if (reducedMotion() || performance.now() - d.at > 80) return;
    let v = -d.vx * 16; // radians per frame
    const coast = () => {
      v *= 0.94;
      if (Math.abs(v) < 0.0008) return;
      lookAt(look.current.turn + v, look.current.tilt);
      spin.current = requestAnimationFrame(coast);
    };
    spin.current = requestAnimationFrame(coast);
  };

  const reset = useCallback(() => {
    cancelAnimationFrame(spin.current);
    const from = { ...look.current };
    const by = towards(from.turn, REST.turn);
    if (reducedMotion()) return lookAt(REST.turn, 0);
    const t0 = performance.now();
    const ease = (now: number) => {
      const p = easeOut(clamp((now - t0) / 700));
      lookAt(from.turn + by * p, from.tilt * (1 - p));
      if (p < 1) spin.current = requestAnimationFrame(ease);
    };
    spin.current = requestAnimationFrame(ease);
  }, [lookAt]);

  const onKey = (e: ReactKeyboardEvent) => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [0.26, 0], ArrowRight: [-0.26, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] };
    if (e.key === "Home" || e.key === "0") return (e.preventDefault(), reset());
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    if (playingRef.current) finish();
    cancelAnimationFrame(spin.current);
    lookAt(look.current.turn + k[0], look.current.tilt + k[1]);
  };

  return (
    <div ref={box} className="grid gap-8 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
      <noscript>
        <style>{".bf-show{opacity:1}"}</style>
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

          <span className="label text-right text-ink-2">{caption}</span>
        </div>
        {world ? (
          <div
            className="my-auto cursor-grab touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-marker active:cursor-grabbing"
            tabIndex={0}
            aria-label="Turn the model: drag, or use the arrow keys; Home puts it back"
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
              <span className="hidden sm:inline">{playing ? "2D plan → 3D model" : "Drag to turn · up or down to tilt"}</span>
              <span className="sm:hidden">{playing ? "2D plan → 3D model" : "Drag sideways to turn"}</span>
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
