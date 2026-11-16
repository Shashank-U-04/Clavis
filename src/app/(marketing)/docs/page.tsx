import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { EXAMPLES } from "@/ai/local/engine";

export const metadata: Metadata = {
  title: "Docs",
  description: "Getting started with Clavis: designing from a brief, drawing by hand, the assistant, shortcuts and limits.",
};

const TOC = [
  ["start", "Getting started"],
  ["drawing", "Drawing by hand"],
  ["assistant", "The assistant"],
  ["review", "Reading the review"],
  ["views", "Plan, model, walk and chat"],
  ["shortcuts", "Shortcuts"],
  ["limits", "Limits"],
];

const SHORTCUTS = [
  ["1 / 2 / 3 / 4", "Show or hide the 2D plan, the 3D model, the walk and the chat"],
  ["0", "Plan, model and chat together; double-click a button to show one alone"],
  ["L", "Open or close the furniture drawer"],
  ["V", "Select"],
  ["W", "Draw walls (click to chain, Esc to stop)"],
  ["M", "Draw a room (drag a rectangle)"],
  ["D / N", "Add a door / window (click a wall)"],
  ["R / Shift R", "Turn the selected piece 90° clockwise / back"],
  ["Arrows / Shift arrows", "Nudge the selected piece 5 cm / 25 cm"],
  ["Delete", "Remove the selection"],
  ["F", "Fit the plan to the window"],
  ["Ctrl Z / Ctrl Y", "Undo / redo"],
  ["Esc", "Back to Select, clear highlights"],
  ["W A S D (in Walk)", "Walk; drag to look; Esc to leave"],
];

const VIEWS = [
  ["1", "2D Plan", "The layout builder: draw walls, rooms, doors and windows, and arrange furniture, all in metres."],
  ["2", "3D Model", "The same design standing up. Orbit around it or look straight down; it follows every edit."],
  ["3", "Walk", "Step in at the front door at eye height and walk through, room by room. Full screen for a closer look."],
  ["4", "Chat", "Ask for a home, a change or a check. Every answer is a checked preview until you press Apply."],
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-b border-rule pb-3 text-2xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

export default function DocsPage() {
  return (
    <>
      <PageHeader trail={[{ href: "/docs", label: "Docs" }]} title="Using Clavis." intro="Everything you need to design your first home, in about five minutes of reading." />
      <div className="border-b border-rule">
        <div className="mx-auto grid max-w-[1440px] md:grid-cols-[14rem_1fr]">
          <nav aria-label="On this page" className="border-b border-rule p-5 md:sticky md:top-16 md:h-fit md:border-b-0 md:p-8">
            <p className="label text-ink-3">On this page</p>
            <ol className="mt-4 space-y-2 text-sm">
              {TOC.map(([id, t]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-ink-2 hover:text-marker">
                    {t}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="max-w-3xl space-y-14 border-rule p-5 md:border-l md:p-12 [&_p]:text-ink-2 [&_p]:leading-relaxed">
            <section className="space-y-4">
              <H id="start">Getting started</H>
              <p>
                Choose <Link href="/new" className="text-ink underline underline-offset-4 hover:text-marker">New plan</Link> → <b>Describe it</b> and write the home you want — for example “a two-bedroom flat with an open kitchen, about 70 m²”. Clavis proposes a furnished plan and shows it on the plan in green. Read the card, then press <b>Apply</b>. Nothing changes until you do.
              </p>
              <p>
                Prefer a starting point? Pick one of the seven homes in{" "}
                <Link href="/templates" className="text-ink underline underline-offset-4 hover:text-marker">
                  Templates
                </Link>
                . Your work saves itself in this browser as you go, and every plan waits for you on{" "}
                <Link href="/dashboard" className="text-ink underline underline-offset-4 hover:text-marker">
                  Home
                </Link>{" "}
                with its versions and history.
              </p>
            </section>
            <section className="space-y-4">
              <H id="drawing">Drawing by hand</H>
              <p>Pick a tool from the strip down the left of the studio. Walls chain from click to click; rooms are dragged out as rectangles; doors and windows go wherever you click on a wall. Everything snaps to 5 cm. Select anything to edit its exact numbers in the <b>Details</b> tab.</p>
              <p>For furniture, press <b>Furniture</b> at the foot of the strip (or <b>L</b>) to open the catalogue: pick a piece, then click the plan or the 3D floor. Drag pieces to move them; a whole drag is one undo step.</p>
            </section>
            <section className="space-y-4">
              <H id="views">Plan, model, walk and chat</H>
              <p>The studio does four things, and the bar along its top has a button for each. Show any mix of them, or double-click one to give it the whole screen; <b>All</b> brings back the plan, the model and the chat together.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {VIEWS.map(([k, t, d]) => (
                  <li key={t} className="border border-rule bg-paper-2 px-3 py-2 text-sm">
                    <span className="font-mono text-marker">{k}</span> <b>{t}</b>
                    <span className="mt-1 block text-ink-2">{d}</span>
                  </li>
                ))}
              </ul>
              <p>The 3D model and the walk share one 3D view, so choosing one switches it from the other.</p>
            </section>
            <section className="space-y-4">
              <H id="assistant">The assistant</H>
              <p>
                <b>Clavis Local</b> runs in your browser and understands a set of requests about whole homes, rooms, furniture, openings, floors, names, repairs and questions. In <b>Auto</b> mode, anything it does not understand goes to a hosted model if the server has one. Some things to try:
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {EXAMPLES.map((e) => (
                  <li key={e} className="border border-rule bg-paper-2 px-3 py-2 font-mono text-sm text-ink-2">
                    {e}
                  </li>
                ))}
              </ul>
              <p>Changes that remove or replace work — regenerating the layout to add a bedroom, for example — ask you to confirm before Apply is enabled.</p>
            </section>
            <section className="space-y-4">
              <H id="review">Reading the review</H>
              <p>
                The <b>Review</b> tab lists errors, warnings and notes. Click a finding to highlight what it is about; <b>Fix this</b> or <b>Fix all</b> asks for a repair you can preview first. The room table shows each room&apos;s floor area, its glazing as a share of the floor, and how many doors it is from the entrance — click that number to see the route on the plan. See <Link href="/features/validation" className="text-ink underline underline-offset-4 hover:text-marker">every check</Link>.
              </p>
            </section>
            <section className="space-y-4">
              <H id="shortcuts">Shortcuts</H>
              <dl className="divide-y divide-rule-soft border-y border-rule">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[11rem_1fr] gap-4 py-2.5 text-sm">
                    <dt className="font-mono">{k}</dt>
                    <dd className="text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="space-y-4">
              <H id="limits">Limits</H>
              <p>Clavis is a concept-design tool. It draws single-storey homes with rectangular rooms, and structural changes regenerate the layout rather than moving individual walls. Its sizes, daylight and escape-window checks are early-design rules of thumb, not a building-code review, and furniture sizes are typical rather than of a specific product. Nothing it produces is a construction document.</p>
            </section>
          </article>
        </div>
      </div>
    </>
  );
}
