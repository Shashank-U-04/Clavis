/** View-only UI state (views, theme, tabs, overlays). Never part of the design or its history. */

import { useEffect, useState } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Pt } from "../model/geometry";
import { actions, store } from "../model/store";
import { ALL_VIEWS, readTheme, readViews, soloFeature, soloView, toggleFeature, toggleView, type Feature, type Screen, type ThemePref, type ViewKey, type Views } from "./views";
import { applyTheme } from "../lib/theme";

export type RightTab = "assistant" | "review" | "inspect" | "project";

interface UiState {
  /** which of plan, 3D and the side panel are on screen */
  views: Views;
  theme: ThemePref;
  rightTab: RightTab;
  /** the library drawer beside the tool strip, and which shelf it shows */
  library: boolean;
  libraryTab: "rooms" | "furniture";
  /** the step-by-step guide for building a plan by hand */
  guide: boolean;
  /** a circulation route drawn over the plan: entrance → room, through door centres */
  route: { roomId: string; points: Pt[] } | null;
  feedOpen: boolean;
  /** shown once per session when the plan is empty */
  welcome: boolean;
  /** measurements drawn on the plan */
  dims: boolean;
}

const KEY = "clavis:ui";
const saved = (): Partial<UiState> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      views: readViews(v.views, v.layout),
      theme: readTheme(v.theme),
      feedOpen: typeof v.feedOpen === "boolean" ? v.feedOpen : undefined,
      library: typeof v.library === "boolean" ? v.library : undefined,
      libraryTab: v.libraryTab === "rooms" || v.libraryTab === "furniture" ? v.libraryTab : undefined,
      guide: typeof v.guide === "boolean" ? v.guide : undefined,
      dims: typeof v.dims === "boolean" ? v.dims : undefined,
    };
  } catch {
    return {};
  }
};

const defined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export const ui = createStore<UiState>(() => ({
  views: { ...ALL_VIEWS },
  theme: "light",
  rightTab: "assistant",
  library: false,
  libraryTab: "rooms",
  guide: false,
  route: null,
  feedOpen: false,
  welcome: true,
  dims: true,
  ...(typeof window === "undefined" ? {} : defined(saved())),
}));

ui.subscribe((s, prev) => {
  // the studio's theme is the whole site's theme
  if (s.theme !== prev.theme) applyTheme(s.theme);
  try {
    localStorage.setItem(KEY, JSON.stringify({ views: s.views, theme: s.theme, feedOpen: s.feedOpen, library: s.library, libraryTab: s.libraryTab, guide: s.guide, dims: s.dims }));
  } catch {
    /* per-viewer convenience only */
  }
});

export const useUi = <T>(sel: (s: UiState) => T): T => useStore(ui, sel);

/** Update UI state. Choosing a side-panel tab also brings the panel back on screen. */
export const setUi = (p: Partial<UiState>) => {
  const views = p.rightTab && !p.views && !ui.getState().views.side ? { ...ui.getState().views, side: true } : p.views;
  ui.setState(views ? { ...p, views } : p);
};

/** Open the library on a shelf, or close it when that shelf is already showing. */
export function openLibrary(tab: "rooms" | "furniture", toggle = true) {
  const s = ui.getState();
  if (toggle && s.library && s.libraryTab === tab) return setUi({ library: false });
  if (!s.views.plan && !s.views.scene) setUi({ views: { ...s.views, plan: true } });
  setUi({ library: true, libraryTab: tab });
}

export const viewActions = {
  toggle: (k: ViewKey) => setUi({ views: toggleView(ui.getState().views, k) }),
  solo: (k: ViewKey) => setUi({ views: soloView(ui.getState().views, k) }),
  all: () => setUi({ views: { ...ALL_VIEWS } }),
  show: (k: ViewKey) => !ui.getState().views[k] && setUi({ views: { ...ui.getState().views, [k]: true } }),
};

/** What is on screen now: the views, and whether the 3D view is walking. */
const screen = (): Screen => ({ views: ui.getState().views, walk: store.getState().editor.camera === "walk" });

function applyScreen(next: Screen) {
  const cur = screen();
  if (next.views !== cur.views) setUi({ views: next.views });
  if (next.walk !== cur.walk) actions.setCamera(next.walk ? "walk" : "orbit");
}

/** The bar's four features: 2D plan, 3D model, walk and chat. */
export const featureActions = {
  toggle: (f: Feature) => {
    // the chat button brings the chat forward when the panel shows another tab
    if (f === "chat" && ui.getState().views.side && ui.getState().rightTab !== "assistant") return setUi({ rightTab: "assistant" });
    applyScreen(toggleFeature(screen(), f));
  },
  solo: (f: Feature) => {
    applyScreen(soloFeature(screen(), f));
    if (f === "chat") setUi({ rightTab: "assistant" });
  },
  all: () => applyScreen({ views: { ...ALL_VIEWS }, walk: false }),
  /** leave the walk for the 3D model, keeping whatever else is on screen */
  exitWalk: () => applyScreen({ views: { ...ui.getState().views, scene: true }, walk: false }),
};

/** The theme actually in use: a saved choice, or the system's when set to follow it. */
export function resolvedTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme in use, following the system live when the choice is "system". */
export function useResolvedTheme(): "light" | "dark" {
  const pref = useUi((s) => s.theme);
  const [, bump] = useState(0);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => bump((n) => n + 1);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);
  return resolvedTheme(pref);
}
