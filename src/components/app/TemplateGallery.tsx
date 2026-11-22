"use client";

/**
 * The template library: every card shows the real plan and its measured numbers. Filter by
 * size or by who made it; use a template straight away, or name the plan first.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { makerText } from "@/lib/catalogue";
import type { TemplateCardData } from "./templateData";

const SIZES = {
  all: { label: "Any size", test: () => true },
  small: { label: "Studio & 1 bed", test: (t: TemplateCardData) => t.facts.bedrooms <= 1 },
  mid: { label: "2–3 bedrooms", test: (t: TemplateCardData) => t.facts.bedrooms >= 2 && t.facts.bedrooms <= 3 },
  large: { label: "4+ bedrooms", test: (t: TemplateCardData) => t.facts.bedrooms >= 4 },
} as const;
const MAKERS = {
  all: "Everyone",
  hand: "Drawn by hand",
  "clavis-local": "Clavis Local",
} as const;

export const templateHref = (slug: string) => `/studio/try?template=${encodeURIComponent(slug)}`;
export const nameFirstHref = (slug: string) => `/new?start=template&t=${encodeURIComponent(slug)}`;

export function TemplateCard({ t, compact = false }: { t: TemplateCardData; compact?: boolean }) {
  const f = t.facts;
  return (
    <li className="flex flex-col border-b border-r border-rule">
      <Link href={templateHref(t.slug)} className="group relative block border-b border-rule-soft bg-paper" aria-label={`Use the ${t.name} template`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.thumb} alt="" className={`w-full object-contain p-3 ${compact ? "aspect-[4/3]" : "aspect-[4/3]"}`} />
        {t.featured && <span className="label absolute left-3 top-3 bg-marker px-2 py-1 text-[0.62rem] text-paper">Showcase</span>}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
        <div>
          <p className={`label text-[0.62rem] ${t.maker === "hand" ? "text-ink-3" : "text-marker"}`}>{makerText(t.maker)}</p>
          <h3 className="mt-1.5 text-lg font-semibold tracking-tight">{t.name}</h3>
        </div>
        {!compact && <p className="text-sm text-ink-2">{t.blurb}</p>}
        <dl className="label grid grid-cols-3 gap-px border border-rule-soft bg-rule-soft text-[0.62rem]">
          {[
            [`${f.area} m²`, "floor"],
            [f.bedrooms === 0 ? "Studio" : `${f.bedrooms} bed`, `${f.bathrooms} bath`],
            [`${f.width}×${f.depth}`, "metres"],
          ].map(([a, b]) => (
            <div key={b} className="bg-paper px-2 py-1.5">
              <dt className="sr-only">{b}</dt>
              <dd className="text-ink">{a}</dd>
              <dd className="text-ink-3">{b}</dd>
            </div>
          ))}
        </dl>
        {!compact && t.brief && <p className="font-mono text-[0.7rem] text-ink-3">Brief: “{t.brief}”</p>}
        <div className="mt-auto flex gap-2 pt-1">
          <Link href={templateHref(t.slug)} className="label flex flex-1 items-center justify-between gap-2 bg-ink px-3 py-2.5 text-paper hover:bg-marker">
            Use template <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
          {!compact && (
            <Link href={nameFirstHref(t.slug)} className="label border border-rule px-3 py-2.5 text-ink-2 hover:border-ink hover:text-ink">
              Name it first
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function TemplateStrip({ cards }: { cards: TemplateCardData[] }) {
  return (
    <ul className="grid sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((t) => (
        <TemplateCard key={t.slug} t={t} compact />
      ))}
    </ul>
  );
}

export function TemplateGallery({ cards }: { cards: TemplateCardData[] }) {
  const [size, setSize] = useState<keyof typeof SIZES>("all");
  const [maker, setMaker] = useState<keyof typeof MAKERS>("all");
  const shown = useMemo(() => cards.filter((t) => SIZES[size].test(t) && (maker === "all" || t.maker === maker)), [cards, size, maker]);
  const tab = (on: boolean) => `label shrink-0 border-r border-rule px-4 py-3 md:px-5 ${on ? "bg-paper-2 text-ink shadow-[inset_0_-2px_0_var(--color-marker)]" : "text-ink-3 hover:text-ink"}`;
  return (
    <>
      <div className="flex flex-wrap border-b border-rule">
        <div className="flex overflow-x-auto" role="group" aria-label="Size">
          {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => (
            <button key={k} type="button" aria-pressed={size === k} onClick={() => setSize(k)} className={tab(size === k)}>
              {SIZES[k].label}
            </button>
          ))}
        </div>
        <div className="flex overflow-x-auto border-t border-rule sm:ml-auto sm:border-l sm:border-t-0" role="group" aria-label="Made by">
          {(Object.keys(MAKERS) as (keyof typeof MAKERS)[]).map((k) => (
            <button key={k} type="button" aria-pressed={maker === k} onClick={() => setMaker(k)} className={tab(maker === k)}>
              {MAKERS[k]}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-16 text-center text-ink-3">No template fits both filters.</p>
      ) : (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <TemplateCard key={t.slug} t={t} />
          ))}
          <li className="border-b border-r border-rule">
            <Link href="/new?start=describe" className="grid-paper group flex h-full min-h-72 flex-col justify-between gap-6 p-5 hover:bg-paper-2 md:p-8">
              <Sparkles size={22} strokeWidth={1.4} className="group-hover:text-marker" aria-hidden="true" />
              <span>
                <span className="block text-2xl font-semibold tracking-tight">None of these?</span>
                <span className="mt-2 block max-w-xs text-ink-2">Describe the home you want in a sentence, and Clavis lays it out and checks it.</span>
              </span>
              <span className="label flex items-center gap-2 text-marker">
                Describe your own <ArrowRight size={13} aria-hidden="true" />
              </span>
            </Link>
          </li>
        </ul>
      )}
    </>
  );
}
