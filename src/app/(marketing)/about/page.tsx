import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "About",
  description: "What Clavis is for, who it is for, and how it is built.",
};

const PRINCIPLES = [
  ["A plan you can trust", "Sketching rooms is easy. Knowing the doors open, the bed fits and every room can be reached is harder, so Clavis checks those things as you go."],
  ["You make the changes", "The assistant suggests; you see the suggestion on the plan and decide. Nothing changes until you apply it."],
  ["Real measurements", "Areas, daylight and routes are measured from the drawing itself, the same way every time. They are never guessed."],
  ["Private by default", "Clavis works without an account, and your designs stay in your browser until you choose to sign in."],
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        trail={[{ href: "/about", label: "About" }]}
        title="Clavis is Latin for key."
        intro="A key is the first thing you need to get into a home. Clavis gives you an early version of that: a clear, checked picture of a place before anything is built or bought."
      />
      <Section sheet="01" title="How it is built.">
        <ul className="grid md:grid-cols-2">
          {PRINCIPLES.map(([t, d], i) => (
            <li key={t} className={`border-b border-rule p-5 md:p-10 ${i % 2 === 0 ? "md:border-r" : ""}`}>
              <span className="label text-marker">0{i + 1}</span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">{t}</h3>
              <p className="mt-3 text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-10">
          <p className="max-w-xl text-ink-2">Clavis is for anyone planning a home: buyers, renovators, students and the curious. It is a tool for early design, not a substitute for an architect or for your local building rules.</p>
          <ButtonLink href="/new">Start designing</ButtonLink>
        </div>
      </Section>
    </>
  );
}
