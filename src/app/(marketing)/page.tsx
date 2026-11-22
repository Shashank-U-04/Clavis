import Link from "next/link";
import { ArrowUpRight, Box, Compass, FileDown, Footprints, ScanSearch, Sparkles } from "lucide-react";
import { HeroModel, type BuildStep } from "@/components/site/HeroModel";
import type { CSSProperties } from "react";
import { Frame, Section, Words } from "@/components/site/Sheet";
import { LogoMark } from "@/components/site/Logo";
import { BriefBox } from "@/components/site/BriefBox";
import { ButtonLink } from "@/components/ui/Button";
import { CATALOG } from "@/model/catalog";
import { analyzeModel } from "@/model/analysis";
import { checkModel, summarizeIssues } from "@/model/issues";
import { lindenHeightsModel } from "@/model/templates";
import { levelsOf, onLevel } from "@/model/levels";
import { localProposal } from "@/ai/local/engine";
import { applyBatch } from "@/model/operations";
import { emptyModel } from "@/model/types";

/** a delay for the opening animation, and a place in a staggered reveal */
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const at = (i: number) => ({ "--i": i }) as CSSProperties;

const SAMPLE_BRIEF = "a three-bedroom house with a study, about 120 m²";

/** Run the sample brief through Clavis Local, so the numbers quoted on the page are real. */
function sampleResult() {
  let n = 0;
  const proposal = localProposal({ mode: "design", instruction: SAMPLE_BRIEF, context: { design: {} } }, emptyModel());
  const out = applyBatch(emptyModel(), proposal.operations, (p) => `${p}_${n++}`);
  return { rooms: out.model.rooms.length, items: out.model.items.length };
}

const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;
const indoor = (kind: string) => CATALOG.find((c) => c.kind === kind)?.category !== "outdoor";

/** The build log beside the hero model, counted from the design it shows. */
function buildSteps(model: ReturnType<typeof lindenHeightsModel>, overall: string, errors: number, warnings: number): BuildStep[] {
  // one line per floor, as the model builds them from the ground up
  const floors: BuildStep[] = levelsOf(model).map((level, i) => {
    const on = onLevel(model, level.id);
    return {
      code: "",
      title: level.name,
      detail: `${n(on.rooms.length, "room")} · ${n(on.openings.length, "door or window", "doors and windows")} · ${n(on.items.filter((it) => indoor(it.kind)).length, "piece")}`,
      cue: `level:${i}`,
    };
  });
  const steps: BuildStep[] = [
    { code: "", title: "Plan", detail: `${model.name} · ${overall} · north up`, cue: "plan" },
    ...floors,
    { code: "", title: "Roof", detail: "flat roofs · open terraces", cue: "roof" },
    { code: "", title: "Garden", detail: "infinity pool · terraces · trees", cue: "grounds" },
    { code: "", title: "Checked", detail: `${n(errors, "error")} · ${n(warnings, "warning")}`, cue: "checks" },
    { code: "", title: "Ready", detail: "drag to turn · scroll to zoom", cue: "model" },
  ];
  return steps.map((s, i) => ({ ...s, code: String(i + 1).padStart(2, "0") }));
}

const STEPS = (sample: { rooms: number; items: number }) => [
  {
    title: "Describe",
    text: "Type what the home needs: bedrooms, bathrooms, a study, an open kitchen, the size. Clavis lays the rooms out to scale, joins them with a hall and furnishes them.",
    specimen: ["› a three-bedroom house with", "  a study, about 120 m²", "", `  ${n(sample.rooms, "room")} · ${n(sample.items, "piece")} of furniture`],
  },
  {
    title: "Adjust",
    text: "Drag walls and furniture yourself, or type the change you want. Suggestions show on the plan first; nothing changes until you apply them, and everything can be undone.",
    specimen: ["› make the kitchen bigger", "› add a bedroom with an en-suite", "", "  shown on the plan · Apply or Undo"],
  },
  {
    title: "Walk through",
    text: "Step in at the front door with a figure at real height and walk room to room, up the stairs too. Change something in the plan and the house changes around you.",
    specimen: ["  figure       1.75 m", "  move         W A S D", "  camera       drag · scroll", "  doors        click to open"],
  },
];

const FEATURES = [
  { icon: Sparkles, title: "Design from a sentence", text: "Describe the rooms and the size you want. You get a furnished floor plan in metres, not a sketch.", href: "/features/ai-design" },
  { icon: Compass, title: "Edit by hand or by asking", text: "Drag walls, resize rooms and move furniture yourself, or ask: add a bedroom, open up the kitchen.", href: "/features/ai-design" },
  { icon: ScanSearch, title: "Problems pointed out", text: "A door blocked by a wardrobe, a room with no way in, a bedroom without a window: each is marked on the plan as you work.", href: "/features/validation" },
  { icon: Box, title: "Plan and 3D together", text: "The 3D model follows every edit. Turn it, look down from above, open the doors.", href: "/features/3d" },
  { icon: Footprints, title: "Walk around inside", text: "See the size of each room the way you would standing in it, from behind a figure or through its eyes.", href: "/features/3d" },
  { icon: FileDown, title: "Save and export", text: "Projects save as you work. Sign in with Google to open them anywhere. Export a printable plan or a 3D model.", href: "/features/projects" },
];

const FOR = {
  good: ["Planning a new home or a renovation", "Trying several layouts before you meet an architect", "Showing a builder or your family what you have in mind", "Learning how rooms, doors and furniture fit together"],
  not: ["Construction or permit drawings", "Structural or building-code approval", "Cost estimates"],
};

const FAQ = [
  ["Is it free?", "Yes. You can design, check, walk through and export without paying or creating an account."],
  ["Do I need to install anything?", "No. Clavis runs in a modern browser. A computer is best for drawing; phones and tablets work for viewing and small edits."],
  ["Where are my designs kept?", "In your browser until you sign in. Sign in with Google and they are kept in your account and open on any device; designs you made before signing in move across with you."],
  ["Does the assistant change my design on its own?", "No. Its suggestions are shown on the plan as a preview, with any problems they would cause. Your design changes only when you press Apply."],
  ["Can I build from these plans?", "Use them to decide what you want and to talk it through with an architect or builder. They are early design drawings, not construction documents."],
  ["Are the sizes realistic?", "Everything is drawn in metres. Furniture is at its real size, doors are 0.8 to 0.9 m wide and rooms are 2.85 m high unless you change them."],
];

export default function Home() {
  const model = lindenHeightsModel();
  const analysis = analyzeModel(model);
  const env = analysis.metrics.envelope!;
  const counts = summarizeIssues(checkModel(model));
  const steps = STEPS(sampleResult());
  const facts = [
    ["Shown", model.name],
    ["Floors", String(levelsOf(model).length)],
    ["Rooms", String(model.rooms.length)],
    ["Floor area", `${Math.round(analysis.metrics.carpetArea)} m²`],
    ["Furniture", `${model.items.filter((it) => indoor(it.kind)).length} pieces`],
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1440px]">
          <Frame className="px-5 py-8 md:px-12 md:py-10">
            <HeroModel
              model={model}
              site={[]}
              front={{ x: -1, y: -0.55 }}
              elevation={11}
              steps={buildSteps(model, `${env.w.toFixed(1)} × ${env.h.toFixed(1)} m`, counts.error, counts.warning)}
              caption={`${model.name} · designed in Clavis`}
              side={
                <div>
                  <p className="label mb-6 text-ink-3">Sheet 01</p>
                  <div className="flex items-center gap-4">
                    <LogoMark size={56} className="shrink-0" />
                    <span className="text-[clamp(3rem,5.6vw,4.8rem)] font-semibold leading-none tracking-[-0.05em]">Clavis</span>
                  </div>
                  <p className="mt-5 max-w-sm text-pretty text-lg leading-snug text-ink-2">Plan a home, check it, and walk through it in 3D, in your browser.</p>
                  <dl className="mt-8 border-t border-rule font-mono text-[0.7rem] uppercase tracking-[0.08em]">
                    {facts.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[6.5rem_1fr] border-b border-rule py-2">
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              }
            />
          </Frame>
          <div className="grid border-t border-rule lg:grid-cols-[1fr_minmax(0,24rem)_minmax(0,16rem)]">
            <h1 className="border-b border-rule p-5 text-[clamp(1.9rem,7.6vw,4.4rem)] font-semibold uppercase leading-[0.95] tracking-[-0.035em] md:p-8 lg:border-b-0 lg:border-r">
              <span className="rise-line">
                <span className="whitespace-nowrap" style={d(120)}>
                  Describe a home.
                </span>
              </span>
              <span className="rise-line">
                <span className="whitespace-nowrap" style={d(260)}>
                  <span className="marker-line">Walk through it.</span>
                </span>
              </span>
            </h1>
            <div className="flex flex-col justify-between gap-6 border-b border-rule p-5 md:p-8 lg:border-b-0 lg:border-r">
              <p className="fade-up text-pretty text-ink-2" style={d(450)}>
                Type what you need and Clavis draws a furnished floor plan to scale. Change it by hand or by asking, see it in 3D, and walk through it before anything is built.
              </p>
              <p className="fade-up label text-ink-3" style={d(600)}>
                Free · runs in your browser · no sign-up to start
              </p>
            </div>
            <div className="fade-up flex flex-col" style={d(700)}>
              <ButtonLink href="/new" className="flex-1 py-5">
                Start designing
              </ButtonLink>
              <ButtonLink href="/studio/try?template=linden-heights" variant="ghost" className="flex-1 border-t border-rule py-5">
                Open this house
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- how it works */}
      <Section sheet="02" title="From an idea to a walk-through, in three steps." intro="You stay in charge at every step: suggestions are previews until you apply them.">
        <ol className="grid md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} data-reveal style={at(i)} className={`flex flex-col gap-6 border-rule p-5 md:p-8 ${i < 2 ? "border-b md:border-b-0 md:border-r" : ""}`}>
              <div className="flex items-baseline justify-between">
                <span className="label text-marker">Step 0{i + 1}</span>
                <span className="drift text-5xl font-semibold tracking-[-0.05em] text-paper-3">0{i + 1}</span>
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
              <p className="text-ink-2">{s.text}</p>
              <pre data-reveal className="typing mt-auto overflow-x-auto border border-rule bg-paper-2 p-4 font-mono text-[0.78rem] leading-relaxed text-ink-2">
                {s.specimen.map((line, j) => (
                  <span key={j} className="tl" style={at(j)}>
                    {line}
                  </span>
                ))}
              </pre>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------------- features */}
      <Section sheet="03" title="What you can do." intro="One workspace from the first idea to a plan you can share.">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((c, i) => (
            <li key={c.title} data-reveal style={at(i % 3)} className={`border-b border-rule ${i % 2 === 0 ? "sm:border-r" : ""} ${i % 3 !== 2 ? "lg:border-r" : "lg:border-r-0"}`}>
              <Link href={c.href} className="group flex h-full flex-col gap-4 p-5 hover:bg-paper-2 md:p-8">
                <div className="flex items-start justify-between">
                  <c.icon size={22} strokeWidth={1.4} className="text-ink" aria-hidden="true" />
                  <ArrowUpRight size={16} className="text-ink-3 transition-[color,translate] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-marker" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">{c.title}</h3>
                <p className="text-sm text-ink-2">{c.text}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- who it's for */}
      <Section sheet="04" title="Made for planning, before you build." intro="Clavis helps you work out what you want. Your architect or builder turns that into drawings you can build from.">
        <div className="grid md:grid-cols-2">
          {[
            { tag: "Good for", items: FOR.good, mark: "bg-marker" },
            { tag: "Not for", items: FOR.not, mark: "bg-ink-3" },
          ].map((g, i) => (
            <div key={g.tag} data-reveal style={at(i * 2)} className={`border-rule p-5 md:p-8 ${i === 0 ? "border-b md:border-b-0 md:border-r" : ""}`}>
              <h3 className="label text-ink-3">{g.tag}</h3>
              <ul className="mt-5 divide-y divide-rule-soft border-y border-rule-soft">
                {g.items.map((p) => (
                  <li key={p} className="flex items-center gap-3 py-3 text-ink-2">
                    <span className={`h-1.5 w-1.5 shrink-0 ${g.mark}`} aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- questions */}
      <Section sheet="05" title="Questions.">
        <dl className="grid md:grid-cols-2">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`border-b border-rule p-5 md:p-8 ${i % 2 === 0 ? "md:border-r" : ""}`}>
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-2 text-ink-2">{a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ---------------------------------------------------------------- start */}
      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 md:grid-cols-[1fr_minmax(0,36rem)] md:px-8 md:py-24">
          <div>
            <p className="label text-paper/50">Sheet 06</p>
            <h2 data-reveal className="words mt-4 text-balance text-4xl font-semibold uppercase leading-[0.95] tracking-[-0.035em] md:text-6xl">
              <Words text="Start with a sentence." />
            </h2>
          </div>
          <div data-reveal style={at(4)} className="self-end">
            <BriefBox dark />
            <p className="label mt-6 text-paper/45">
              Prefer to draw?{" "}
              <Link href="/new?start=blank" className="text-paper underline underline-offset-4 hover:text-marker">
                Start from a blank sheet
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
