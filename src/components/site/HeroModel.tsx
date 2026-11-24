"use client";

/**
 * The landing page's hero: a real 3D model of the house and its grounds that opens as the 2D
 * plan and is built floor by floor, and can then be turned (drag) and zoomed (scroll wheel or
 * pinch). The build steps are only shown by the drawn fallback. The 3D code is loaded only
 * in the browser; while it loads the frame shows the sky it will open into. A browser that
 * cannot start WebGL gets the drafted drawing of the same house instead.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Hand, Play, RotateCcw } from "lucide-react";
import type { PlanModel } from "@/model/types";
import type { SitePiece } from "@/components/figures/sunsetFigure";
import type { Showcase } from "@/three/showcase";
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

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HeroModel({ model, site, steps, caption, side, front, elevation = 22 }: { model: PlanModel; site: readonly SitePiece[]; steps: BuildStep[]; caption: string; side?: ReactNode; front: { x: number; y: number }; elevation?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const show = useRef<Showcase | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [playing, setPlaying] = useState(false);
  const [moved, setMoved] = useState(false);
  const [touch, setTouch] = useState(false);
  const [exploring, setExploring] = useState(false);
  const timers = useRef<number[]>([]);

  /** Play the opening: the plan, then the house rising floor by floor. */
  const open = (s: Showcase) => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    const still = reduceMotion();
    s.playIntro(still);
    if (still) return setPlaying(false);
    setPlaying(true);
    timers.current.push(window.setTimeout(() => setPlaying(false), s.timeline.end));
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-center lg:gap-12">
      <div>{side}</div>
      <div className="min-w-0">
        <div className="hero-sky relative overflow-hidden border border-rule">
          <div ref={mount} className="h-[clamp(380px,62vw,560px)] w-full cursor-grab active:cursor-grabbing lg:h-[clamp(460px,72vh,780px)]" aria-label="A 3D model of a house designed in Clavis: drag to turn it, scroll to zoom" role="img" />
          {state === "loading" && <p className="label absolute inset-0 grid place-items-center text-paper">Loading the 3D model…</p>}
          {state === "ready" && (
            <>
              <p className="label pointer-events-none absolute bottom-4 left-4 bg-paper/80 px-2 py-1 text-[0.62rem] text-ink-2 backdrop-blur">{touch ? "Explore in 3D, then drag and pinch" : "Drag to turn · scroll to zoom"}</p>
              <div className="absolute bottom-3 right-3 flex gap-1">
                {touch && (
                  <button type="button" onClick={() => explore(!exploring)} className={`label flex h-9 items-center gap-1.5 border px-3 backdrop-blur ${exploring ? "border-marker bg-marker text-paper" : "border-rule bg-paper/85 text-ink"}`}>
                    <Hand size={14} aria-hidden="true" /> {exploring ? "Done" : "Explore in 3D"}
                  </button>
                )}
                <button type="button" onClick={() => show.current && open(show.current)} disabled={playing} className="label flex h-9 items-center gap-1.5 border border-rule bg-paper/85 px-3 text-ink backdrop-blur hover:text-marker disabled:opacity-40">
                  <Play size={13} aria-hidden="true" /> Replay
                </button>
                <button type="button" onClick={() => show.current?.reset()} disabled={!moved} className="grid h-9 w-9 place-items-center border border-rule bg-paper/85 text-ink backdrop-blur hover:text-marker disabled:opacity-40" aria-label="Back to the front view">
                  <RotateCcw size={15} aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
