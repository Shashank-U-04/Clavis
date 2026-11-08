/**
 * The plan's camera: which part of the world is visible and at what scale.
 * World units are metres; the SVG draws at `scale` pixels per metre with its top-left corner
 * at world (left, top).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PlanModel } from "../model/types";

export interface Viewport {
  left: number;
  top: number;
  scale: number;
}

const MIN_SCALE = 12;
const MAX_SCALE = 600;
const limit = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The smallest rectangle around every wall and room, or null for an empty plan. */
export function extentOf(m: PlanModel): Extent | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of m.walls) xs.push(w.ax, w.bx), ys.push(w.ay, w.by);
  for (const r of m.rooms) xs.push(r.x, r.x + r.w), ys.push(r.y, r.y + r.h);
  return xs.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : null;
}

export function useViewport(svg: RefObject<SVGSVGElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<Viewport>({ left: -2, top: -2, scale: 60 });
  /** set once the person pans or zooms; until then the plan follows resizes */
  const touched = useRef(false);
  const framed = useRef<Extent | null>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [svg]);

  const fit = useCallback(
    (extent: Extent | null) => {
      if (!extent) return;
      const margin = 1;
      const w = extent.maxX - extent.minX + margin * 2;
      const h = extent.maxY - extent.minY + margin * 2;
      const scale = limit(Math.min(220, size.width / w, size.height / h));
      // centre the plan; the looser axis gets the slack on both sides
      setView({ left: extent.minX - margin - (size.width / scale - w) / 2, top: extent.minY - margin - (size.height / scale - h) / 2, scale });
      framed.current = extent;
      touched.current = false;
    },
    [size.width, size.height],
  );

  /** Screen point → world point. */
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = svg.current!.getBoundingClientRect();
      return { x: view.left + (clientX - r.left) / view.scale, y: view.top + (clientY - r.top) / view.scale };
    },
    [svg, view],
  );

  /** Zoom by `factor` keeping the world point under (sx, sy) screen pixels fixed. */
  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    touched.current = true;
    setView((v) => {
      const scale = limit(v.scale * factor);
      const wx = v.left + sx / v.scale;
      const wy = v.top + sy / v.scale;
      return { scale, left: wx - sx / scale, top: wy - sy / scale };
    });
  }, []);

  const zoomCentre = (factor: number) => zoomAt(factor, size.width / 2, size.height / 2);

  const panBy = useCallback((dxPx: number, dyPx: number) => {
    touched.current = true;
    setView((v) => ({ ...v, left: v.left - dxPx / v.scale, top: v.top - dyPx / v.scale }));
  }, []);

  // wheel zoom must be a non-passive listener so the page itself does not scroll
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [svg, zoomAt]);

  return { view, size, fit, toWorld, zoomCentre, panBy, touched, framed };
}

/** Whether two extents differ enough that the plan should be re-framed. */
export function movedFar(a: Extent | null, b: Extent | null, by = 1.5): boolean {
  if (!a || !b) return a !== b;
  return Math.abs(a.minX - b.minX) > by || Math.abs(a.minY - b.minY) > by || Math.abs(a.maxX - b.maxX) > by || Math.abs(a.maxY - b.maxY) > by;
}
