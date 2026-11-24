"use client";

/**
 * Home: where the app opens. Continue the plan you had open, start a new one four ways, see
 * your recent plans and what you did lately. The template strip is drawn on the server and
 * passed in.
 */

import Link from "next/link";
import { GuestImportBanner } from "@/components/account/GuestImportBanner";
import { useAccount } from "@/lib/account/bridge";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Bookmark, FilePlus2, FileUp, LayoutTemplate, Plus, Sparkles } from "lucide-react";
import { getProfile, lastPlan, listEvents, listPlans, listVersions } from "@/lib/workspace/browser";
import { useWorkspace } from "@/lib/workspace/useWorkspace";
import { EventRow } from "./EventRow";
import { PlanThumb, planHref, studioHref } from "./PlanCard";
import { Band, SheetHeader, SourceTag, ago } from "./ui";

const STARTS = [
  { href: "/new?start=describe", icon: Sparkles, label: "Describe a home", text: "One sentence becomes a furnished, checked plan." },
  { href: "/new?start=template", icon: LayoutTemplate, label: "Start from a template", text: "Seven homes, from a studio to a villa." },
  { href: "/new?start=blank", icon: FilePlus2, label: "Blank sheet", text: "Draw the walls and rooms yourself." },
  { href: "/new?start=import", icon: FileUp, label: "Import a file", text: "Open a .clavis.json design." },
];

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(/\s+/)[0]}.` : `${part}.`;
}

export function Home({ templates }: { templates: ReactNode }) {
  const { account } = useAccount();
  const ws = useWorkspace((s) => {
    const last = lastPlan(s);
    return {
      profile: getProfile(s),
      plans: listPlans(s),
      last,
      lastVersion: last ? listVersions(s, last.id).find((v) => !v.auto) : undefined,
      events: listEvents(s, { limit: 8 }),
    };
  });

  if (!ws) return <SheetHeader title="Your homes" />;
  const { profile, plans, last, lastVersion, events } = ws;
  const live = new Set(plans.map((p) => p.id));
  const recent = plans.filter((p) => p.id !== last?.id).slice(0, 5);
  const totalArea = Math.round(plans.reduce((t, p) => t + p.area, 0));

  return (
    <>
      <GuestImportBanner />
      <SheetHeader
        title={greeting(profile.name)}
        intro={plans.length ? `${plans.length} ${plans.length === 1 ? "plan" : "plans"} · ${totalArea} m² designed · ${account ? "kept in your account." : "all saved in this browser."}` : "Nothing here yet. Start a plan below, and it will wait for you here."}
      >
        <Link href="/templates" className="label border border-ink px-4 py-3 hover:bg-ink hover:text-paper">
          Templates
        </Link>
        <Link href="/new" className="label flex items-center gap-3 bg-ink px-4 py-3 text-paper hover:bg-marker">
          New plan <Plus size={14} aria-hidden="true" />
        </Link>
      </SheetHeader>

      {/* ---------------------------------------------------------------- continue */}
      {last && (
        <section aria-labelledby="continue-heading" className="border-b border-rule">
          <Band title="Continue where you left off" id="continue-heading" />
          <div className="grid md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Link href={studioHref(last.id)} className="group relative block border-b border-rule md:border-b-0 md:border-r" aria-label={`Continue ${last.name} in the studio`}>
              <PlanThumb id={last.id} stamp={last.updatedAt} className="grid-paper aspect-[16/10] bg-paper" />
              <span className="label absolute bottom-3 left-3 bg-paper/90 px-2 py-1 text-ink-3 group-hover:text-marker">{last.name}</span>
            </Link>
            <div className="flex flex-col gap-6 p-5 md:p-8">
              <div>
                <SourceTag source={last.source} />
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.025em]">{last.name}</h2>
                <dl className="mt-5 grid grid-cols-2 gap-px border border-rule bg-rule text-sm">
                  {[
                    ["Rooms", String(last.rooms)],
                    ["Floor area", `${last.area} m²`],
                    ["Last edited", ago(last.updatedAt)],
                    ["Saved version", lastVersion ? lastVersion.label : "None yet"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-paper p-3">
                      <dt className="label text-ink-3">{k}</dt>
                      <dd className="mt-1 truncate font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                <Link href={studioHref(last.id)} className="label flex flex-1 items-center justify-between gap-3 bg-marker px-4 py-3.5 text-paper hover:bg-ink">
                  Continue in studio <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                <Link href={planHref(last.id)} className="label flex items-center justify-between gap-3 border border-ink px-4 py-3.5 hover:bg-ink hover:text-paper">
                  Versions and history <Bookmark size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- start */}
      <section aria-labelledby="start-heading" className="border-b border-rule">
        <Band title={last ? "Start something new" : "Start your first plan"} id="start-heading" />
        <ul className="grid grid-cols-2 lg:grid-cols-4">
          {STARTS.map((n, i) => (
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

      {/* ---------------------------------------------------------------- recent + activity */}
      <div className="grid border-b border-rule lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="recent-heading" className="border-b border-rule lg:border-b-0 lg:border-r">
          <Band title="Recent plans" id="recent-heading">
            <Link href="/plans" className="label flex items-center gap-2 text-ink-2 hover:text-marker">
              All plans <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </Band>
          {recent.length === 0 ? (
            <p className="px-5 py-10 text-ink-3 md:px-8">{last ? "Your other plans will be listed here." : "Your plans will be listed here."}</p>
          ) : (
            <ul>
              {recent.map((p) => (
                <li key={p.id} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule-soft px-5 py-3 last:border-b-0 md:px-8">
                  <PlanThumb id={p.id} stamp={p.updatedAt} className="aspect-[4/3] border border-rule-soft" pad="p-0.5" />
                  <div className="min-w-0">
                    <Link href={planHref(p.id)} className="block truncate font-medium hover:text-marker">
                      {p.name}
                    </Link>
                    <p className="label mt-1 text-ink-3">
                      {p.rooms} rooms · {p.area} m² · {ago(p.updatedAt)}
                    </p>
                  </div>
                  <Link href={studioHref(p.id)} className="label flex items-center gap-1.5 border border-rule px-3 py-1.5 text-ink-2 hover:border-ink hover:text-ink">
                    Open <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity-heading">
          <Band title="Recent activity" id="activity-heading">
            <Link href="/history" className="label flex items-center gap-2 text-ink-2 hover:text-marker">
              History <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </Band>
          {events.length === 0 ? (
            <p className="px-5 py-10 text-ink-3 md:px-8">What you do — new plans, edits, versions — is recorded here.</p>
          ) : (
            <ul>
              {events.map((e) => (
                <EventRow key={e.id} e={e} live={live} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---------------------------------------------------------------- templates */}
      <section aria-labelledby="tpl-heading">
        <Band title="From the template library" id="tpl-heading">
          <Link href="/templates" className="label flex items-center gap-2 text-ink-2 hover:text-marker">
            All templates <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </Band>
        {templates}
      </section>
    </>
  );
}
