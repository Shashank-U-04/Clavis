/** View-only UI state (layout, tabs, overlays). Never part of the design or its history. */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Pt } from "../model/geometry";

export type Layout = "split" | "plan" | "3d";
export type RightTab = "assistant" | "review" | "inspect" | "project";

interface UiState {
  layout: Layout;
  rightTab: RightTab;
  /** a circulation route drawn over the plan: entrance → room, through door centres */
  route: { roomId: string; points: Pt[] } | null;
  feedOpen: boolean;
  /** shown once per session when the plan is empty */
  welcome: boolean;
}

const KEY = "clavis:ui";
const saved = (): Partial<UiState> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { layout: ["split", "plan", "3d"].includes(v.layout) ? v.layout : undefined, feedOpen: typeof v.feedOpen === "boolean" ? v.feedOpen : undefined };
  } catch {
    return {};
  }
};

export const ui = createStore<UiState>(() => ({
  layout: "split",
  rightTab: "assistant",
  route: null,
  feedOpen: false,
  welcome: true,
  ...(typeof window === "undefined" ? {} : saved()),
}));

ui.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ layout: s.layout, feedOpen: s.feedOpen }));
  } catch {
    /* per-viewer convenience only */
  }
});

export const useUi = <T>(sel: (s: UiState) => T): T => useStore(ui, sel);
export const setUi = (p: Partial<UiState>) => ui.setState(p);
