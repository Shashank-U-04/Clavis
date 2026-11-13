import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { FEATURES } from "@/components/site/nav";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Features",
  description: "Design by describing, a validator on every change, plan and 3D side by side, a walk-through, and projects that save themselves.",
};

const ALSO = [
  ["Draw by hand", "Walls that chain, rooms you drag out, doors and windows clicked onto walls, all snapping to 5 cm."],
  ["Inspector", "Exact numbers for any wall, opening, room or piece, edited through the same checked pipeline."],
  ["Undo and redo", "Every change, including a drag or an applied proposal, is one step back."],
  ["Tracing", "Lay a photo or scan of a plan under the drawing, set its real width and trace over it."],
  ["Route on the plan", "See the path from the front door to any room drawn on the plan."],
  ["Phone and tablet", "The studio rearranges itself for small screens."],
];

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        trail={[{ href: "/features", label: "Features" }]}
        title="A drafting table that thinks about the home with you."
        intro="Clavis does four things well: it designs from a sentence, checks everything it draws, shows the home in 3D, and keeps your work."
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
      <Section sheet="A" title="And the details that make it a studio.">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
          {ALSO.map(([t, d], i) => (
            <li key={t} className={`border-b border-rule p-5 md:p-8 ${i % 3 !== 2 ? "lg:border-r" : ""} ${i % 2 === 0 ? "sm:border-r" : ""}`}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end p-5 md:p-8">
          <ButtonLink href="/new">Try it now</ButtonLink>
        </div>
      </Section>
    </>
  );
}
