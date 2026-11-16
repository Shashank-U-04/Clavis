import Link from "next/link";
import { ArrowUpRight, Box, Compass, FileDown, Footprints, ScanSearch, Sparkles } from "lucide-react";
import { BuildFigure, type BuildStep } from "@/components/figures/BuildFigure";
import { buildSunsetFigure } from "@/components/figures/sunsetFigure";
import { Frame, Section } from "@/components/site/Sheet";
import { LogoMark } from "@/components/site/Logo";
import { BriefBox } from "@/components/site/BriefBox";
import { ButtonLink } from "@/components/ui/Button";
import { CATALOG } from "@/model/catalog";
import { analyzeModel } from "@/model/analysis";
import { checkModel, summarizeIssues } from "@/model/issues";
import { sunsetLoftModel } from "@/model/templates";
import { CHECK_COUNT } from "@/model/checks";
import { localProposal } from "@/ai/local/engine";
import { applyBatch } from "@/model/operations";
import { emptyModel } from "@/model/types";

const SAMPLE_BRIEF = "a three-bedroom house with a study, about 120 m²";

/** Run the sample brief through Clavis Local, so the numbers quoted on the page are real. */
function sampleResult() {
  let n = 0;
  const proposal = localProposal({ mode: "design", instruction: SAMPLE_BRIEF, context: { design: {} } }, emptyModel());
  const out = applyBatch(emptyModel(), proposal.operations, (p) => `${p}_${n++}`);
  return { rooms: out.model.rooms.length, items: out.model.items.length };
}

/** The build log beside the hero drawing, counted from the design it draws. */
function buildSteps(model: ReturnType<typeof sunsetLoftModel>, overall: string[], errors: number, warnings: number): BuildStep[] {
  const doors = model.openings.filter((o) => o.kind === "door").length;
  const windows = model.openings.length - doors;
  const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;
  return [
    { code: "001", title: "Read plan", detail: `${model.name} · ${n(model.rooms.length, "room")}` },
    { code: "002", title: "Set out", detail: overall.join(" × ") },
    { code: "003", title: "Raise walls", detail: n(model.walls.length, "wall") },
    { code: "004", title: "Cut openings", detail: `${n(doors, "door")} · ${n(windows, "window")}` },
    { code: "005", title: "Furnish", detail: n(model.items.length, "piece") },
    { code: "006", title: "Render", detail: "section cut at 1.20 m" },
    { code: "007", title: `${CHECK_COUNT} checks`, detail: `${n(errors, "error")} · ${n(warnings, "warning")}` },
    { code: "008", title: "Ready", detail: "walk in at the door" },
  ];
}

const CAPABILITIES = [
  { icon: Sparkles, title: "Design by describing", text: "Bedrooms, bathrooms, a study, an open kitchen, a target area: one sentence becomes a furnished plan.", href: "/features/ai-design" },
  { icon: ScanSearch, title: "A validator on every change", text: "Walls, openings, furniture clearances, daylight, escape windows and the route to every room.", href: "/features/validation" },
  { icon: Compass, title: "Edit in words or by hand", text: "Add a bedroom, make the kitchen bigger, move the sofa — or draw walls, doors and windows yourself.", href: "/features/ai-design" },
  { icon: Box, title: "Plan and 3D side by side", text: "The 3D model follows every edit. Orbit around it or look straight down like a plan.", href: "/features/3d" },
  { icon: Footprints, title: "Walk through it", text: "Step in at the front door at eye height. Walls stop you; doorways let you through.", href: "/features/3d" },
  { icon: FileDown, title: "Keep and share", text: "Projects save as you work. Export a printable plan, the design file or a 3D model.", href: "/features/projects" },
];

const steps = (sample: { rooms: number; items: number }) => [
  {
    n: "01",
    title: "Describe",
    text: "Say what the home needs. Clavis turns the brief into a room program and lays it out in metres, with a hall that reaches every room.",
    specimen: ["› a three-bedroom house with", "  a study, about 120 m²", "", `  ${sample.rooms} rooms · ${sample.items} pieces placed`],
  },
  {
    n: "02",
    title: "Check",
    text: "Before you see a proposal, the validator dry-runs it. Nothing changes until you press Apply, and the result is measured afterwards.",
    specimen: ["✓ walls meet and openings fit", "✓ doors and windows kept clear", "✓ every room reachable", "✓ daylight ≥ 10 % of the floor"],
  },
  {
    n: "03",
    title: "Walk",
    text: "Press Walk and step in at the front door, at eye height. Change something in the plan and the house changes around you.",
    specimen: ["  eye height   1.60 m", "  move         W A S D", "  look         drag", "  doors        click to open"],
  },
];

export default function Home() {
  const model = sunsetLoftModel();
  const figure = buildSunsetFigure(model);
  const analysis = analyzeModel(model);
  const counts = summarizeIssues(checkModel(model));
  const rooms = analysis.rooms;
  const STEPS = steps(sampleResult());

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1440px]">
          <Frame className="px-5 py-8 md:px-12 md:py-10">
            <BuildFigure
              data={figure}
              steps={buildSteps(model, figure.dims.map((d) => d.text), counts.error, counts.warning)}
              caption="Sunset Loft · built live from the plan"
              side={
                <div>
                  <p className="label text-ink-3">Sheet 01 · Title block</p>
                  <div className="mt-6 flex items-center gap-4">
                    <LogoMark size={64} className="shrink-0" />
                    <span className="text-[clamp(3.2rem,6vw,5.2rem)] font-semibold leading-none tracking-[-0.05em]">Clavis</span>
                  </div>
                  <p className="mt-6 max-w-sm text-pretty text-lg leading-snug text-ink-2">An architectural design studio that turns one sentence into a home you can walk through.</p>
                  <dl className="mt-8 border-t border-rule font-mono text-[0.7rem] uppercase tracking-[0.08em]">
                    {[
                      ["Type", "Design studio, in the browser"],
                      ["Units", "Metres, true to scale"],
                      ["Checks", `${CHECK_COUNT} on every change`],
                      ["Status", "Free · no account needed"],
                    ].map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[5.5rem_1fr] border-b border-rule py-2">
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
              <span className="block whitespace-nowrap">Describe a home.</span>
              <span className="block whitespace-nowrap">Walk through it.</span>
            </h1>
            <div className="flex flex-col justify-between gap-6 border-b border-rule p-5 md:p-8 lg:border-b-0 lg:border-r">
              <p className="text-pretty text-ink-2">
                Clavis turns one sentence into a furnished floor plan in metres, checks every wall, door, window and piece of furniture against real geometry, and lets you walk through the result in 3D.
              </p>
              <p className="label text-ink-3">Free to try · no account · runs in your browser</p>
            </div>
            <div className="flex flex-col">
              <ButtonLink href="/new" className="flex-1 py-5">
                Start designing
              </ButtonLink>
              <ButtonLink href="/how-it-works" variant="ghost" className="flex-1 border-t border-rule py-5">
                How it works
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- facts */}
      <div className="border-b border-rule bg-ink text-paper">
        <dl className="mx-auto grid max-w-[1440px] grid-cols-2 md:grid-cols-4">
          {[
            [String(CHECK_COUNT), "checks on every change"],
            [String(CATALOG.length), "furniture pieces, true to size"],
            ["0", "accounts needed to start"],
            ["1", "sentence to a whole home"],
          ].map(([value, label], i) => (
            <div key={label} className={`border-paper/15 p-5 md:p-8 ${i % 2 === 0 ? "border-r" : ""} md:border-r ${i < 2 ? "border-b md:border-b-0" : ""}`}>
              <dt className="sr-only">{label}</dt>
              <dd className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">{value}</dd>
              <dd className="label mt-3 text-paper/60">{label}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ---------------------------------------------------------------- how */}
      <Section sheet="02" title="From one sentence to a home you can walk through." intro="Three steps, and you stay in charge of each one. Proposals are previews until you apply them, and every change can be undone.">
        <ol className="grid md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.n} className={`flex flex-col gap-6 border-rule p-5 md:p-8 ${i < 2 ? "border-b md:border-b-0 md:border-r" : ""}`}>
              <div className="flex items-baseline justify-between">
                <span className="label text-marker">Step {s.n}</span>
                <span className="text-5xl font-semibold tracking-[-0.05em] text-paper-3">{s.n}</span>
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
              <p className="text-ink-2">{s.text}</p>
              <pre className="mt-auto overflow-x-auto border border-rule bg-paper-2 p-4 font-mono text-[0.78rem] leading-relaxed text-ink-2">{s.specimen.join("\n")}</pre>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---------------------------------------------------------------- capabilities */}
      <Section sheet="03" title="Everything the studio does." intro="One workspace for the whole loop: brief, plan, check, change, walk, save.">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c, i) => (
            <li key={c.title} className={`border-rule ${i % 3 !== 2 ? "lg:border-r" : ""} ${i % 2 === 0 ? "sm:border-r lg:border-r" : "sm:border-r-0"} ${i % 3 === 2 ? "lg:border-r-0" : ""} border-b`}>
              <Link href={c.href} className="group flex h-full flex-col gap-4 p-5 hover:bg-paper-2 md:p-8">
                <div className="flex items-start justify-between">
                  <c.icon size={22} strokeWidth={1.4} className="text-ink" aria-hidden="true" />
                  <ArrowUpRight size={16} className="text-ink-3 transition-colors group-hover:text-marker" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">{c.title}</h3>
                <p className="text-sm text-ink-2">{c.text}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- validator */}
      <Section
        sheet="04"
        title="The validator is the referee."
        intro="Whether a change comes from your mouse, Clavis Local or a hosted AI model, the same engine checks it. This is the Sunset Loft's own room schedule, measured by that engine."
      >
        <div className="grid lg:grid-cols-[1fr_20rem]">
          <div className="overflow-x-auto border-b border-rule lg:border-b-0 lg:border-r">
            <table className="w-full min-w-[34rem] text-left">
              <caption className="sr-only">Room schedule of the Sunset Loft</caption>
              <thead>
                <tr className="label border-b border-rule text-ink-3">
                  <th className="px-5 py-3 font-normal md:px-8">Room</th>
                  <th className="px-3 py-3 text-right font-normal">Clear floor</th>
                  <th className="px-3 py-3 text-right font-normal">Daylight</th>
                  <th className="px-3 py-3 text-right font-normal">Windows</th>
                  <th className="px-5 py-3 text-right font-normal md:px-8">Doors from entrance</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-b border-rule-soft last:border-0">
                    <td className="px-5 py-3 font-medium md:px-8">{r.label}</td>
                    <td className="px-3 py-3 text-right font-mono text-sm">{r.area.toFixed(1)} m²</td>
                    <td className={`px-3 py-3 text-right font-mono text-sm ${r.habitable && r.daylightRatio < 0.1 ? "text-marker" : ""}`}>{r.windows.length ? `${Math.round(r.daylightRatio * 100)} %` : "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-sm">{r.windows.length}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm md:px-8">{r.depth ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col justify-between gap-8 p-5 md:p-8">
            <div>
              <p className="label text-ink-3">Findings</p>
              <p className="mt-3 text-5xl font-semibold tracking-[-0.04em]">
                {counts.error} <span className="text-ink-3">/</span> {counts.warning}
              </p>
              <p className="label mt-2 text-ink-2">errors / warnings</p>
            </div>
            <p className="text-sm text-ink-2">
              {analysis.metrics.carpetArea.toFixed(1)} m² of clear floor in a {analysis.metrics.envelope!.w.toFixed(1)} × {analysis.metrics.envelope!.h.toFixed(1)} m footprint. Rules of thumb for early design, not a building-code review.
            </p>
            <ButtonLink href="/features/validation" variant="outline">
              All {CHECK_COUNT} checks
            </ButtonLink>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- assistants */}
      <Section sheet="05" title="Two assistants, one referee." intro="Clavis Local answers first, in your browser, with no key and nothing sent anywhere. What it doesn't understand goes to a hosted model. Either way you see a checked preview before anything changes.">
        <div className="grid md:grid-cols-2">
          {[
            { tag: "In your browser", name: "Clavis Local", points: ["Designs homes from a brief", "Furnishes, repairs and resizes rooms", "Answers questions with measured numbers", "Instant, private, free"] },
            { tag: "On the server", name: "Hosted model", points: ["Free-form requests in your own words", "Proposes edits as validated operations", "Explains what changed and why", "Key stays on the server"] },
          ].map((a, i) => (
            <div key={a.name} className={`border-rule p-5 md:p-8 ${i === 0 ? "border-b md:border-b-0 md:border-r" : ""}`}>
              <p className="label text-ink-3">{a.tag}</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">{a.name}</h3>
              <ul className="mt-6 divide-y divide-rule-soft border-y border-rule-soft">
                {a.points.map((p) => (
                  <li key={p} className="flex items-center gap-3 py-3 text-ink-2">
                    <span className="h-1.5 w-1.5 bg-marker" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- start */}
      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-16 md:grid-cols-[1fr_minmax(0,36rem)] md:px-8 md:py-24">
          <div>
            <p className="label text-paper/50">Sheet 06</p>
            <h2 className="mt-4 text-balance text-4xl font-semibold uppercase leading-[0.95] tracking-[-0.035em] md:text-6xl">Start with a sentence.</h2>
          </div>
          <div className="self-end">
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
