"use client";

/**
 * The isometric figure as a framed card: figure number, title, an interaction hint and a live
 * readout. Exactly one part is lit — the room being inspected. When nobody is touching it, the
 * figure tours the rooms; hovering or focusing pauses the tour, the pointer picks a room, the
 * arrow keys step through them. It stops off-screen and stays still for reduced motion.
 */

import { useEffect, useRef, useState } from "react";
import type { FigureData } from "./sunsetFigure";

const TONE = {
  wall: { top: "#161513", left: "#d6d0c2", right: "#c7c0b0" },
  item: { top: "#fbfaf6", left: "#e2ddd1", right: "#d2ccbe" },
  leaf: { top: "#fbfaf6", left: "#e9e4d8", right: "#dcd6c8" },
  glass: { top: "#9fb9c6", left: "#c4d8e2", right: "#b6ccd7" },
  rug: { top: "#e3d7c4", left: "#e3d7c4", right: "#e3d7c4" },
} as const;

const TOUR_MS = 2600;

export function IsoFigure({ data, fig = "01", title }: { data: FigureData; fig?: string; title: string }) {
  const tour = data.rooms.filter((r) => !/hall/i.test(r.label)).map((r) => r.id);
  const [lit, setLit] = useState(tour[0]);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(true);
  const [still, setStill] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(media.matches);
    sync();
    media.addEventListener("change", sync);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    if (card.current) io.observe(card.current);
    return () => {
      media.removeEventListener("change", sync);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (held || !visible || still) return;
    const t = setInterval(() => setLit((cur) => tour[(tour.indexOf(cur) + 1) % tour.length]), TOUR_MS);
    return () => clearInterval(t);
  }, [held, visible, still, tour]);

  const room = data.rooms.find((r) => r.id === lit) ?? data.rooms[0];
  const step = (d: number) => setLit((cur) => tour[(tour.indexOf(cur) + d + tour.length) % tour.length]);

  return (
    <div
      ref={card}
      className="relative flex flex-col border border-rule bg-paper"
      tabIndex={0}
      role="group"
      aria-label={`Figure ${fig}: ${title}. Use the arrow keys to inspect rooms.`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), step(1));
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), step(-1));
      }}
    >
      <div className="flex items-start justify-between px-4 pt-3">
        <span className="label text-ink-3">Fig. {fig}</span>
        <span className="label text-right text-ink-2">{title}</span>
      </div>

      <svg viewBox={data.viewBox} className="w-full select-none" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="iso-halo">
            <stop offset="0%" stopColor="#161513" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#161513" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={data.halo.cx} cy={data.halo.cy} rx={data.halo.rx} ry={data.halo.ry} fill="url(#iso-halo)" />
        {data.rooms.map((r) => (
          <polygon
            key={r.id}
            points={r.points}
            fill={r.id === lit ? "var(--color-marker-soft)" : "#e9e5da"}
            stroke={r.id === lit ? "var(--color-marker)" : "#161513"}
            strokeWidth={r.id === lit ? 1.4 : 0.6}
            strokeLinejoin="round"
            className="cursor-crosshair transition-[fill] duration-500"
            onPointerEnter={() => tour.includes(r.id) && setLit(r.id)}
          />
        ))}
        {data.arcs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#85817a" strokeWidth={0.6} strokeDasharray="2 2" pointerEvents="none" />
        ))}
        <g pointerEvents="none" strokeLinejoin="round">
          {data.solids.map((s) =>
            s.faces.map((f, i) => (
              <polygon
                key={`${s.id}-${i}`}
                points={f.points}
                fill={TONE[s.kind][f.tone]}
                fillOpacity={s.kind === "glass" ? 0.65 : 1}
                stroke="#161513"
                strokeWidth={s.kind === "wall" && f.tone === "top" ? 0.3 : 0.6}
              />
            )),
          )}
        </g>
      </svg>

      <div className="flex items-end justify-between gap-4 px-4 pb-3">
        <span className="label hidden text-ink-3 sm:inline">Hover a room · ← → to step</span>
        <p className="label text-right text-ink" aria-live="polite">
          <span className="text-marker">{room.label}</span>
          <span className="text-ink-3"> · </span>
          {room.area.toFixed(1)} m²
          <span className="text-ink-3"> · </span>
          daylight {room.daylight}%
          <span className="text-ink-3"> · </span>
          {room.doorsFromEntrance === null ? "unreachable" : `${room.doorsFromEntrance} door${room.doorsFromEntrance === 1 ? "" : "s"} in`}
        </p>
      </div>
    </div>
  );
}
