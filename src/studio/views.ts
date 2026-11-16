/**
 * Which parts of the studio are on screen: the plan, the 3D view and the side panel (chat,
 * review, details, project). Any mix can be shown, from all three down to one; the last one
 * left can't be turned off. Pure functions, so the rules are easy to test.
 */

export type ViewKey = "plan" | "scene" | "side";
export type Views = Record<ViewKey, boolean>;

export const VIEW_KEYS: ViewKey[] = ["plan", "scene", "side"];
export const ALL_VIEWS: Views = { plan: true, scene: true, side: true };

/** Turn one view on or off, keeping at least one on screen. */
export function toggleView(v: Views, key: ViewKey): Views {
  const next = { ...v, [key]: !v[key] };
  return VIEW_KEYS.some((k) => next[k]) ? next : v;
}

/** Show only this view; if it is already the only one, show everything again. */
export function soloView(v: Views, key: ViewKey): Views {
  const alone = VIEW_KEYS.every((k) => v[k] === (k === key));
  return alone ? { ...ALL_VIEWS } : { plan: key === "plan", scene: key === "scene", side: key === "side" };
}

export const countViews = (v: Views) => VIEW_KEYS.filter((k) => v[k]).length;

/** Read views saved by this or an older studio (which saved one of three layouts). */
export function readViews(saved: unknown, oldLayout: unknown): Views | undefined {
  if (saved && typeof saved === "object") {
    const s = saved as Record<string, unknown>;
    const v: Views = { plan: s.plan === true, scene: s.scene === true, side: s.side === true };
    return countViews(v) > 0 ? v : undefined;
  }
  if (oldLayout === "plan") return { plan: true, scene: false, side: true };
  if (oldLayout === "3d") return { plan: false, scene: true, side: true };
  if (oldLayout === "split") return { ...ALL_VIEWS };
  return undefined;
}

/**
 * The studio's four features as the bar shows them. Plan and chat are views of their own;
 * the 3D model and the walk-through share the one 3D view, which is in walk mode or not.
 */
export type Feature = "plan" | "model" | "walk" | "chat";
export interface Screen {
  views: Views;
  /** the 3D view is in first-person walk mode */
  walk: boolean;
}

export const FEATURES: Feature[] = ["plan", "model", "walk", "chat"];

export function featureOn(s: Screen, f: Feature): boolean {
  if (f === "plan") return s.views.plan;
  if (f === "chat") return s.views.side;
  return s.views.scene && s.walk === (f === "walk");
}

/**
 * Turn a feature on or off. Turning on the 3D model or the walk switches the 3D view to it;
 * turning either off hides the 3D view. The last view on screen can't be turned off.
 */
export function toggleFeature(s: Screen, f: Feature): Screen {
  if (f === "plan" || f === "chat") {
    const views = toggleView(s.views, f === "plan" ? "plan" : "side");
    return views === s.views ? s : { ...s, views };
  }
  const walk = f === "walk";
  if (!featureOn(s, f)) return { views: { ...s.views, scene: true }, walk };
  const views = toggleView(s.views, "scene");
  return views === s.views ? s : { views, walk: false };
}

/** Show one feature alone; if it already is, show plan, model and chat together. */
export function soloFeature(s: Screen, f: Feature): Screen {
  const key: ViewKey = f === "plan" ? "plan" : f === "chat" ? "side" : "scene";
  const alone = VIEW_KEYS.every((k) => s.views[k] === (k === key)) && featureOn(s, f);
  if (alone) return { views: { ...ALL_VIEWS }, walk: false };
  return { views: { plan: key === "plan", scene: key === "scene", side: key === "side" }, walk: f === "walk" };
}

export type ThemePref = "light" | "dark" | "system";
export const readTheme = (t: unknown): ThemePref | undefined => (t === "light" || t === "dark" || t === "system" ? t : undefined);
