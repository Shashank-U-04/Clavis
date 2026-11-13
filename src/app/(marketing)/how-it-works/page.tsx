import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { ButtonLink } from "@/components/ui/Button";
import { CHECK_COUNT } from "@/model/checks";

export const metadata: Metadata = {
  title: "How it works",
  description: "One pipeline for every change: propose, dry-run, preview, apply, measure. Clavis never applies anything you haven't seen.",
};

const PIPELINE = [
  ["Ask", "You type a request, draw on the plan, or edit a number. Each one becomes a list of operations: add a wall, place a sofa, resize a room."],
  ["Validate", "Every operation is checked for impossible input: a door wider than its wall, a piece that is not in the catalog, a room that does not exist. One bad operation and none of them apply."],
  ["Dry-run", `The operations are applied to a copy of the design and the validator runs its ${CHECK_COUNT} checks on the result, so Clavis knows what the change would fix and what it would break.`],
  ["Preview", "Assistant proposals appear on the plan in green, with removals dashed in red, and a card listing what would be resolved or introduced."],
  ["Apply", "Nothing changes until you press Apply. Anything that removes or replaces work needs an extra confirmation, and every change can be undone."],
  ["Measure", "After applying, the design is checked again and the outcome is reported from those measurements — never from what the assistant expected to happen."],
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        trail={[{ href: "/how-it-works", label: "How it works" }]}
        title="One pipeline for every change."
        intro="A drag in the plan, a typed request and a hosted AI model's suggestion all take the same path. It is how Clavis can be generous with ideas and strict with geometry at the same time."
      />
      <Section sheet="01" title="Six steps, every time.">
        <ol>
          {PIPELINE.map(([t, d], i) => (
            <li key={t} className="grid border-b border-rule md:grid-cols-[14rem_1fr]">
              <div className="flex items-baseline gap-4 border-b border-rule-soft p-5 md:border-b-0 md:border-r md:border-rule md:p-8">
                <span className="text-4xl font-semibold tracking-[-0.05em] text-paper-3">0{i + 1}</span>
                <span className="label text-marker">{t}</span>
              </div>
              <p className="max-w-3xl p-5 text-lg text-ink-2 md:p-8">{d}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section sheet="02" title="Where the work happens." intro="Most of Clavis runs in your browser. The server is only involved when you use the hosted model, and later for accounts.">
        <div className="grid md:grid-cols-3">
          {[
            ["In your browser", "The plan editor, the 3D view, the validator, the analysis and Clavis Local. Your designs stay on your device."],
            ["On the server", "The hosted model's key and its requests. Only the request and a summary of the design are sent, and only when Clavis Local hands a request over."],
            ["In the cloud (with accounts)", "Coming next: your projects and versions, kept private to you."],
          ].map(([t, d], i) => (
            <div key={t} className={`border-b border-rule p-5 md:border-b-0 md:p-8 ${i < 2 ? "md:border-r" : ""}`}>
              <h3 className="font-semibold">{t}</h3>
              <p className="mt-2 text-ink-2">{d}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-rule p-5 md:p-8">
          <ButtonLink href="/new">Start a plan</ButtonLink>
        </div>
      </Section>
    </>
  );
}
