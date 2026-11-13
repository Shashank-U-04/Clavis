"use client";

/**
 * The opening sheet. Before the page appears, the entrance elevation of the Sunset Loft is
 * set out: a datum line runs across the sheet at the section-cut height, and the line drawing
 * appears behind its head while the build log counts up. At 100 % the datum splits into two
 * lines that open a band, and the drawing between them is rendered in tone. Then the sheet
 * lifts and the page is underneath.
 *
 * It plays once per browser session, never with reduced motion, and can be skipped. A small
 * inline script decides that before the first paint, so a returning visitor never sees it
 * flash. The drawing is static markup; the animation writes attributes straight onto it.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ElevationData, LineTone } from "@/components/figures/elevation";

const ID = "clavis-intro";
const SEEN = "clavis:intro";
/** Fired on window when the sheet has lifted; figures underneath wait for it. */
export const INTRO_DONE = "clavis:intro-done";

/** Phases, in milliseconds from the start. */
const PH = {
  sweep: [350, 3500],
  band: [3650, 4600],
  exit: [4700, 5400],
} as const;
const END = PH.exit[1];

const DECIDE = `(function(){var d=document.documentElement,e=document.getElementById("${ID}"),q=location.search,s=false;try{s=sessionStorage.getItem("${SEEN}")==="1"}catch(_){}if(!/[?&]intro=1/.test(q)&&(s||/[?&]intro=0/.test(q)||matchMedia("(prefers-reduced-motion: reduce)").matches)){d.dataset.intro="off";if(e)e.style.display="none"}else{d.dataset.intro="on"}})()`;

const STROKE: Record<LineTone, string> = {
  ink: "var(--color-ink)",
  mid: "var(--color-ink-2)",
  soft: "var(--color-ink-3)",
  dash: "var(--color-ink-3)",
};

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const within = (t: number, [a, b]: readonly [number, number]) => clamp((t - a) / (b - a));
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
/** Mostly even, with a soft start and stop, so the head reads as a steady pass. */
const pass = (v: number) => v * 0.7 + easeInOut(v) * 0.3;

interface Els {
  svg: SVGSVGElement | null;
  sweep: SVGRectElement | null;
  band: SVGRectElement | null;
  plumb: SVGLineElement | null;
}

function Strokes({ data, soft }: { data: ElevationData; soft?: boolean }) {
  return (
    <g fill="none" strokeLinejoin="round" opacity={soft ? 0.82 : 1}>
      {data.lines.map((l, i) => (
        <path key={i} d={l.d} stroke={STROKE[l.tone]} strokeWidth={soft ? l.w * 0.8 : l.w} strokeDasharray={l.tone === "dash" ? "3 3" : undefined} />
      ))}
      <g stroke="none" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
        {data.texts.map((t, i) => (
          <text key={i} x={t.x} y={t.y} textAnchor={t.anchor} fontSize={8.5} fill={t.tone === "ink" ? "var(--color-ink)" : "var(--color-ink-3)"}>
            {t.text}
          </text>
        ))}
      </g>
    </g>
  );
}

const Drawing = memo(function Drawing({ data, els }: { data: ElevationData; els: Els }) {
  const { box } = data;
  return (
    <svg ref={(n) => void (els.svg = n)} viewBox={data.viewBox} className="h-full w-full max-w-[1240px] select-none" aria-hidden="true">
      <defs>
        <clipPath id="intro-sweep">
          <rect ref={(n) => void (els.sweep = n)} x={box.x} y={box.y} width={0} height={box.h} />
        </clipPath>
        <clipPath id="intro-band">
          <rect ref={(n) => void (els.band = n)} x={box.x} y={data.datumY} width={box.w} height={0} />
        </clipPath>
      </defs>

      {/* the line drawing, uncovered behind the head of the datum */}
      <g clipPath="url(#intro-sweep)">
        <Strokes data={data} soft />
      </g>
      <line ref={(n) => void (els.plumb = n)} y1={box.y} y2={box.y + box.h} stroke="var(--color-marker)" strokeWidth={0.6} opacity={0} />

      {/* the same drawing in tone, shown inside the band */}
      <g clipPath="url(#intro-band)">
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="var(--color-paper)" />
        {data.fills.map((f, i) => (
          <path key={i} d={f.d} fill={f.fill} fillOpacity={f.opacity} />
        ))}
        <Strokes data={data} />
      </g>
    </svg>
  );
});

export function Intro({ data, block, log }: { data: ElevationData; block: [string, string][]; log: [string, string][] }) {
  // on a hard load the inline script has already said "on" or "off"; arriving by a link, skip it
  const [gone, setGone] = useState(() => typeof document !== "undefined" && !["on", "off"].includes(document.documentElement.dataset.intro ?? ""));
  const [shown, setShown] = useState({ rows: 0, log: 0 });
  const els = useRef<Els>({ svg: null, sweep: null, band: null, plumb: null }).current;
  const root = useRef<HTMLDivElement>(null);
  const lineA = useRef<HTMLDivElement>(null);
  const lineB = useRef<HTMLDivElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLParagraphElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {
      /* it will simply play again next time */
    }
    document.documentElement.dataset.intro = "done";
    window.dispatchEvent(new Event(INTRO_DONE));
    setGone(true);
  }, []);

  useEffect(() => {
    if (gone) return;
    if (document.documentElement.dataset.intro !== "on") return finish();

    const { box, datumY } = data;
    const t0 = performance.now();
    let last = "";
    const frame = (now: number) => {
      const t = now - t0;
      const m = els.svg?.getScreenCTM();
      if (!m || !root.current) return void (raf.current = requestAnimationFrame(frame));
      const p = pass(within(t, PH.sweep));
      const q = easeInOut(within(t, PH.band));
      const head = p * window.innerWidth;

      // the head of the datum uncovers the line drawing
      const headX = (head - m.e) / m.a;
      els.sweep?.setAttribute("width", String(Math.max(0, headX - box.x)));
      els.plumb?.setAttribute("x1", headX.toFixed(1));
      els.plumb?.setAttribute("x2", headX.toFixed(1));
      els.plumb?.setAttribute("opacity", p > 0 && p < 1 ? "0.55" : "0");

      // the datum splits and opens the rendered band
      const half = (q * box.h) / 2;
      els.band?.setAttribute("y", String(datumY - half));
      els.band?.setAttribute("height", String(half * 2));
      const halfPx = half * m.d;
      const edge = 1 - within(t, [PH.band[1] - 260, PH.band[1]]);
      if (lineA.current) {
        lineA.current.style.width = q > 0 ? "100%" : `${head}px`;
        lineA.current.style.transform = `translateY(${-halfPx}px)`;
        lineA.current.style.opacity = String(edge);
      }
      if (lineB.current) {
        lineB.current.style.transform = `translateY(${halfPx}px)`;
        lineB.current.style.opacity = q > 0 ? String(edge) : "0";
      }
      if (pct.current) pct.current.textContent = String(Math.round(p * 100)).padStart(3, "0");
      if (tag.current) tag.current.style.opacity = String(1 - within(t, [PH.band[0], PH.band[0] + 300]));
      if (foot.current) foot.current.style.opacity = String(1 - 0.88 * within(t, [PH.band[0], PH.band[0] + 550]));
      root.current.style.opacity = String(1 - easeInOut(within(t, PH.exit)));

      const next = { rows: Math.min(block.length, Math.floor(t / 150)), log: Math.min(log.length, Math.floor(p * log.length + 0.02)) };
      const key = `${next.rows}.${next.log}`;
      if (key !== last) (setShown(next), (last = key));

      if (t < END) raf.current = requestAnimationFrame(frame);
      else finish();
    };
    raf.current = requestAnimationFrame(frame);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", esc);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("keydown", esc);
    };
  }, [gone, finish, data, els, block.length, log.length]);

  if (gone) return null;

  return (
    <>
      <div id={ID} ref={root} suppressHydrationWarning className="fixed inset-0 z-[100] overflow-hidden bg-paper text-ink" role="region" aria-label="Clavis is opening">
        <div className="pointer-events-none absolute inset-2 border border-rule" aria-hidden="true" />

        <button type="button" onClick={finish} className="label absolute right-5 top-5 z-10 border border-rule bg-paper px-3 py-2 text-ink-2 hover:border-ink hover:text-ink md:right-8 md:top-7">
          Skip intro
        </button>

        {/* the sheet: the drawing, with the datum through its middle */}
        <div className="absolute inset-x-0 bottom-[36%] top-0 flex items-center justify-center px-[4vw] py-10 md:bottom-[30%]">
          <Drawing data={data} els={els} />
          <div ref={lineA} className="absolute left-0 top-1/2 h-px bg-marker will-change-transform" style={{ width: 0 }} aria-hidden="true" />
          <div ref={lineB} className="absolute left-0 top-1/2 h-px w-full bg-marker opacity-0 will-change-transform" aria-hidden="true" />
          <p ref={tag} className="label absolute left-5 top-1/2 -translate-y-[1.5rem] tabular-nums text-marker md:left-8" aria-hidden="true">
            <span ref={pct}>000</span> % · cut +1.20 m
          </p>
        </div>

        {/* the title block */}
        <div ref={foot} className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-10 px-5 pb-7 md:px-10 md:pb-10">
          <p className="text-[clamp(1.6rem,4.6vw,3.7rem)] font-semibold uppercase leading-[0.95] tracking-[-0.035em]">
            <span className="block whitespace-nowrap">Describe a home.</span>
            <span className="block whitespace-nowrap">Walk through it.</span>
          </p>
          <div className="hidden shrink-0 gap-10 font-mono text-[0.66rem] uppercase leading-[1.75] tracking-[0.08em] sm:flex" aria-hidden="true">
            <div className="w-[19rem]">
              <p className="border-b border-dashed border-ink-3 pb-1.5 text-ink-3">Sheet 00 · Entrance elevation</p>
              <dl className="mt-1.5">
                {block.map(([k, v], i) => (
                  <div key={k} className={`grid grid-cols-[5.5rem_0.8rem_1fr] transition-opacity duration-300 ${i < shown.rows ? "opacity-100" : "opacity-0"}`}>
                    <dt className="text-ink-3">{k}</dt>
                    <span className="text-ink-3">:</span>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <ol className="hidden w-[15rem] lg:block">
              {log.map(([code, text], i) => (
                <li key={code} className={`grid grid-cols-[2.2rem_1fr] transition-opacity duration-200 ${i < shown.log ? "opacity-100" : "opacity-0"} ${i === shown.log - 1 ? "text-marker" : "text-ink-2"}`}>
                  <span>{code}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
      <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: DECIDE }} />
      <noscript>
        <style>{`#${ID}{display:none}`}</style>
      </noscript>
    </>
  );
}
