import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { CHECKS, GROUPS } from "@/content/checks";
import { CHECK_CODES, CHECK_COUNT } from "@/model/checks";

export const metadata: Metadata = {
  title: "The validator",
  description: "Every change to a Clavis design is checked by a deterministic engine: walls, openings, furniture clearances, circulation and habitability.",
};

const SEVERITY = {
  error: "bg-marker text-paper",
  warning: "border border-ink text-ink",
  info: "border border-rule text-ink-3",
} as const;

export default function ValidationPage() {
  return (
    <>
      <PageHeader
        trail={[
          { href: "/features", label: "Features" },
          { href: "/features/validation", label: "The validator" },
        ]}
        title={`${CHECK_COUNT} checks, on every change, from every source.`}
        intro="A drag in the plan, a number typed in Details, a proposal from Clavis Local or from a hosted AI model: all of it goes through one pipeline and one referee. The engine never guesses and never edits; it measures and reports."
      />

      <Section sheet="01" title="How a finding works." intro="Each finding names the walls, openings, rooms or pieces involved and carries the numbers behind it. Its id comes from the finding itself, so Clavis can say exactly which findings a change resolved, kept or introduced.">
        <div className="grid gap-px bg-rule md:grid-cols-3">
          {[
            ["Error", "The geometry or a relationship is broken: a piece through a wall, overlapping rooms, a door past the end of its wall.", "error"],
            ["Warning", "Probably a problem: a room with no window, a narrow door, a bedroom with no escape window.", "warning"],
            ["Note", "An observation that never blocks anything: an en-suite reached through its bedroom.", "info"],
          ].map(([t, d, s]) => (
            <div key={t} className="bg-paper p-5 md:p-8">
              <span className={`label inline-block px-2 py-1 ${SEVERITY[s as keyof typeof SEVERITY]}`}>{t}</span>
              <p className="mt-4 text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section sheet="02" title="Every check." intro="Thresholds are early-design rules of thumb, not building-code values for any country. They are shown exactly as the engine uses them.">
        <div className="grid md:grid-cols-2">
          {GROUPS.map((g, gi) => {
            const codes = CHECK_CODES.filter((c) => CHECKS[c].group === g);
            return (
              <div key={g} className={`border-b border-rule ${gi % 2 === 0 ? "md:border-r" : ""}`}>
                <h3 className="label border-b border-rule-soft px-5 py-4 text-ink md:px-8">
                  {g} <span className="text-ink-3">· {codes.length}</span>
                </h3>
                <ul>
                  {codes.map((c) => (
                    <li key={c} className="grid grid-cols-[1fr_auto] gap-4 border-b border-rule-soft px-5 py-3 last:border-0 md:px-8">
                      <div>
                        <p className="text-sm">{CHECKS[c].text}</p>
                        <code className="mt-1 block font-mono text-[0.7rem] text-ink-3">{c}</code>
                      </div>
                      <span className={`label h-fit px-1.5 py-0.5 text-[0.6rem] ${SEVERITY[CHECKS[c].severity]}`}>{CHECKS[c].severity === "info" ? "note" : CHECKS[c].severity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}
