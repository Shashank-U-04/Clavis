"use client";

/**
 * The landing page's hero: a real 3D model of the house and its grounds that opens as the 2D
 * plan and is built floor by floor, the build log beside it following each stage, and can then
 * be turned (drag) and zoomed (scroll wheel or pinch). The 3D code is loaded only
 * in the browser; while it loads the frame shows the sky it will open into. A browser that
 * cannot start WebGL gets the drafted drawing of the same house instead.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Hand, RotateCcw } from "lucide-react";
import type { PlanModel } from "@/model/types";
import type { SitePiece } from "@/components/figures/sunsetFigure";
import type { Showcase, ShowcaseTimeline } from "@/three/showcase";
import { onThemeChange, readThemePref, resolveTheme } from "@/lib/theme";

export interface BuildStep {
  code: string;
  title: string;
  detail: string;
  /**
   * When the line lights up, as a moment of the model's opening: "start", "plan", "level:<n>"
   * (the nth floor from the ground starts building), "roof", "grounds", "checks" or "model".
   */
  cue?: string;
}

/** When a line of the log lights up (ms into the opening). */
function cueAt(cue: string | undefined, t: ShowcaseTimeline): number {
  if (!cue || cue === "start") return 0;
  if (cue === "plan") return t.lift * 0.5;
  if (cue.startsWith("level:")) return t.levels[Number(cue.slice(6))] ?? t.roof;
  if (cue === "roof") return t.roof;
  if (cue === "grounds") return t.grounds;
  if (cue === "checks") return t.grounds + (t.end - t.grounds) * 0.55;
  return t.end - 300;
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HeroModel({ model, site, steps, caption, side, front, elevation = 22 }: { model: PlanModel; site: readonly SitePiece[]; steps: BuildStep[]; caption: string; side?: ReactNode; front: { x: number; y: number }; elevation?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const show = useRef<Showcase | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [step, setStep] = useState(-1);
  const [moved, setMoved] = useState(false);
  const [touch, setTouch] = useState(false);
  const [exploring, setExploring] = useState(false);
  const timers = useRef<number[]>([]);

  /** Play the opening, with the log lighting up line by line alongside it. */
  const open = (s: Showcase) => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    const still = reduceMotion();
    s.playIntro(still);
    if (still) return setStep(steps.length);
    setStep(-1);
    steps.forEach((st, i) => timers.current.push(window.setTimeout(() => setStep(i), cueAt(st.cue, s.timeline))));
    timers.current.push(window.setTimeout(() => setStep(steps.length), s.timeline.end));
  };
  const [Fallback, setFallback] = useState<ReactNode>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let cancelled = false;
    let poll = 0;
    let io: IntersectionObserver | null = null;
    let stopTheme: (() => void) | null = null;
    let stopDevice: (() => void) | null = null;
    let device: MediaQueryList | null = null;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    setTouch(coarse);

    // the house shows at once; its real trees and plants follow and take the drawn ones' places
    const plants = import("@/three/plants").then(({ loadPlants }) => loadPlants());
    import("@/three/showcase")
      .then(({ Showcase }) => {
        if (cancelled) return;
        const s = new Showcase(el, model, site, { front, elevation, touch: coarse });
        show.current = s;
        void plants.then((ok) => {
          if (ok && !cancelled && show.current === s) s.swapPlants();
        });
        setState("ready");
        // open when the model is on screen; the log follows the opening
        io = new IntersectionObserver(
          ([e]) => {
            if (!e.isIntersecting) return;
            io?.disconnect();
            open(s);
          },
          { threshold: 0.3 },
        );
        io.observe(el);
        poll = window.setInterval(() => setMoved(s.moved), 300);
        // the model follows the site's theme: a sunset when it turns dark, daylight when it turns light
        const light = () => s.setTheme(resolveTheme(readThemePref()) === "dark" ? "sunset" : "light");
        stopTheme = onThemeChange(light);
        device = window.matchMedia("(prefers-color-scheme: dark)");
        device.addEventListener("change", light);
        stopDevice = () => device?.removeEventListener("change", light);
      })
      .catch(async (err) => {
        console.error("[clavis] the 3D model could not start", err);
        if (cancelled) return;
        // no WebGL: the drafted drawing of the same house
        const [{ BuildFigure }, { buildSunsetFigure }] = await Promise.all([import("@/components/figures/BuildFigure"), import("@/components/figures/sunsetFigure")]);
        if (cancelled) return;
        setFallback(<BuildFigure data={buildSunsetFigure(model, site, { turnable: true, full: true })} steps={steps} caption={caption} side={side} />);
        setState("failed");
      });

    return () => {
      cancelled = true;
      for (const t of timers.current) clearTimeout(t);
      clearInterval(poll);
      io?.disconnect();
      stopTheme?.();
      stopDevice?.();
      show.current?.dispose();
      show.current = null;
    };
    // the model and its grounds are fixed for the page's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "failed" && Fallback) return <>{Fallback}</>;

  const explore = (on: boolean) => {
    show.current?.setTouch(on);
    setExploring(on);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* left: the brand, then the build log; on phones the model sits between them */}
      <div className="contents lg:flex lg:flex-col lg:justify-between lg:gap-10">
        <div className="order-1 lg:order-none">{side}</div>
        <div className="order-3 grid gap-5 lg:order-none">
          <div className="flex items-center gap-4">
            <span className="label tabular-nums text-ink">
              <span className="text-ink-3">Build </span>
              {String(Math.round((Math.max(0, Math.min(step, steps.length)) / steps.length) * 100)).padStart(3, "0")} %
            </span>
            <span className="relative h-px flex-1 bg-rule" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 bg-marker transition-[width] duration-500" style={{ width: `${(Math.max(0, Math.min(step, steps.length)) / steps.length) * 100}%`, height: 1 }} />
            </span>
            <button type="button" onClick={() => show.current && open(show.current)} disabled={state !== "ready" || (step >= 0 && step < steps.length)} className="label flex items-center gap-1.5 text-ink-2 hover:text-marker disabled:opacity-0">
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
        <div className="hero-sky relative overflow-hidden border border-rule">
          <div ref={mount} className="h-[clamp(380px,62vw,560px)] w-full cursor-grab active:cursor-grabbing lg:h-[clamp(460px,72vh,780px)]" aria-label="A 3D model of the house: drag to turn it, scroll to zoom" role="img" />
          {state === "loading" && <p className="label absolute inset-0 grid place-items-center text-paper">Loading the 3D model…</p>}
          {state === "ready" && (
            <div className="absolute bottom-3 right-3 flex gap-1">
              {touch && (
                <button type="button" onClick={() => explore(!exploring)} className={`label flex h-9 items-center gap-1.5 border px-3 backdrop-blur ${exploring ? "border-marker bg-marker text-paper" : "border-rule bg-paper/85 text-ink"}`}>
                  <Hand size={14} aria-hidden="true" /> {exploring ? "Done" : "Explore in 3D"}
                </button>
              )}
              <button type="button" onClick={() => show.current?.reset()} disabled={!moved} className="grid h-9 w-9 place-items-center border border-rule bg-paper/85 text-ink backdrop-blur hover:text-marker disabled:opacity-40" aria-label="Back to the front view">
                <RotateCcw size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <p className="label pt-2 text-ink-3">{touch ? "Tap Explore in 3D, then drag to turn and pinch to zoom" : "Drag to turn · right-drag to move · scroll to zoom"}</p>
      </div>
    </div>
  );
}
