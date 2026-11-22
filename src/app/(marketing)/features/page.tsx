import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { FEATURES } from "@/components/site/nav";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Features",
  description: "Design a home from a sentence, edit it by hand or by asking, see problems on the plan, walk through it in 3D, and keep it on any device.",
};

const ALSO = [
  ["Draw by hand", "Chain walls, drag out rooms, click doors and windows onto walls. Everything snaps to 5 cm."],
  ["Exact sizes", "Select any wall, door, room or piece of furniture and type its exact measurements."],
  ["Several floors", "Add floors, link them with stairs, and see the floor below faintly while you draw."],
  ["Undo and redo", "Every change, a drag or an applied suggestion, is one step back."],
  ["Trace a drawing", "Put a photo or scan of an existing plan under the sheet, set its width and trace over it."],
  ["Route to every room", "See the path from the front door to any room drawn on the plan."],
];

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        trail={[{ href: "/features", label: "Features" }]}
        title="Everything Clavis does."
        intro="Four things, from the first idea to a plan you can share: design from a description, see problems as you work, look at it in 3D, and keep it."
      />
      <section className="border-b border-rule">
        <ul className="mx-auto grid max-w-[1440px] md:grid-cols-2">
          {FEATURES.map((f, i) => (
            <li key={f.href} className={`border-rule ${i % 2 === 0 ? "md:border-r" : ""} ${i < 2 ? "border-b" : "border-b md:border-b-0"}`}>
              <Link href={f.href} className="group flex h-full min-h-64 flex-col justify-between gap-10 p-6 hover:bg-paper-2 md:p-10">
                <div className="flex justify-between">
                  <span className="label text-marker">0{i + 1}</span>
                  <ArrowUpRight size={20} className="text-ink-3 group-hover:text-marker" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">{f.title}</h2>
                  <p className="mt-3 max-w-md text-ink-2">{f.blurb}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Section sheet="01" title="Also in the studio.">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
          {ALSO.map(([t, d], i) => (
            <li key={t} className={`border-b border-rule p-5 md:p-8 ${i % 2 === 0 ? "sm:border-r" : ""} ${i % 3 !== 2 ? "lg:border-r" : "lg:border-r-0"}`}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end p-5 md:p-8">
          <ButtonLink href="/new">Start designing</ButtonLink>
        </div>
      </Section>
    </>
  );
}
