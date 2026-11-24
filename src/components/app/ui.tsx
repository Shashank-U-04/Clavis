/**
 * Small pieces the app pages share: the sheet's title block, the avatar, the source tag and
 * the ways times and sizes are written.
 */

import type { ReactNode } from "react";
import type { PlanSource } from "@/lib/workspace/types";
import { findTemplate } from "@/lib/catalogue";

/** The title block at the top of every app page. */
export function SheetHeader({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-rule px-5 py-8 md:px-8 md:py-10">
      <div className="min-w-0">
        <h1 className="text-balance text-[clamp(2rem,4vw,2.9rem)] font-semibold leading-[1.02] tracking-[-0.03em]">{title}</h1>
        {intro && <p className="mt-3 max-w-xl text-pretty text-ink-2">{intro}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A labelled band across the sheet that opens a section. */
export function Band({ title, children, id }: { title: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-2.5 md:px-8">
      <h2 id={id} className="label text-ink-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return w.length ? w.slice(0, 2).map((x) => x[0]!.toUpperCase()).join("") : "G";
}

/** Initials on a square of the person's colour: a drawing-office stamp, not a photo. */
export function Avatar({ name, hue, size = 32, className = "" }: { name: string; hue: number; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center font-mono font-medium text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36, letterSpacing: "0.04em", background: `oklch(0.52 0.14 ${hue})` }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function sourceLabel(src?: PlanSource): string {
  if (!src) return "Plan";
  if (src.startsWith("template:")) return findTemplate(src.slice(9))?.name ?? "Template";
  const names: Record<string, string> = { blank: "Blank", describe: "Described", import: "Imported", duplicate: "Copy", restore: "From a version" };
  return names[src] ?? "Plan";
}

export function SourceTag({ source }: { source?: PlanSource }) {
  if (!source) return null;
  const tpl = source.startsWith("template:");
  return <span className={`label inline-block border px-1.5 py-0.5 text-[0.62rem] ${tpl ? "border-marker/40 text-marker" : "border-rule text-ink-3"}`}>{tpl ? `Template · ${sourceLabel(source)}` : sourceLabel(source)}</span>;
}

export function ago(ms: number, now = Date.now()): string {
  const d = (now - ms) / 1000;
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 7 * 86400) return `${Math.round(d / 86400)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function dayLabel(ms: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).toDateString();
  if (day(ms) === day(now)) return "Today";
  if (day(ms) === day(now - 86400000)) return "Yesterday";
  return new Date(ms).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** What a browser typically allows one site; the real limit is not exposed. */
export const STORAGE_BUDGET = 5 * 1024 * 1024;
