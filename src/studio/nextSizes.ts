/**
 * The sizes the next piece is placed at, set in the library before placing it: a wall's
 * thickness and height, a door's or window's width, height and sill, a ready-made room's width
 * and depth, a piece of furniture's width, depth and height. Each starts at the usual size; a
 * room or a piece only takes a size of its own once you change it (and goes back with Reset).
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { DEFAULT_CEILING } from "../model/levels";

export interface NextSizes {
  wall: { thickness: number; height: number };
  door: { width: number; height: number };
  window: { width: number; height: number; sill: number };
  /** ready-made rooms whose size you changed, by block id */
  room: Record<string, { w: number; h: number }>;
  /** pieces whose size you changed, by catalog kind */
  item: Record<string, { w: number; d: number; h: number }>;
}

export const DEFAULT_SIZES: NextSizes = {
  wall: { thickness: 0.15, height: DEFAULT_CEILING },
  door: { width: 0.9, height: 2.1 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
  room: {},
  item: {},
};

export const nextSizes = createStore<NextSizes>(() => structuredClone(DEFAULT_SIZES));

export const useNextSizes = <T>(sel: (s: NextSizes) => T): T => useStore(nextSizes, sel);

export const setNextSizes = (patch: Partial<NextSizes>) => nextSizes.setState(patch);

/** A size within sensible limits, to the centimetre. */
export const clampSize = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
