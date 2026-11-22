import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { BriefBox } from "@/components/site/BriefBox";
import { EXAMPLES } from "@/ai/local/engine";

export const metadata: Metadata = {
  title: "Design by describing",
  description: "Describe a home and get a furnished floor plan to scale. Then change it in your own words.",
};

const UNDERSTANDS = [
  ["Whole homes", "Bedrooms and bathrooms, an en-suite, a study, a dining room, a utility room, an open or separate kitchen, and a target area in m² or sq ft."],
  ["Furniture", "Furnish one room or all of them, add a named piece to a room, move, turn or remove furniture."],
  ["Structure", "Add or remove a bedroom, bathroom, study or dining room, make a room bigger or smaller, open up or close off the kitchen."],
  ["Details", "Add doors and windows, change floors, rename rooms and the design."],
  ["Fixes", "Fix every problem Clavis has found, or just one, and hear plainly what needs your decision."],
  ["Questions", "How big a room is, how much daylight it gets, how many doors from the entrance, what is wrong."],
];

const LOOP = [
  ["Suggest", "The assistant suggests a change: add, move, resize or remove."],
  ["Check", "Clavis tries it on a copy of your design and lists what it would fix and what it would break."],
  ["Preview", "You see the change on the plan, in green, before deciding."],
  ["Apply", "Only your click changes the design, and it can be undone."],
];

export default function AiDesignPage() {
  return (
    <>
      <PageHeader
        trail={[
          { href: "/features", label: "Features" },
          { href: "/features/ai-design", label: "Design by describing" },
        ]}
        title="Say what the home needs. Get a plan to scale."
        intro="Clavis turns a description into rooms at real sizes, with doors that connect every room to the entrance and windows sized for daylight, then furnishes each room with pieces that fit."
      >
        <div className="max-w-2xl">
          <BriefBox />
        </div>
      </PageHeader>

      <Section sheet="01" title="What you can ask for." intro="The built-in assistant runs in your browser, with nothing sent anywhere. It understands requests like these, and says so plainly when it does not.">
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
        title="Looser requests go to a hosted AI model."
        intro="A request like “make the living room cosier for movie nights” goes to a hosted AI model. Its answer comes back as a suggestion like any other: checked, previewed, and applied only if you choose."
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
        title="Good ideas, exact measurements."
        intro="An AI model is good at what you mean and loose with centimetres. When a change leaves furniture overlapping, one click moves the pieces until nothing collides."
      >
        <div className="grid gap-px bg-rule md:grid-cols-3">
          {[
            ["Hosted model", "“Cosier for movie nights” → a rug, a TV stand and a coffee table, and the sofa turned."],
            ["Checked", "Three new problems: the TV stand overlaps the counter and the fridge, the dining table touches the sofa."],
            ["Fixed", "Two pieces moved, 0.48 m and 0.80 m. No errors or warnings left."],
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
