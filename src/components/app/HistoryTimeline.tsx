"use client";

/**
 * Everything you did, across every plan, newest first and grouped by day. Filter by kind of
 * event or by plan name; clear it if you want a fresh start (the plans are not touched).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ACTIVITY_KEY, listEvents, listPlans } from "@/lib/workspace/browser";
import { mutate, useWorkspace } from "@/lib/workspace/useWorkspace";
import type { ActivityEvent, ActivityKind } from "@/lib/workspace/types";
import { EventRow } from "./EventRow";
import { dayLabel } from "./ui";

const KINDS: Record<string, { label: string; kinds: ActivityKind[] | null }> = {
  all: { label: "Everything", kinds: null },
  created: { label: "New plans", kinds: ["created", "imported", "duplicated"] },
  edited: { label: "Edits", kinds: ["edited", "renamed"] },
  versions: { label: "Versions", kinds: ["version_saved", "restored"] },
  opened: { label: "Opened", kinds: ["opened", "exported", "starred"] },
  deleted: { label: "Deleted", kinds: ["deleted"] },
};

const PAGE = 60;

export function HistoryTimeline() {
  const ws = useWorkspace((s) => ({ events: listEvents(s), live: new Set(listPlans(s).map((p) => p.id)) }));
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState(false);

  const shown = useMemo(() => {
    const k = KINDS[kind].kinds;
    const needle = q.trim().toLowerCase();
    return (ws?.events ?? []).filter((e) => (!k || k.includes(e.kind)) && (!needle || e.planName.toLowerCase().includes(needle)));
  }, [ws, kind, q]);

  const days = useMemo(() => {
    const out: { day: string; events: ActivityEvent[] }[] = [];
    for (const e of shown.slice(0, limit)) {
      const d = dayLabel(e.at);
      if (out.at(-1)?.day === d) out.at(-1)!.events.push(e);
      else out.push({ day: d, events: [e] });
    }
    return out;
  }, [shown, limit]);

  if (!ws) return <p className="p-8 text-ink-3">Loading…</p>;

  if (ws.events.length === 0)
    return (
      <div className="grid place-items-center gap-4 px-5 py-24 text-center">
        <p className="text-2xl font-semibold tracking-tight">No history yet.</p>
        <p className="max-w-sm text-ink-2">New plans, edits, saved versions, renames and downloads are all recorded here as you work.</p>
        <Link href="/new" className="label mt-2 bg-ink px-5 py-3 text-paper hover:bg-marker">
          Start a plan
        </Link>
      </div>
    );

  return (
    <>
      <div className="flex flex-wrap items-stretch border-b border-rule">
        <div className="flex overflow-x-auto" role="group" aria-label="Show">
          {Object.entries(KINDS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => (setKind(k), setLimit(PAGE))}
              className={`label shrink-0 border-r border-rule px-4 py-3 md:px-5 ${kind === k ? "bg-paper-2 text-ink shadow-[inset_0_-2px_0_var(--color-marker)]" : "text-ink-3 hover:text-ink"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <label className="flex min-w-48 flex-1 items-center gap-2 border-t border-rule px-5 py-2 sm:border-t-0 md:px-6">
          <Search size={14} className="text-ink-3" aria-hidden="true" />
          <span className="sr-only">Filter by plan name</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by plan" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3" />
        </label>
      </div>

      {days.length === 0 ? (
        <p className="px-5 py-16 text-center text-ink-3">Nothing matches.</p>
      ) : (
        days.map((d) => (
          <section key={d.day} aria-label={d.day} className="grid border-b border-rule md:grid-cols-[13rem_minmax(0,1fr)]">
            <h2 className="label border-b border-rule-soft px-5 py-3 text-ink-3 md:sticky md:top-14 md:self-start md:border-b-0 md:px-8 md:py-4">
              {d.day} <span className="ml-1 opacity-60">{d.events.length}</span>
            </h2>
            <ul className="md:border-l md:border-rule">
              {d.events.map((e) => (
                <EventRow key={e.id} e={e} live={ws.live} time="clock" />
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6 md:px-8">
        {shown.length > limit ? (
          <button type="button" onClick={() => setLimit(limit + PAGE)} className="label border border-ink px-4 py-2.5 hover:bg-ink hover:text-paper">
            Show {Math.min(PAGE, shown.length - limit)} more
          </button>
        ) : (
          <p className="label text-ink-3">
            {shown.length} {shown.length === 1 ? "event" : "events"} · the newest 300 are kept
          </p>
        )}
        {confirm ? (
          <span className="flex items-center gap-2">
            <span className="text-sm">Clear the history? Your plans stay.</span>
            <button
              type="button"
              className="label bg-marker px-3 py-2 text-paper"
              onClick={() => {
                mutate((s) => {
                  try {
                    s?.removeItem(ACTIVITY_KEY);
                  } catch {
                    /* nothing to clear */
                  }
                });
                setConfirm(false);
              }}
            >
              Clear
            </button>
            <button type="button" className="label border border-rule px-3 py-2" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="label text-ink-3 hover:text-marker">
            Clear history…
          </button>
        )}
      </div>
    </>
  );
}
