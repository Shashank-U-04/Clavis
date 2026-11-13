"use client";

/**
 * Every plan: search (also reached from the top bar as /plans?q=…), sort, filter by star or
 * by how the plan began, and a grid or a list. The view is remembered in this browser.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { listPlans } from "@/lib/workspace/browser";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import type { Plan } from "@/lib/workspace/types";
import { PlanCard } from "./PlanCard";
import { Band } from "./ui";

const SORTS = {
  edited: { label: "Last edited", by: (a: Plan, b: Plan) => b.updatedAt - a.updatedAt },
  opened: { label: "Last opened", by: (a: Plan, b: Plan) => (b.openedAt ?? 0) - (a.openedAt ?? 0) },
  created: { label: "Newest first", by: (a: Plan, b: Plan) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt) },
  name: { label: "Name", by: (a: Plan, b: Plan) => a.name.localeCompare(b.name) },
  area: { label: "Largest first", by: (a: Plan, b: Plan) => b.area - a.area },
} as const;
type SortKey = keyof typeof SORTS;

const FILTERS = {
  all: { label: "All", test: () => true },
  starred: { label: "Starred", test: (p: Plan) => !!p.starred },
  template: { label: "From templates", test: (p: Plan) => !!p.source?.startsWith("template:") },
  describe: { label: "Described", test: (p: Plan) => p.source === "describe" },
  blank: { label: "Drawn from blank", test: (p: Plan) => p.source === "blank" },
  other: { label: "Imported and copies", test: (p: Plan) => p.source === "import" || p.source === "duplicate" || p.source === "restore" },
} as const;
type FilterKey = keyof typeof FILTERS;

const VIEW_KEY = "clavis:plans-view";

export function PlansBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const plans = useWorkspace((s) => listPlans(s));
  const [q, setQ] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>("edited");
  const [filter, setFilter] = useState<FilterKey>((params.get("filter") as FilterKey) in FILTERS ? (params.get("filter") as FilterKey) : "all");
  const [view, setView] = useState<"grid" | "list">("grid");

  // a search from the top bar arrives in the URL; typing here writes the URL, so keep what is typed
  useEffect(() => {
    const fromUrl = params.get("q") ?? "";
    setQ((cur) => (cur.trim() === fromUrl ? cur : fromUrl));
  }, [params]);
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "list" || v === "grid") setView(v);
    } catch {
      /* the default view, then */
    }
  }, []);
  const pickView = (v: "grid" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered */
    }
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (plans ?? []).filter((p) => FILTERS[filter].test(p) && (!needle || p.name.toLowerCase().includes(needle))).sort(SORTS[sort].by);
  }, [plans, q, filter, sort]);

  const counts = useMemo(() => Object.fromEntries(Object.entries(FILTERS).map(([k, f]) => [k, (plans ?? []).filter(f.test).length])) as Record<FilterKey, number>, [plans]);

  if (plans === null) return <p className="p-8 text-ink-3">Loading…</p>;

  if (plans.length === 0)
    return (
      <div className="grid place-items-center gap-4 px-5 py-24 text-center">
        <p className="text-2xl font-semibold tracking-tight">No plans yet.</p>
        <p className="max-w-sm text-ink-2">Describe a home, start from a template or draw one from a blank sheet. It saves itself in this browser as you work.</p>
        <Link href="/new" className="label mt-2 flex items-center gap-3 bg-ink px-5 py-3 text-paper hover:bg-marker">
          New plan <Plus size={14} aria-hidden="true" />
        </Link>
      </div>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-3 md:px-8">
        <label className="flex min-w-48 flex-1 items-center gap-2 border border-rule px-3 py-1.5 focus-within:border-ink sm:max-w-xs">
          <Search size={14} className="text-ink-3" aria-hidden="true" />
          <span className="sr-only">Filter plans by name</span>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              router.replace(e.target.value.trim() ? `/plans?q=${encodeURIComponent(e.target.value.trim())}` : "/plans", { scroll: false });
            }}
            placeholder="Filter by name"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </label>
        <label className="label flex items-center gap-2 text-ink-3">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="border border-rule bg-paper px-2 py-1.5 font-sans text-sm normal-case tracking-normal text-ink">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <div className="flex border border-rule" role="group" aria-label="View">
          {(["grid", "list"] as const).map((v) => (
            <button key={v} type="button" onClick={() => pickView(v)} aria-pressed={view === v} aria-label={v === "grid" ? "Grid" : "List"} className={`grid h-8 w-9 place-items-center ${view === v ? "bg-ink text-paper" : "text-ink-3 hover:text-ink"} ${v === "list" ? "border-l border-rule" : ""}`}>
              {v === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-0 overflow-x-auto border-b border-rule" role="tablist" aria-label="Show">
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            disabled={k !== "all" && counts[k] === 0}
            className={`label shrink-0 border-r border-rule px-4 py-3 disabled:opacity-35 md:px-5 ${filter === k ? "bg-paper-2 text-ink shadow-[inset_0_-2px_0_var(--color-marker)]" : "text-ink-3 hover:text-ink"}`}
          >
            {FILTERS[k].label} <span className="ml-1 tabular-nums opacity-60">{counts[k]}</span>
          </button>
        ))}
      </div>

      <Band title={`${shown.length} of ${plans.length} ${plans.length === 1 ? "plan" : "plans"}${q.trim() ? ` matching “${q.trim()}”` : ""}`} />

      {shown.length === 0 ? (
        <div className="grid place-items-center gap-3 px-5 py-20 text-center">
          <p className="text-xl font-semibold tracking-tight">Nothing matches.</p>
          <button type="button" className="label text-marker underline underline-offset-4" onClick={() => (setFilter("all"), setQ(""), router.replace("/plans"))}>
            Show every plan
          </button>
        </div>
      ) : view === "grid" ? (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      ) : (
        <ul>
          {shown.map((p) => (
            <PlanCard key={p.id} plan={p} view="list" />
          ))}
        </ul>
      )}
    </>
  );
}
