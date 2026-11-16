import type { Metadata } from "next";
import { PageHeader } from "@/components/site/PageHeader";
import { Section } from "@/components/site/Sheet";
import { IsoFigure } from "@/components/figures/IsoFigure";
import { buildSunsetFigure } from "@/components/figures/sunsetFigure";
import { CATALOG, CATEGORIES } from "@/model/catalog";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Plan, 3D and walk",
  description: "The plan and a live 3D model side by side, with a first-person walk through the home from its front door.",
};

const VIEWS = [
  ["2D Plan", "The layout builder: walls, rooms, doors, windows and furniture, drawn in metres and snapped to 5 cm."],
  ["3D Model", "The same design standing up. Orbit around it, or look straight down from the top. Click a door to swing it open."],
  ["Walk", "Step in just inside the front door at 1.60 m eye height, full screen if you like. Walls stop you; doorways let you through."],
];

const KEYS = [
  ["W A S D / arrows", "walk (in Walk)"],
  ["Esc", "leave the walk"],
  ["drag", "look around"],
  ["click a door", "open or close it"],
  ["F (plan)", "fit the plan to the window"],
  ["R (plan)", "turn the selected piece 90°"],
  ["Ctrl Z / Ctrl Y", "undo / redo"],
];

export default function ThreeDPage() {
  return (
    <>
      <PageHeader
        trail={[
          { href: "/features", label: "Features" },
          { href: "/features/3d", label: "Plan, 3D and walk" },
        ]}
        title="Draw in plan. See it stand up. Walk in."
        intro="The plan and the 3D model sit side by side and follow the same design: move a sofa in the plan and it moves in the room. Only what changed is rebuilt, so the view keeps up with you."
      />

      <Section sheet="01" title="Three ways to see one home." intro="Each has its own button in the studio's bar. Show them side by side or one at a time, alongside the chat; they all follow the same design.">
        <ol className="grid md:grid-cols-3">
          {VIEWS.map(([t, d], i) => (
            <li key={t} className={`border-b border-rule p-5 md:border-b-0 md:p-8 ${i < 2 ? "md:border-r" : ""}`}>
              <span className="label text-marker">0{i + 1}</span>
              <h3 className="mt-3 text-2xl font-semibold">{t}</h3>
              <p className="mt-2 text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section sheet="02" title="A cutaway you can read." intro="Like an architect's section, this drawing of the Sunset Loft is cut at 1.20 m. Hover a room to read its numbers, measured by the same engine the studio uses.">
        <div className="p-5 md:p-10">
          <div className="mx-auto max-w-5xl">
            <IsoFigure data={buildSunsetFigure()} fig="02" title="Sunset Loft · section at 1.20 m" />
          </div>
        </div>
      </Section>

      <Section sheet="03" title={`${CATALOG.length} pieces of furniture, modelled to size.`} intro="Every piece has a footprint in metres and its own 3D model, from beds and sofas to kitchen units and bathroom fittings. Sizes are typical nominal dimensions.">
        <div className="grid md:grid-cols-[1fr_22rem]">
          <ul className="grid grid-cols-2 border-b border-rule sm:grid-cols-3 md:border-b-0 md:border-r">
            {CATEGORIES.map((c) => (
              <li key={c} className="border-b border-r border-rule-soft p-5">
                <p className="label text-ink-3">{c}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{CATALOG.filter((x) => x.category === c).length}</p>
              </li>
            ))}
          </ul>
          <div className="p-5 md:p-8">
            <p className="label text-ink-3">Controls</p>
            <dl className="mt-4 divide-y divide-rule-soft border-y border-rule-soft">
              {KEYS.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
                  <dt className="font-mono">{k}</dt>
                  <dd className="text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
            <ButtonLink href="/studio/try?template=sunset-loft" className="mt-6 w-full">
              Walk through a home
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
