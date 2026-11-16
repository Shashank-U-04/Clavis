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

export type ThemePref = "light" | "dark" | "system";
export const readTheme = (t: unknown): ThemePref | undefined => (t === "light" || t === "dark" || t === "system" ? t : undefined);
