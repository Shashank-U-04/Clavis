import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Projects and export",
  description: "Designs save as you work. Keep several projects, and export a printable plan, the design file or a 3D model.",
};

const EXPORTS = [
  [".json", "Design file", "Everything: walls, openings, rooms, furniture and notes. Open it again in Clavis on any machine."],
  [".svg", "Plan drawing", "A printable plan with walls to scale, door swings, room names and areas, overall dimensions, a scale bar and a north arrow."],
  [".png", "3D snapshot", "The 3D view exactly as you see it."],
  [".obj", "3D model", "The building and its furniture for other 3D tools."],
];

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        trail={[
          { href: "/features", label: "Features" },
          { href: "/features/projects", label: "Projects and export" },
        ]}
        title="Your work, saved as you go."
        intro="Every change is saved within a moment of making it. Keep as many projects as you like, duplicate one to try an idea, and take any of them away as a file."
      />

      <Section sheet="01" title="Projects." intro="Without an account, projects live in this browser: private, and gone if you clear its storage. Accounts, coming next, will keep them in the cloud and bring them to any device.">
        <div className="grid md:grid-cols-2">
          {[
            ["In this browser", ["Autosave within a second", "Any number of projects", "Duplicate, rename, delete", "No account, nothing uploaded"]],
            ["With an account", ["Projects on every device", "Named versions to return to", "Read-only share links", "Hosted assistant on your account"]],
          ].map(([t, items], i) => (
            <div key={t as string} className={`border-rule p-5 md:p-8 ${i === 0 ? "border-b md:border-b-0 md:border-r" : ""}`}>
              <p className="label text-ink-3">{i === 0 ? "Available now" : "Coming with accounts"}</p>
              <h3 className="mt-3 text-2xl font-semibold">{t as string}</h3>
              <ul className="mt-6 divide-y divide-rule-soft border-y border-rule-soft">
                {(items as string[]).map((x) => (
                  <li key={x} className="flex items-center gap-3 py-3 text-ink-2">
                    <span className="h-1.5 w-1.5 bg-marker" aria-hidden="true" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section sheet="02" title="Take it with you." intro="Four exports, each made for a different next step.">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4">
          {EXPORTS.map(([ext, t, d], i) => (
            <li key={ext} className={`border-b border-rule p-5 md:p-8 lg:border-b-0 ${i % 2 === 0 ? "sm:border-r" : ""} ${i < 3 ? "lg:border-r" : ""}`}>
              <p className="font-mono text-3xl tracking-tight">{ext}</p>
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-end border-t border-rule p-5 md:p-8">
          <ButtonLink href="/new">Start a plan</ButtonLink>
        </div>
      </Section>
    </>
  );
}
