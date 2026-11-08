import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { BriefBox } from "@/components/site/BriefBox";
import { EXAMPLES } from "@/ai/local/engine";

export const metadata: Metadata = {
  title: "Design by describing",
  description: "One sentence becomes a furnished, validated floor plan. Then change it in words.",
};

const UNDERSTANDS = [
  ["Whole homes", "Bedrooms and bathrooms, an en-suite, a study, a dining room, a utility room, an open or separate kitchen, and a target area in m² or sq ft."],
  ["Furniture", "Furnish one room or all of them, add a named piece to a room, move, turn or remove furniture."],
  ["Structure", "Add or remove a bedroom, bathroom, study or dining room, make a room bigger or smaller, open up or close off the kitchen."],
  ["Details", "Add doors and windows, change floors, rename rooms and the design."],
  ["Repairs", "Fix every finding the validator reports, or just one — and hear plainly what needs a human decision."],
  ["Questions", "How big a room is, how much daylight it gets, how many doors from the entrance, what is wrong."],
];

const LOOP = [
  ["Propose", "The assistant returns operations: add, move, resize, remove."],
  ["Dry-run", "The validator applies them to a copy and lists what they would fix and what they would break."],
  ["Preview", "You see the change on the plan in green before deciding."],
  ["Apply", "Only your click changes the design. Then the result is measured again."],
];

export default function AiDesignPage() {
  return (
    <>
      <PageHeader
        trail={[
          { href: "/features", label: "Features" },
          { href: "/features/ai-design", label: "Design by describing" },
        ]}
        title="Say what the home needs. Get a plan you can check."
        intro="Clavis turns a brief into rooms with real sizes, walls on centrelines, doors that connect every room to the entrance and windows sized for daylight — then furnishes it piece by piece, keeping only what the validator accepts."
      >
        <div className="max-w-2xl">
          <BriefBox />
        </div>
      </PageHeader>

      <Section sheet="01" title="What the assistant understands." intro="Clavis Local runs in your browser with no account and no key. It understands these requests, and says so plainly when it doesn't.">
        <ul className="grid md:grid-cols-2 lg:grid-cols-3">
          {UNDERSTANDS.map(([t, d], i) => (
            <li key={t} className={`border-b border-rule p-5 md:p-8 ${i % 2 === 0 ? "md:border-r" : ""} ${i % 3 !== 2 ? "lg:border-r" : "lg:border-r-0"}`}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <div className="p-5 md:p-8">
          <p className="label text-ink-3">Try saying</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <li key={e} className="border border-rule bg-paper-2 px-3 py-2 font-mono text-sm text-ink-2">
                {e}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        sheet="02"
        title="Auto mode: local first, a hosted model when needed."
        intro="Anything Clavis Local can't place — “make the living room feel cosier for movie nights” — goes to a hosted language model. Its answer comes back as proposed operations, never as finished changes."
      >
        <ol className="grid md:grid-cols-4">
          {LOOP.map(([t, d], i) => (
            <li key={t} className={`border-b border-rule p-5 md:border-b-0 md:p-8 ${i < 3 ? "md:border-r" : ""}`}>
              <span className="label text-marker">0{i + 1}</span>
              <h3 className="mt-3 text-xl font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        sheet="03"
        title="Creative ideas, precise geometry."
        intro="A language model is good at intent and loose with centimetres. When an applied change leaves findings behind, one click hands exactly those to the deterministic repair, which moves pieces until nothing collides."
      >
        <div className="grid gap-px bg-rule md:grid-cols-3">
          {[
            ["Hosted model", "“Cosier for movie nights” → a rug, a TV stand and a coffee table, and the sofa turned."],
            ["Validator", "Three new findings: the TV stand overlaps the counter and the fridge, the dining table touches the sofa."],
            ["Clavis Local repair", "Moves two pieces, 0.48 m and 0.80 m. 0 errors, 0 warnings."],
          ].map(([t, d]) => (
            <div key={t} className="bg-paper p-5 md:p-8">
              <p className="label text-ink-3">{t}</p>
              <p className="mt-3 text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
