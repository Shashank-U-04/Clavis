"use client";

/**
 * One plan: its drawing, its numbers and rooms, its versions (preview, restore, or start a
 * new plan from one) and everything that happened to it.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Bookmark, Copy, Download, Eye, GitBranch, RotateCcw, Star, Trash2 } from "lucide-react";
import { browserStorage } from "@/model/persistence";
import { loadProject } from "@/model/library";
import { analyzeModel } from "@/model/analysis";
import { planToSvg } from "@/export/planSvg";
import type { PlanModel } from "@/model/types";
import { deletePlan, duplicatePlan, getPlan, listEvents, listVersions, loadVersion, restoreVersion, sourceText, starPlan, versionAsCopy } from "@/lib/workspace/browser";
import { mutate, useWorkspace } from "@/lib/workspace/useWorkspace";
import { EventRow } from "./EventRow";
import { PlanThumb, download, planHref, studioHref } from "./PlanCard";
import { Band, SheetHeader, SourceTag, ago, sourceLabel } from "./ui";

const svgUrl = (m: PlanModel) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(planToSvg(m))}`;

export function PlanDetail({ id }: { id: string }) {
  const router = useRouter();
  const ws = useWorkspace((s) => {
    const plan = getPlan(s, id);
    const doc = plan ? loadProject(s, id) : null;
    return { plan, model: doc?.ok ? doc.value.model : null, versions: listVersions(s, id), events: listEvents(s, { planId: id }) };
  }, id);
  const [preview, setPreview] = useState<{ id: string; label: string; src: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const facts = useMemo(() => {
    if (!ws?.model) return null;
    const a = analyzeModel(ws.model);
    const m = ws.model;
    return {
      rooms: a.rooms.map((r) => ({ id: r.id, label: r.label, area: r.area, windows: r.windows.length, doors: r.doors.length })),
      doors: m.openings.filter((o) => o.kind === "door").length,
      windows: m.openings.filter((o) => o.kind === "window").length,
      walls: m.walls.length,
      items: m.items.length,
      carpet: Math.round(a.metrics.carpetArea * 10) / 10,
      env: a.metrics.envelope,
    };
  }, [ws?.model]);

  if (!ws) return <SheetHeader sheet="B.1 · Plan" title="Loading…" />;
  const { plan, versions, events } = ws;

  if (!plan)
    return (
      <>
        <SheetHeader sheet="B.1 · Plan" title="Not in this browser" intro="This plan was deleted, or it was made in another browser. Plans are kept where they were made until accounts are switched on." />
        <div className="px-5 py-8 md:px-8">
          <Link href="/plans" className="label inline-flex items-center gap-3 border border-ink px-4 py-3 hover:bg-ink hover:text-paper">
            <ArrowLeft size={14} aria-hidden="true" /> All plans
          </Link>
        </div>
      </>
    );

  const live = new Set([plan.id]);
  const showVersion = (vid: string, label: string) => {
    const r = loadVersion(browserStorage(), plan.id, vid);
    if (r.ok) setPreview({ id: vid, label, src: svgUrl(r.value.model) });
    else setMsg(r.message);
  };

  return (
    <>
      <SheetHeader sheet="B.1 · Plan" title={plan.name} intro={`${plan.rooms} rooms · ${plan.area} m² · edited ${ago(plan.updatedAt)}${!plan.source ? "" : plan.source.startsWith("template:") ? ` · started from the ${sourceLabel(plan.source)} template` : ` · started from ${sourceText(plan.source)}`}`}>
        <button
          type="button"
          onClick={() => mutate((s) => starPlan(s, plan.id, !plan.starred))}
          aria-pressed={!!plan.starred}
          className={`label flex items-center gap-2 border px-3 py-3 ${plan.starred ? "border-marker text-marker" : "border-rule text-ink-2 hover:border-ink hover:text-ink"}`}
        >
          <Star size={14} fill={plan.starred ? "currentColor" : "none"} aria-hidden="true" /> {plan.starred ? "Starred" : "Star"}
        </button>
        <Link href={studioHref(plan.id)} className="label flex items-center gap-6 bg-marker px-4 py-3 text-paper hover:bg-ink">
          Open in studio <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </SheetHeader>

      {msg && (
        <p role="status" className="border-b border-rule bg-paper-2 px-5 py-3 text-sm md:px-8">
          {msg}
        </p>
      )}

      {/* ---------------------------------------------------------------- drawing + facts */}
      <div className="grid border-b border-rule xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <figure className="relative border-b border-rule xl:border-b-0 xl:border-r">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.src} alt={`The plan as it was in “${preview.label}”`} className="grid-paper aspect-[16/10] w-full bg-paper object-contain p-4" />
          ) : (
            <PlanThumb id={plan.id} stamp={plan.updatedAt} className="grid-paper aspect-[16/10] bg-paper" />
          )}
          <figcaption className="label absolute bottom-3 left-3 flex items-center gap-3 bg-paper/90 px-2 py-1 text-ink-3">
            {preview ? (
              <>
                <span className="text-marker">Version · {preview.label}</span>
                <button type="button" onClick={() => setPreview(null)} className="underline underline-offset-4 hover:text-ink">
                  Back to now
                </button>
              </>
            ) : (
              <span>Fig. 01 · As saved {ago(plan.updatedAt)}</span>
            )}
          </figcaption>
        </figure>

        <div>
          <Band title="Facts" />
          <dl className="grid grid-cols-2 gap-px bg-rule-soft text-sm">
            {[
              ["Floor area", facts ? `${facts.carpet} m²` : "—"],
              ["Outer size", facts?.env ? `${facts.env.w.toFixed(1)} × ${facts.env.h.toFixed(1)} m` : "—"],
              ["Walls", facts?.walls ?? "—"],
              ["Doors · windows", facts ? `${facts.doors} · ${facts.windows}` : "—"],
              ["Furniture", facts?.items ?? "—"],
              ["Source", plan.source ? <SourceTag key="s" source={plan.source} /> : "—"],
              ["Created", plan.createdAt ? new Date(plan.createdAt).toLocaleDateString() : "—"],
              ["Last opened", plan.openedAt ? ago(plan.openedAt) : "Not yet"],
            ].map(([k, v]) => (
              <div key={String(k)} className="bg-paper px-5 py-3 md:px-6">
                <dt className="label text-ink-3">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-rule px-5 py-4 md:px-6">
            <button
              type="button"
              onClick={() => {
                const r = mutate((s) => duplicatePlan(s, plan.id));
                if (r.ok) router.push(planHref(r.value.id));
              }}
              className="label flex items-center gap-2 border border-rule px-3 py-2 hover:border-ink"
            >
              <Copy size={13} aria-hidden="true" /> Duplicate
            </button>
            <button type="button" onClick={() => download(plan.id)} className="label flex items-center gap-2 border border-rule px-3 py-2 hover:border-ink">
              <Download size={13} aria-hidden="true" /> Download file
            </button>
            {confirm === "delete" ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="label bg-marker px-3 py-2 text-paper"
                  onClick={() => {
                    mutate((s) => deletePlan(s, plan.id));
                    router.push("/plans");
                  }}
                >
                  Delete plan and versions
                </button>
                <button type="button" className="label border border-rule px-3 py-2" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirm("delete")} className="label flex items-center gap-2 border border-rule px-3 py-2 text-ink-2 hover:border-marker hover:text-marker">
                <Trash2 size={13} aria-hidden="true" /> Delete…
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- rooms */}
      {facts && facts.rooms.length > 0 && (
        <section aria-labelledby="rooms-heading" className="border-b border-rule">
          <Band title={`Rooms · ${facts.rooms.length}`} id="rooms-heading" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="label border-b border-rule-soft text-left text-ink-3">
                  <th className="px-5 py-2.5 font-normal md:px-8">Room</th>
                  <th className="px-3 py-2.5 text-right font-normal">Area</th>
                  <th className="px-3 py-2.5 text-right font-normal">Doors</th>
                  <th className="px-5 py-2.5 text-right font-normal md:px-8">Windows</th>
                </tr>
              </thead>
              <tbody>
                {facts.rooms.map((r) => (
                  <tr key={r.id} className="border-b border-rule-soft last:border-b-0">
                    <td className="px-5 py-2.5 font-medium md:px-8">{r.label}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.area.toFixed(1)} m²</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.doors}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums md:px-8">{r.windows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- versions + history */}
      <div className="grid xl:grid-cols-2">
        <section aria-labelledby="versions-heading" className="border-b border-rule xl:border-r">
          <Band title={`Versions · ${versions.length}`} id="versions-heading">
            <span className="label flex items-center gap-2 text-ink-3">
              <Bookmark size={12} aria-hidden="true" /> Save one from the studio
            </span>
          </Band>
          {versions.length === 0 ? (
            <p className="px-5 py-10 text-ink-3 md:px-8">
              No versions yet. Use <b className="font-semibold text-ink-2">Save version</b> in the studio to keep a stage of the design; checkpoints are also taken every 15 minutes while you edit.
            </p>
          ) : (
            <ul>
              {versions.map((v) => (
                <li key={v.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-rule-soft px-5 py-3 last:border-b-0 md:px-8 ${preview?.id === v.id ? "bg-paper-2" : ""}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-medium">{v.label}</span>
                      {v.auto && <span className="label shrink-0 border border-rule px-1.5 py-0.5 text-[0.58rem] text-ink-3">Checkpoint</span>}
                    </p>
                    <p className="label mt-1 text-ink-3">
                      {ago(v.at)} · {v.rooms} rooms · {v.area} m²
                    </p>
                  </div>
                  {confirm === v.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="label bg-marker px-2.5 py-1.5 text-paper"
                        onClick={() => {
                          const r = mutate((s) => restoreVersion(s, plan.id, v.id));
                          setConfirm(null);
                          setPreview(null);
                          setMsg(r.ok ? `Restored “${v.label}”. What was there before is kept as a checkpoint.` : r.message);
                        }}
                      >
                        Restore
                      </button>
                      <button type="button" className="label border border-rule px-2.5 py-1.5" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <button type="button" onClick={() => showVersion(v.id, v.label)} className="grid h-8 w-8 place-items-center border border-rule hover:border-ink" aria-label={`Preview ${v.label}`} title="Preview">
                        <Eye size={14} />
                      </button>
                      <button type="button" onClick={() => setConfirm(v.id)} className="grid h-8 w-8 place-items-center border border-rule hover:border-ink" aria-label={`Restore ${v.label}`} title="Restore">
                        <RotateCcw size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const r = mutate((s) => versionAsCopy(s, plan.id, v.id));
                          if (r.ok) router.push(planHref(r.value.id));
                          else setMsg(r.message);
                        }}
                        className="grid h-8 w-8 place-items-center border border-rule hover:border-ink"
                        aria-label={`Start a new plan from ${v.label}`}
                        title="New plan from this version"
                      >
                        <GitBranch size={14} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="plan-history-heading" className="border-b border-rule">
          <Band title={`History · ${events.length}`} id="plan-history-heading" />
          {events.length === 0 ? (
            <p className="px-5 py-10 text-ink-3 md:px-8">Nothing recorded for this plan yet.</p>
          ) : (
            <ul>
              {events.slice(0, 40).map((e) => (
                <EventRow key={e.id} e={e} live={live} showPlan={false} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
