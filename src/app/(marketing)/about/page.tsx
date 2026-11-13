import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "About",
  description: "Why Clavis exists, and the principles it is built on.",
};

const PRINCIPLES = [
  ["Ideas are cheap. Checks are not.", "Anyone can sketch a floor plan. Knowing that the doors open, the bed fits and every room can be reached is the hard part — so that is what Clavis is built around."],
  ["The machine proposes. You decide.", "No assistant, local or hosted, changes your design. It proposes; you see a checked preview; you apply."],
  ["Every number is measured.", "Areas, daylight, routes and findings come from the design itself, computed the same way every time. Nothing is estimated by a language model."],
  ["Private by default.", "The studio runs in your browser. Without an account, your designs never leave your device."],
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        trail={[{ href: "/about", label: "About" }]}
        title="Clavis is Latin for key."
        intro="It is the first thing you need to get into a home, and the first thing Clavis tries to give you: a clear, checked picture of the place before anything is built or bought."
      />
      <Section sheet="01" title="What we believe.">
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
          <p className="max-w-xl text-ink-2">Clavis is a concept-design tool for anyone planning a home — buyers, renovators, students and the curious. It is not a substitute for an architect or for local building regulations.</p>
          <ButtonLink href="/new">Start designing</ButtonLink>
        </div>
      </Section>
    </>
  );
}
