"use client";

/**
 * A plan in the library: its drawing, name, numbers and source, a star, and a menu to open,
 * rename, duplicate, download or delete it. Shown as a card in the grid or a row in the list.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Copy, Download, Ellipsis, Pencil, Star, Trash2 } from "lucide-react";
import { browserStorage, downloadDocument } from "@/model/persistence";
import { loadProject } from "@/model/library";
import { planToSvg } from "@/export/planSvg";
import { deletePlan, duplicatePlan, logEvent, renamePlan, starPlan } from "@/lib/workspace/browser";
import { mutate } from "@/lib/workspace/useWorkspace";
import type { Plan } from "@/lib/workspace/types";
import { SourceTag, ago } from "./ui";

export const studioHref = (id: string) => `/studio/try?project=${encodeURIComponent(id)}`;
export const planHref = (id: string) => `/plans/${encodeURIComponent(id)}`;

/** The plan's drawing, as an image. `stamp` re-draws it when the plan is saved again. */
export function PlanThumb({ id, stamp, className = "", pad = "p-3" }: { id: string; stamp: number; className?: string; pad?: string }) {
  const src = useMemo(() => {
    const r = loadProject(browserStorage(), id);
    if (!r.ok || r.value.model.walls.length === 0) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planToSvg(r.value.model))}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stamp]);
  return (
    <div className={`relative grid place-items-center overflow-hidden bg-paper ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={`absolute inset-0 h-full w-full object-contain ${pad}`} />
      ) : (
        <span className="label text-ink-3">Empty plan</span>
      )}
    </div>
  );
}

/** A menu of actions under a small button; closes on a pick, a click outside or Escape. */
export function ActionMenu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", out);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", out);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={label} className="grid h-8 w-8 place-items-center border border-rule bg-paper hover:border-ink">
        <Ellipsis size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+4px)] z-20 w-52 border border-ink bg-paper py-1 shadow-[6px_6px_0_var(--color-rule)]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export const menuItem = "flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-paper-2";

export function download(id: string) {
  const s = browserStorage();
  const r = loadProject(s, id);
  if (!r.ok) return;
  downloadDocument(r.value.model, r.value.notes ?? []);
  mutate((st) => logEvent(st, { at: Date.now(), kind: "exported", planId: id, planName: r.value.model.name, detail: "Design file (.json)" }));
}

export function PlanCard({ plan, view = "grid" }: { plan: Plan; view?: "grid" | "list" }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(plan.name);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setName(plan.name), [plan.name]);

  const commit = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== plan.name) {
      const r = mutate((s) => renamePlan(s, plan.id, name));
      if (!r.ok) setErr(r.message);
    } else setName(plan.name);
  };

  const title = renaming ? (
    <input
      autoFocus
      value={name}
      maxLength={80}
      aria-label="Plan name"
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") (setName(plan.name), setRenaming(false));
      }}
      className="w-full border border-ink bg-paper px-1.5 py-0.5 font-semibold outline-none"
    />
  ) : (
    <Link href={planHref(plan.id)} className="block truncate font-semibold hover:text-marker">
      {plan.name}
    </Link>
  );

  const facts = (
    <span className="label text-ink-3">
      {plan.rooms} rooms · {plan.area} m² · edited {ago(plan.updatedAt)}
    </span>
  );

  const star = (
    <button
      type="button"
      onClick={() => mutate((s) => starPlan(s, plan.id, !plan.starred))}
      aria-pressed={!!plan.starred}
      aria-label={plan.starred ? `Unstar ${plan.name}` : `Star ${plan.name}`}
      className={`grid h-8 w-8 place-items-center border bg-paper ${plan.starred ? "border-marker text-marker" : "border-rule text-ink-3 hover:border-ink hover:text-ink"}`}
    >
      <Star size={14} fill={plan.starred ? "currentColor" : "none"} />
    </button>
  );

  const menu = (
    <ActionMenu label={`Actions for ${plan.name}`}>
      {(close) =>
        confirm ? (
          <div className="px-3 py-2">
            <p className="text-sm">Delete “{plan.name}” and its versions from this browser?</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="label bg-marker px-3 py-1.5 text-paper" onClick={() => (mutate((s) => deletePlan(s, plan.id)), close())}>
                Delete
              </button>
              <button type="button" className="label border border-rule px-3 py-1.5" onClick={() => (setConfirm(false), close())}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <>
            <Link href={studioHref(plan.id)} className={menuItem} role="menuitem">
              <ArrowUpRight size={14} /> Open in studio
            </Link>
            <button type="button" role="menuitem" className={menuItem} onClick={() => (setRenaming(true), close())}>
              <Pencil size={14} /> Rename
            </button>
            <button type="button" role="menuitem" className={menuItem} onClick={() => (mutate((s) => duplicatePlan(s, plan.id)), close())}>
              <Copy size={14} /> Duplicate
            </button>
            <button type="button" role="menuitem" className={menuItem} onClick={() => (download(plan.id), close())}>
              <Download size={14} /> Download file
            </button>
            <hr className="my-1 border-rule" />
            <button type="button" role="menuitem" className={`${menuItem} text-marker`} onClick={() => setConfirm(true)}>
              <Trash2 size={14} /> Delete…
            </button>
          </>
        )
      }
    </ActionMenu>
  );

  if (view === "list")
    return (
      <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule px-5 py-3 hover:bg-paper-2/60 md:grid-cols-[5.5rem_minmax(0,1fr)_10rem_auto] md:px-8">
        <Link href={planHref(plan.id)} tabIndex={-1} aria-hidden="true">
          <PlanThumb id={plan.id} stamp={plan.updatedAt} className="aspect-[4/3] border border-rule-soft" pad="p-0.5" />
        </Link>
        <div className="min-w-0">
          {title}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {facts}
            <SourceTag source={plan.source} />
          </div>
          {err && <p className="mt-1 text-sm text-marker">{err}</p>}
        </div>
        <span className="label hidden text-ink-3 md:block">{plan.openedAt ? `Opened ${ago(plan.openedAt)}` : "Not opened yet"}</span>
        <div className="flex items-center gap-1.5">
          {star}
          <Link href={studioHref(plan.id)} className="label hidden border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper sm:block">
            Open
          </Link>
          {menu}
        </div>
      </li>
    );

  return (
    <li className="group relative flex flex-col border-b border-r border-rule">
      <Link href={planHref(plan.id)} className="block hover:bg-paper-2" tabIndex={-1} aria-hidden="true">
        <PlanThumb id={plan.id} stamp={plan.updatedAt} className="aspect-[4/3] border-b border-rule-soft" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {title}
        {facts}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <SourceTag source={plan.source} />
          <Link href={studioHref(plan.id)} className="label flex items-center gap-1.5 text-ink-2 hover:text-marker">
            Open <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
        {err && <p className="text-sm text-marker">{err}</p>}
      </div>
      <div className="absolute right-2 top-2 flex gap-1.5">
        <span className={plan.starred ? "" : "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"}>{star}</span>
        <span className="transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">{menu}</span>
      </div>
    </li>
  );
}
