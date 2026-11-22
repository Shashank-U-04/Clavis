/**
 * Light or dark, for the whole of Clavis: the site, the app and the studio share one choice,
 * kept in this browser with the studio's other preferences ("clavis:ui"). "system" follows the
 * device. The choice is applied to <html> as the class "dark" — by a tiny script in the page's
 * head before anything is painted, so a dark page never flashes light — and every colour on
 * the site is a variable that the class switches (globals.css).
 */

export type ThemePref = "light" | "dark" | "system";

export const UI_KEY = "clavis:ui";
const EVENT = "clavis-theme";

const isPref = (t: unknown): t is ThemePref => t === "light" || t === "dark" || t === "system";

/** The saved choice ("light" when there is none). */
export function readThemePref(): ThemePref {
  try {
    const t = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}").theme;
    return isPref(t) ? t : "light";
  } catch {
    return "light";
  }
}

export const resolveTheme = (pref: ThemePref): "light" | "dark" =>
  pref === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref;

/** Put the choice on the page. */
export function applyTheme(pref: ThemePref = readThemePref()) {
  const dark = resolveTheme(pref) === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Save the choice with the other preferences, put it on the page and tell anyone listening. */
export function saveThemePref(pref: ThemePref) {
  try {
    const all = JSON.parse(localStorage.getItem(UI_KEY) ?? "{}");
    localStorage.setItem(UI_KEY, JSON.stringify({ ...all, theme: pref }));
  } catch {
    /* storage full or blocked: the page still switches */
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: pref }));
}

/** Hear of a change made elsewhere: another control on this page, or another tab. */
export function onThemeChange(listener: (pref: ThemePref) => void): () => void {
  const local = (e: Event) => listener((e as CustomEvent<ThemePref>).detail);
  const other = (e: StorageEvent) => e.key === UI_KEY && listener(readThemePref());
  window.addEventListener(EVENT, local);
  window.addEventListener("storage", other);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener("storage", other);
  };
}

/** Runs in the page's head before it is painted: the same as applyTheme, written out small. */
export const THEME_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(UI_KEY)})||"{}").theme;var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;if(d)e.classList.add("dark");e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
