/**
 * The empty plan: two ways in, side by side.
 *   Describe it — choose rooms with counters and switches (or type a sentence); the read-back
 *                 shows exactly what Clavis Local will lay out before it is asked.
 *   Build it yourself — ready-made rooms with their walls, then doors, windows and furniture,
 *                 with the guide ticking off each step.
 */

import { useState } from "react";
import { assistant, useSession } from "../ai/session";
import { actions } from "../model/store";
import { briefFor, briefSentence, briefSummary, DEFAULT_CHOICE, type BriefChoice } from "../ai/local/briefText";
import { startTemplate } from "./Header";
import { openLibrary, setUi } from "./uiStore";

function Stepper({ label, value, min, max, onChange, show = String }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; show?: (v: number) => string }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          −
        </button>
        <output aria-live="polite">{show(value)}</output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}

const Check = ({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) => (
  <label className={`check ${on ? "on" : ""}`}>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
    {label}
  </label>
);

function BriefBuilder({ go, busy }: { go: (t: string) => void; busy: boolean }) {
  const [c, setC] = useState<BriefChoice>(DEFAULT_CHOICE);
  const set = (p: Partial<BriefChoice>) => setC((x) => ({ ...x, ...p }));
  const summary = briefSummary(briefFor(c));
  return (
    <form
      className="builder"
      onSubmit={(e) => {
        e.preventDefault();
        go(briefSentence(c));
      }}
    >
      <div className="builder-grid">
        <Stepper label="Bedrooms" value={c.bedrooms} min={0} max={6} onChange={(v) => set({ bedrooms: v })} show={(v) => (v === 0 ? "Studio" : String(v))} />
        <Stepper label="Bathrooms" value={c.bathrooms} min={1} max={4} onChange={(v) => set({ bathrooms: v })} />
        <div className="stepper">
          <span>Kitchen</span>
          <div className="seg" role="radiogroup" aria-label="Kitchen">
            {(["open", "separate"] as const).map((k) => (
              <button type="button" key={k} role="radio" aria-checked={c.kitchen === k} className={c.kitchen === k ? "active" : ""} onClick={() => set({ kitchen: k })}>
                {k === "open" ? "Open" : "Separate"}
              </button>
            ))}
          </div>
        </div>
        <div className="stepper">
          <span>Size</span>
          <div className="area">
            <input type="number" min={20} max={400} step={5} value={c.area ?? ""} placeholder="auto" onChange={(e) => set({ area: e.target.value ? Math.max(20, Math.min(400, Number(e.target.value))) : null })} aria-label="Size in square metres" />
            <em>m²</em>
          </div>
        </div>
      </div>
      <div className="checks">
        <Check label="En-suite" on={c.ensuite} set={(v) => set({ ensuite: v })} />
        <Check label="Dining room" on={c.dining} set={(v) => set({ dining: v })} />
        <Check label="Study" on={c.study} set={(v) => set({ study: v })} />
        <Check label="Utility room" on={c.utility} set={(v) => set({ utility: v })} />
      </div>
      <p className="readback">
        <span className="eyebrow">Clavis will lay out</span>
        {summary.join(" · ")}
      </p>
      <button className="primary" disabled={busy}>
        Design from these choices
      </button>
    </form>
  );
}

/** Empty-plan state: describe the home, build it yourself, or start from a template. */
export function Welcome() {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const busy = useSession((s) => s.busy);
  const go = (t: string) => {
    if (!t.trim() || busy) return;
    // describing is the other way in: the guide and the library would only cover the preview
    setUi({ rightTab: "assistant", welcome: false, guide: false, library: false });
    void assistant.ask(t);
  };
  const build = () => {
    setUi({ welcome: false, guide: true });
    openLibrary("rooms", false);
    actions.setDrawMode("select");
  };
  return (
    <div className="welcome" data-testid="welcome">
      <h1>Start a home.</h1>
      <p>Clavis lays it out in metres, checks every wall, door, window and piece of furniture, and lets you walk through it.</p>
      <div className="ways">
        <section className="way">
          <p className="eyebrow">01 · Describe it</p>
          <h2>Choose the rooms; Clavis lays them out.</h2>
          <BriefBuilder go={go} busy={busy} />
          {typing ? (
            <form
              className="typed"
              onSubmit={(e) => {
                e.preventDefault();
                go(text);
              }}
            >
              <input autoFocus value={text} maxLength={2000} placeholder="e.g. a three-bedroom house with a study, 110 m²" onChange={(e) => setText(e.target.value)} aria-label="Describe a home" />
              <button className="primary" disabled={busy || !text.trim()}>
                Design it
              </button>
            </form>
          ) : (
            <button type="button" className="link" onClick={() => setTyping(true)}>
              Or type it in your own words
            </button>
          )}
        </section>
        <section className="way">
          <p className="eyebrow">02 · Build it yourself</p>
          <h2>Place rooms, then doors, windows and furniture.</h2>
          <ol className="way-steps">
            <li>Pick ready-made rooms — bedroom, kitchen, bathroom… — and click them onto the plan. Their walls come with them.</li>
            <li>Click walls to add doors and windows.</li>
            <li>Furnish every room in one click, or piece by piece.</li>
          </ol>
          <button className="primary" onClick={build}>
            Start building
          </button>
          <p className="fine">A guide on the plan ticks off each step and checks the result.</p>
        </section>
      </div>
      <div className="or">
        <span className="fine">Or start from</span>
        <button onClick={() => startTemplate("compact-two-bedroom")}>A template</button>
        <button onClick={() => startTemplate("sunset-loft")}>The Sunset Loft</button>
        <a className="btn" href="/templates">
          All templates
        </a>
      </div>
    </div>
  );
}
