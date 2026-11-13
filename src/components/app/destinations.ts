/**
 * The app's destinations, in one place for the sidebar, the drawer and the top bar's sheet
 * title. Each page is a sheet of the set, lettered as a drawing set would be.
 */

import { History, House, Layers, LayoutTemplate, Plus, Settings, UserRound, type LucideIcon } from "lucide-react";

export interface AppDest {
  href: string;
  label: string;
  sheet: string;
  icon: LucideIcon;
}

export const WORK: AppDest[] = [
  { href: "/dashboard", label: "Home", sheet: "A", icon: House },
  { href: "/plans", label: "Plans", sheet: "B", icon: Layers },
  { href: "/templates", label: "Templates", sheet: "D", icon: LayoutTemplate },
  { href: "/history", label: "History", sheet: "E", icon: History },
];

export const YOU: AppDest[] = [
  { href: "/profile", label: "Profile", sheet: "F", icon: UserRound },
  { href: "/settings", label: "Settings", sheet: "G", icon: Settings },
];

export const NEW_PLAN: AppDest = { href: "/new", label: "New plan", sheet: "C", icon: Plus };

const ALL = [...WORK, NEW_PLAN, ...YOU];

export const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** The sheet the path is on, for the top bar: "B · Plans", or "B.1 · Plan" for one plan. */
export function sheetFor(path: string): { sheet: string; label: string } {
  if (/^\/plans\/[^/]+/.test(path)) return { sheet: "B.1", label: "Plan" };
  const d = ALL.find((x) => isActive(path, x.href));
  return d ? { sheet: d.sheet, label: d.label } : { sheet: "A", label: "Home" };
}
