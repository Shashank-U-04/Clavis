import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { CHECKS, GROUPS } from "@/content/checks";
import { CHECK_CODES } from "@/model/checks";

export const metadata: Metadata = {
  title: "Problems pointed out",
  description: "Clavis checks a design as you work: walls, doors and windows, furniture clearances, routes between rooms, daylight and stairs.",
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
          { href: "/features/validation", label: "Problems pointed out" },
        ]}
        title="See what is wrong while it is still easy to fix."
        intro="Whether you drag a wall, type a size or apply a suggestion from the assistant, Clavis checks the result the same way and marks anything that needs attention on the plan. It measures and reports; it never changes your design by itself."
      />

      <Section sheet="01" title="Three kinds of finding." intro="Each finding names the walls, doors, rooms or furniture involved, with the measurements behind it, and clicking it shows them on the plan.">
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

      <Section sheet="02" title="What is checked." intro="The limits are rules of thumb for early design, not the building code of any country, and are shown here exactly as Clavis uses them.">
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
