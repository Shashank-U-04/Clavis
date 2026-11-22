/**
 * Whether the walk is seen from behind the walker (third person) or through their eyes (first
 * person). The 3D view owns it — scrolling all the way in switches to first person — and the
 * walk's controls bar reads it and can flip it.
 */

import { useSyncExternalStore } from "react";

export type WalkView = "third" | "first";

let current: WalkView = "third";
const listeners = new Set<() => void>();
const flips = new Set<(view: WalkView) => void>();

export const walkView = {
  get: () => current,
  /** the 3D view reports what it shows */
  set(view: WalkView) {
    if (view === current) return;
    current = view;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  /** the controls ask the 3D view to switch */
  request(view: WalkView) {
    for (const f of flips) f(view);
  },
  onRequest(f: (view: WalkView) => void) {
    flips.add(f);
    return () => void flips.delete(f);
  },
};

export const useWalkView = () => useSyncExternalStore(walkView.subscribe, walkView.get, () => "third" as WalkView);
