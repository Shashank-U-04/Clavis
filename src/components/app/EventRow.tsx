"use client";

import Link from "next/link";
import { Bookmark, Copy, Download, FilePlus2, FileUp, FolderOpen, Pencil, PenLine, RotateCcw, Star, Trash2, type LucideIcon } from "lucide-react";
import type { ActivityEvent, ActivityKind } from "@/lib/workspace/types";
import { planHref } from "./PlanCard";
import { ago, clock } from "./ui";

export const EVENT: Record<ActivityKind, { verb: string; icon: LucideIcon; label: string }> = {
  created: { verb: "Created", icon: FilePlus2, label: "Created" },
  opened: { verb: "Opened", icon: FolderOpen, label: "Opened" },
  edited: { verb: "Edited", icon: PenLine, label: "Edited" },
  renamed: { verb: "Renamed to", icon: Pencil, label: "Renamed" },
  duplicated: { verb: "Duplicated as", icon: Copy, label: "Duplicated" },
  imported: { verb: "Imported", icon: FileUp, label: "Imported" },
  version_saved: { verb: "Saved a version of", icon: Bookmark, label: "Versions" },
  restored: { verb: "Restored a version of", icon: RotateCcw, label: "Restored" },
  starred: { verb: "Starred", icon: Star, label: "Starred" },
  deleted: { verb: "Deleted", icon: Trash2, label: "Deleted" },
  exported: { verb: "Downloaded", icon: Download, label: "Downloaded" },
};

/** One line of history. `live` holds the ids of plans that still exist, so only they link. */
export function EventRow({ e, live, time = "ago", showPlan = true }: { e: ActivityEvent; live: Set<string>; time?: "ago" | "clock"; showPlan?: boolean }) {
  const m = EVENT[e.kind] ?? EVENT.edited;
  const name = live.has(e.planId) && e.kind !== "deleted" ? (
    <Link href={planHref(e.planId)} className="font-medium text-ink underline decoration-rule underline-offset-4 hover:text-marker hover:decoration-marker">
      {e.planName}
    </Link>
  ) : (
    <span className={`font-medium ${e.kind === "deleted" ? "line-through decoration-ink-3" : ""}`}>{e.planName}</span>
  );
  const detail = [e.detail, e.kind === "edited" && e.count && e.count > 1 ? `${e.count} saves` : null].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 border-b border-rule-soft px-5 py-3 last:border-b-0 md:px-8">
      <span className={`mt-0.5 grid h-7 w-7 place-items-center border ${e.kind === "deleted" ? "border-rule text-ink-3" : e.kind === "version_saved" || e.kind === "restored" ? "border-marker/50 text-marker" : "border-rule text-ink-2"}`}>
        <m.icon size={13} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <div className="min-w-0 text-[0.95rem] leading-snug text-ink-2">
        {showPlan ? (
          <>
            {m.verb} {name}
          </>
        ) : (
          <span className="text-ink">{m.label}</span>
        )}
        {detail && <p className="mt-0.5 truncate text-sm text-ink-3">{detail}</p>}
      </div>
      <time dateTime={new Date(e.at).toISOString()} className="label whitespace-nowrap pt-1 text-ink-3" title={new Date(e.at).toLocaleString()}>
        {time === "clock" ? clock(e.at) : ago(e.at)}
      </time>
    </li>
  );
}
