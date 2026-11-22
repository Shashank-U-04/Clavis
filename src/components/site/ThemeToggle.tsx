"use client";

/**
 * The light / dark switch in the site's header and menus. It flips between light and dark (a
 * "follow the device" choice is made in Settings) and keeps the page in step when the choice
 * changes in another tab, in the studio, or when the device switches and the choice is "system".
 */

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, onThemeChange, readThemePref, resolveTheme, saveThemePref } from "@/lib/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(resolveTheme(readThemePref()) === "dark");
    sync();
    const stop = onThemeChange((pref) => (applyTheme(pref), sync()));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const device = () => readThemePref() === "system" && (applyTheme("system"), sync());
    mq.addEventListener("change", device);
    return () => (stop(), mq.removeEventListener("change", device));
  }, []);
  const label = dark ? "Switch to the light theme" : "Switch to the dark theme";
  return (
    <button type="button" onClick={() => saveThemePref(dark ? "light" : "dark")} aria-label={label} title={label} className={className}>
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
