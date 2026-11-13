"use client";

/**
 * New plan, in two steps: how to start (describe, template, blank, import), then the details
 * that start needs. Every way ends in the studio with a named plan whose source is recorded.
 * ?start=describe|template|blank|import and ?t=<template slug> preselect, for links from Home
 * and the template gallery.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, FilePlus2, FileUp, LayoutTemplate, Sparkles, Upload } from "lucide-react";
import { readDesignFile } from "@/model/persistence";
import { createPlan } from "@/lib/workspace/browser";
import { mutate } from "@/lib/workspace/useWorkspace";
import { makerText } from "@/lib/catalogue";
import type { TemplateCardData } from "./templateData";
import { studioHref } from "./PlanCard";

type Start = "describe" | "template" | "blank" | "import";

const STARTS: { key: Start; icon: typeof Sparkles; label: string; text: string }[] = [
  { key: "describe", icon: Sparkles, label: "Describe it", text: "Write the brief in a sentence. The assistant lays out a furnished plan and checks it." },
  { key: "template", icon: LayoutTemplate, label: "Start from a template", text: "Pick one of seven homes and change it from there." },
  { key: "blank", icon: FilePlus2, label: "Blank sheet", text: "Draw walls, rooms, doors and windows yourself, or trace a scanned plan." },
  { key: "import", icon: FileUp, label: "Import a file", text: "Open a .clavis.json design exported from Clavis." },
];

const IDEAS = [
  "A two-bedroom flat with an open kitchen, about 70 m²",
  "Three-bedroom family house with two bathrooms and a study",
  "A studio apartment, 40 m²",
  "4 bedroom home with a separate kitchen and a laundry, 150 m²",
];

const input = "w-full border border-rule bg-paper px-3 py-2.5 outline-none placeholder:text-ink-3 focus:border-ink";

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="grid border-b border-rule md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex items-center gap-3 border-b border-rule px-5 py-4 md:block md:border-b-0 md:border-r md:px-8 md:py-8">
        <span className={`grid h-8 w-8 place-items-center border font-mono text-sm ${done ? "border-ink bg-ink text-paper" : "border-ink"}`}>{done ? <Check size={14} /> : n}</span>
        <h2 className="font-semibold md:mt-4">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function NewPlanFlow({ templates }: { templates: TemplateCardData[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("start") as Start | null;
  const [start, setStart] = useState<Start | null>(STARTS.some((s) => s.key === initial) ? initial : null);
  const [slug, setSlug] = useState(templates.some((t) => t.slug === params.get("t")) ? params.get("t")! : templates[0]?.slug);
  const [brief, setBrief] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const details = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const tpl = templates.find((t) => t.slug === slug);

  useEffect(() => setErr(null), [start]);
  const pick = (s: Start) => {
    setStart(s);
    requestAnimationFrame(() => details.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const go = (href: string) => {
    setBusy(true);
    router.push(href);
  };

  const create = () => {
    if (start === "describe") {
      if (!brief.trim()) return setErr("Describe the home first: the rooms you need, and roughly how big.");
      return go(`/studio/try?brief=${encodeURIComponent(brief.trim().slice(0, 300))}`);
    }
    const n = name.trim() ? `&name=${encodeURIComponent(name.trim())}` : "";
    if (start === "template" && slug) return go(`/studio/try?template=${encodeURIComponent(slug)}${n}`);
    if (start === "blank") return go(`/studio/try?new=blank${n}`);
  };

  const importFile = async (f: File) => {
    setErr(null);
    setBusy(true);
    const r = await readDesignFile(f);
    if (!r.ok) {
      setBusy(false);
      return setErr(`Could not open ${f.name}: ${r.message}`);
    }
    const model = name.trim() ? { ...r.doc.model, name: name.trim().slice(0, 80) } : r.doc.model;
    const made = mutate((s) => createPlan(s, model, r.doc.notes ?? [], "import", Date.now(), `From ${f.name}`));
    if (!made.ok) {
      setBusy(false);
      return setErr(made.message);
    }
    router.push(studioHref(made.value.id));
  };

  return (
    <>
      <Step n={1} title="How to start" done={!!start}>
        <ul className="grid gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="How to start">
          {STARTS.map((s) => {
            const on = start === s.key;
            return (
              <li key={s.key} className="bg-paper">
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(s.key)}
                  className={`group flex h-full w-full flex-col gap-3 p-5 text-left transition-colors md:p-6 ${on ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
                >
                  <span className="flex items-center justify-between">
                    <s.icon size={20} strokeWidth={1.4} className={on ? "text-paper" : "group-hover:text-marker"} aria-hidden="true" />
                    <span className={`grid h-4 w-4 place-items-center rounded-full border ${on ? "border-paper" : "border-ink-3"}`}>{on && <span className="h-2 w-2 rounded-full bg-paper" />}</span>
                  </span>
                  <span className="font-semibold">{s.label}</span>
                  <span className={`text-sm ${on ? "text-paper/75" : "text-ink-2"}`}>{s.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Step>

      <div ref={details} className="scroll-mt-16">
        <Step n={2} title="The details">
          {!start ? (
            <p className="px-5 py-10 text-ink-3 md:px-8">Pick how to start, above.</p>
          ) : (
            <form
              className="grid gap-6 px-5 py-8 md:px-8"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              {start === "describe" && (
                <div className="grid gap-3">
                  <label htmlFor="brief" className="label text-ink-3">
                    The brief
                  </label>
                  <textarea id="brief" autoFocus rows={3} maxLength={300} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. a three-bedroom house with a study and an open kitchen, about 120 m²" className={`${input} resize-y text-lg`} />
                  <div className="flex flex-wrap gap-2">
                    {IDEAS.map((i) => (
                      <button key={i} type="button" onClick={() => setBrief(i)} className="border border-rule px-3 py-1.5 text-left text-sm text-ink-2 hover:border-ink hover:text-ink">
                        {i}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-ink-3">Clavis Local runs in your browser and handles briefs like these. The assistant names the plan; you can rename it in the studio.</p>
                </div>
              )}

              {start === "template" && (
                <fieldset className="grid gap-3">
                  <legend className="label mb-3 text-ink-3">Template</legend>
                  <ul className="grid border-l border-t border-rule sm:grid-cols-2 2xl:grid-cols-3">
                    {templates.map((t) => {
                      const on = t.slug === slug;
                      return (
                        <li key={t.slug} className="border-b border-r border-rule">
                          <label className={`flex h-full cursor-pointer items-center gap-3 p-3 ${on ? "bg-paper-2 shadow-[inset_3px_0_0_var(--color-marker)]" : "hover:bg-paper-2/60"}`}>
                            <input type="radio" name="template" value={t.slug} checked={on} onChange={() => setSlug(t.slug)} className="sr-only" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={t.thumb} alt="" className="aspect-[4/3] w-24 shrink-0 border border-rule-soft bg-white object-contain p-1" />
                            <span className="min-w-0">
                              <span className="block font-medium">{t.name}</span>
                              <span className="label mt-1 block text-[0.62rem] text-ink-3">
                                {t.facts.area} m² · {t.facts.bedrooms === 0 ? "studio" : `${t.facts.bedrooms} bed`} · {makerText(t.maker)}
                              </span>
                            </span>
                            {on && <Check size={16} className="ml-auto shrink-0 text-marker" aria-hidden="true" />}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {tpl && <p className="text-sm text-ink-2">{tpl.blurb}</p>}
                </fieldset>
              )}

              {start === "import" && (
                <div className="grid gap-3">
                  <span className="label text-ink-3">Design file</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => file.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f) void importFile(f);
                    }}
                    className="grid place-items-center gap-3 border border-dashed border-ink-3 px-6 py-12 text-center hover:border-ink hover:bg-paper-2"
                  >
                    <Upload size={22} strokeWidth={1.4} aria-hidden="true" />
                    <span className="font-medium">Choose a .clavis.json file, or drop it here</span>
                    <span className="text-sm text-ink-3">It is checked before it opens and stays in this browser.</span>
                  </button>
                  <input
                    ref={file}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}

              {start !== "describe" && (
                <div className="grid max-w-md gap-2">
                  <label htmlFor="plan-name" className="label text-ink-3">
                    Name <span className="normal-case tracking-normal text-ink-3/80">(optional)</span>
                  </label>
                  <input id="plan-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={start === "template" ? (tpl?.name ?? "") : start === "import" ? "The name in the file" : "Untitled home"} className={input} />
                </div>
              )}

              {err && (
                <p role="alert" className="border-l-2 border-marker bg-marker-soft/50 px-3 py-2 text-sm">
                  {err}
                </p>
              )}

              {start !== "import" && (
                <div>
                  <button type="submit" disabled={busy} className="label inline-flex items-center gap-6 bg-ink px-5 py-3.5 text-paper hover:bg-marker disabled:opacity-50">
                    {busy ? "Opening the studio…" : start === "describe" ? "Design it" : start === "template" ? "Create from this template" : "Create the plan"}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </form>
          )}
        </Step>
      </div>

      <Step n={3} title="Open in the studio">
        <p className="px-5 py-8 text-ink-2 md:px-8">
          The plan opens in the studio and saves itself as you work. It appears in <b className="font-semibold text-ink">Plans</b> and on <b className="font-semibold text-ink">Home</b>, and what you do is kept in its <b className="font-semibold text-ink">History</b>. Use <b className="font-semibold text-ink">Save version</b> in the studio to keep a stage you may want to come back to.
        </p>
      </Step>
    </>
  );
}
