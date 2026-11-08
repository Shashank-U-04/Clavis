"use client";

/**
 * The projects in this browser, as cards with a small plan of each. Until accounts are on,
 * this is the whole library; once they are, cloud projects join it.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Copy, FilePlus2, LayoutTemplate, Search, Sparkles, Sun, Trash2 } from "lucide-react";
import { browserStorage } from "@/model/persistence";
import { deleteProject, listProjects, loadProject, newProjectId, saveProject, type ProjectMeta } from "@/model/library";
import { planToSvg } from "@/export/planSvg";

const NEW = [
  { href: "/studio/try?new=blank", icon: FilePlus2, label: "Blank plan", text: "Draw walls and rooms yourself." },
  { href: "/studio/try?new=describe", icon: Sparkles, label: "Describe a home", text: "Let the assistant lay it out." },
  { href: "/studio/try?new=template", icon: LayoutTemplate, label: "Template", text: "A compact two-bedroom home." },
  { href: "/studio/try?new=sunset", icon: Sun, label: "Sunset Loft", text: "The 110 m² showcase home." },
];

function thumbnail(id: string): string | null {
  const r = loadProject(browserStorage(), id);
  if (!r.ok || r.value.model.walls.length === 0) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planToSvg(r.value.model))}`;
}

const when = (ms: number) => {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
};

export function ProjectGrid() {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const refresh = () => setList(listProjects(browserStorage()));
  useEffect(refresh, []);
  const thumbs = useMemo(() => new Map((list ?? []).map((p) => [p.id, thumbnail(p.id)])), [list]);
  const shown = (list ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  const duplicate = (p: ProjectMeta) => {
    const r = loadProject(browserStorage(), p.id);
    if (r.ok) saveProject(browserStorage(), newProjectId(), { ...r.value.model, name: `${r.value.model.name} (copy)` }, r.value.notes ?? []);
    refresh();
  };

  return (
    <>
      <section aria-labelledby="new-heading" className="border-b border-rule">
        <h2 id="new-heading" className="label border-b border-rule px-5 py-3 text-ink-3 md:px-8">
          New project
        </h2>
        <ul className="grid grid-cols-2 lg:grid-cols-4">
          {NEW.map((n, i) => (
            <li key={n.label} className={`border-rule ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b lg:border-b-0" : ""} lg:border-r lg:last:border-r-0`}>
              <Link href={n.href} className="group flex h-full flex-col gap-3 p-5 hover:bg-paper-2 md:p-6">
                <n.icon size={20} strokeWidth={1.4} className="group-hover:text-marker" aria-hidden="true" />
                <span className="font-semibold">{n.label}</span>
                <span className="text-sm text-ink-2">{n.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="list-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule px-5 py-3 md:px-8">
          <h2 id="list-heading" className="label text-ink-3">
            In this browser · {list?.length ?? 0}
          </h2>
          <label className="flex items-center gap-2 border border-rule px-3 py-1.5 focus-within:border-ink">
            <Search size={14} className="text-ink-3" aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-40 bg-transparent text-sm outline-none" />
          </label>
        </div>
        {list === null ? (
          <p className="p-8 text-ink-3">Loading…</p>
        ) : list.length === 0 ? (
          <div className="grid place-items-center gap-4 p-16 text-center">
            <p className="text-2xl font-semibold tracking-tight">No projects yet.</p>
            <p className="max-w-sm text-ink-2">Start one above. It saves itself in this browser as you work.</p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => (
              <li key={p.id} className="group relative border-b border-r border-rule">
                <Link href={`/studio/try?project=${encodeURIComponent(p.id)}`} className="block hover:bg-paper-2">
                  <div className="grid aspect-[4/3] place-items-center overflow-hidden border-b border-rule-soft bg-white p-3">
                    {thumbs.get(p.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs.get(p.id)!} alt="" className="max-h-full max-w-full" />
                    ) : (
                      <span className="label text-ink-3">Empty plan</span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="label mt-1 text-ink-3">
                      {p.rooms} rooms · {p.area} m² · {when(p.updatedAt)}
                    </p>
                  </div>
                </Link>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  {confirm === p.id ? (
                    <>
                      <button type="button" onClick={() => (deleteProject(browserStorage(), p.id), setConfirm(null), refresh())} className="label bg-marker px-2 py-1 text-paper">
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirm(null)} className="label border border-rule bg-paper px-2 py-1">
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => duplicate(p)} className="border border-rule bg-paper p-1.5 hover:border-ink" aria-label={`Duplicate ${p.name}`}>
                        <Copy size={14} />
                      </button>
                      <button type="button" onClick={() => setConfirm(p.id)} className="border border-rule bg-paper p-1.5 hover:border-marker hover:text-marker" aria-label={`Delete ${p.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
