import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site/PageHeader";
import { EXAMPLES } from "@/ai/local/engine";
import { MCP_TOOLS } from "@/components/mcp/tools";

export const metadata: Metadata = {
  title: "Docs",
  description: "Getting started with Clavis: designing from a brief, drawing by hand, the assistant, connecting an AI agent over MCP, shortcuts and limits.",
};

const TOC = [
  ["start", "Getting started"],
  ["drawing", "Building by hand"],
  ["assistant", "The assistant"],
  ["mcp", "AI agents (MCP)"],
  ["review", "Reading the review"],
  ["views", "Plan, model, walk and chat"],
  ["shortcuts", "Shortcuts"],
  ["limits", "Limits"],
];

const SHORTCUTS = [
  ["1 / 2 / 3 / 4", "Show or hide the 2D plan, the 3D model, the walk and the chat"],
  ["0", "Plan, model and chat together; double-click a button to show one alone"],
  ["L", "Open or close the library beside the list"],
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
  ["W A S D (in Walk)", "Move; Shift runs, Space jumps; drag turns the camera; scroll in for first person; Esc to leave"],
  ["E (in Walk)", "Open or close the nearest door (or click it); a shut door stops you"],
];

const VIEWS = [
  ["1", "2D Plan", "The layout builder: draw walls, rooms, doors and windows, and arrange furniture, all in metres."],
  ["2", "3D Model", "The same design standing up. Orbit around it or look straight down; it follows every edit."],
  ["3", "Walk", "Step in at the front door with a figure 1.75 m tall and walk through, room by room: from just behind it, or scroll in to see through its eyes. Full screen for a closer look."],
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
                A new plan opens with two ways in. <b>Describe it</b>: set the bedrooms, bathrooms, kitchen and size with a few buttons, read back exactly what Clavis will lay out, and press <b>Design from these choices</b> — or type it in your own words. Clavis proposes a furnished plan and shows it on the plan in green; nothing changes until you press <b>Apply</b>.
              </p>
              <p>
                <b>Build it yourself</b>: place ready-made rooms, then add doors, windows and furniture, with a guide on the plan ticking off each step. Prefer a starting point? Pick one of the seven homes in{" "}
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
              <H id="drawing">Building by hand</H>
              <p>Press <b>Rooms</b> in the strip down the left of the studio (or <b>L</b>) and pick a ready-made room — bedroom, kitchen, bathroom, hall and more — then click on the plan. Each room arrives with its walls; dropped beside another it snaps flush and the two share a wall, and it is never left on top of another room. The <b>Room</b> tool does the same for a rectangle you drag out yourself.</p>
              <p>Then use <b>Door</b> and <b>Window</b> and click on walls. The list down the left names everything a home is made of: walls, rooms, doors, windows, stairs, then the furniture room by room. Pick one to see what there is, set its size if you like, then click the plan or the 3D floor — or let the guide's <b>Furnish rooms</b> fill every empty room with pieces that fit. The <b>Guide</b> button shows the steps and ticks them off. Everything snaps to 5 cm; select anything to edit its exact numbers in the <b>Details</b> tab, and drag pieces to move them (a whole drag is one undo step).</p>
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
                <b>Clavis Local</b> runs in your browser and understands a set of requests about whole homes, rooms, furniture, openings, floors, names, repairs and questions. In <b>Auto</b> mode, anything it does not understand goes to a hosted AI model; choose <b>Clavis Local</b> in Settings to keep every request in your browser. Some things to try:
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
              <H id="mcp">AI agents (MCP)</H>
              <p>
                An AI agent you already use can work on your plans through <b>MCP</b>, the Model Context Protocol. Open <b>MCP</b> at the top right of the app or the studio (or <b>Settings → MCP</b>), make a token, and paste the config it shows into your agent’s MCP settings. The server is <code className="font-mono text-sm">/api/mcp</code> on this site, over streamable HTTP, with the token sent as <code className="font-mono text-sm">Authorization: Bearer clv_…</code>.
              </p>
              <dl className="divide-y divide-rule-soft border-y border-rule">
                {MCP_TOOLS.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[11rem_1fr] gap-4 py-2.5 text-sm">
                    <dt className="font-mono">{k}</dt>
                    <dd className="text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
              <p>
                The agent uses the same checked operations as the studio, all or nothing. A <b>read only</b> token can look but not change anything. Removing walls, rooms, furniture or a floor needs the agent to say so explicitly, and it should ask you first. Every change it saves keeps the plan’s previous state as a version (Plans → the plan → Versions), and shows in your history. You can revoke a token at any time.
              </p>
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
              <p>Clavis is for early design. Rooms are rectangles; a home can have several floors joined by stairs. When the assistant adds or removes a room it lays the floor out again rather than moving single walls. Its size, daylight and escape-window checks are rules of thumb, not a building-code review, and furniture sizes are typical rather than those of a specific product. Nothing it produces is a construction document.</p>
            </section>
          </article>
        </div>
      </div>
    </>
  );
}
