import { useEffect, useRef, useState, type ReactNode } from "react";
import { actions, logActivity, store, useAppStore } from "../model/store";
import { findTemplate, makerText } from "../lib/catalogue";
import { buildTemplate } from "../lib/buildTemplate";
import { downloadDocument } from "../model/persistence";
import { downloadText, planToSvg, safeName } from "../export/planSvg";
import { sendCommand } from "../three/events";
import { projectActions, useProjects } from "./projects";
import { setUi, useUi, type Layout } from "./uiStore";
import { useSession } from "../ai/session";

export function Menu({ label, children, align = "left" }: { label: ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={open ? "active" : ""} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {label} <span className="caret">▾</span>
      </button>
      {open && (
        <div className={`menu-pop ${align}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function PlanName() {
  const name = useAppStore((s) => s.model.name);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== name) {
      const r = actions.setPlanName(v);
      logActivity("human", "rename_plan", r.summary, r.ok);
    } else setDraft(name);
  };
  return (
    <input
      className="plan-name"
      aria-label="Design name"
      value={draft}
      maxLength={80}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(name);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function SaveStatus() {
  const save = useAppStore((s) => s.save);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  if (save.state === "error") return <span className="save err" title={save.message}>⚠ Not saved</span>;
  if (save.state === "saved") {
    const s = Math.round((Date.now() - save.at) / 1000);
    return <span className="save ok" title="Saved in this browser">✓ Saved{s > 20 ? ` ${s < 3600 ? `${Math.round(s / 60) || 1} min ago` : "earlier"}` : ""}</span>;
  }
  return <span className="save">Not saved yet</span>;
}

/** Start a plan from a catalogue template, saying what made it. */
export function startTemplate(slug: string) {
  const t = findTemplate(slug);
  if (t) projectActions.newFrom(buildTemplate(t.slug), `Started from the ${t.name} template (${makerText(t.maker).toLowerCase()}, not AI output).`, `template:${t.slug}`);
}

/** Save the design as a named version, from a small form under the button. */
function SaveVersion() {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2200);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <div className="menu" ref={ref}>
      <button className={open ? "active" : ""} onClick={() => setOpen(!open)} aria-expanded={open} title="Keep the design as it is now, to come back to">
        {done ? "✓ Version saved" : "Save version"}
      </button>
      {open && (
        <form
          className="menu-pop left version-pop"
          onSubmit={(e) => {
            e.preventDefault();
            if (projectActions.saveVersion(label || `Version of ${new Date().toLocaleString()}`)) {
              setOpen(false);
              setLabel("");
              setDone(true);
            }
          }}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <label htmlFor="version-label">Name this version</label>
          <input id="version-label" autoFocus value={label} maxLength={80} placeholder="e.g. Before moving the kitchen" onChange={(e) => setLabel(e.target.value)} />
          <button className="primary" type="submit">
            Save version
          </button>
          <small className="muted">Versions are kept with the plan. Checkpoints are also taken while you work.</small>
        </form>
      )}
    </div>
  );
}

export function Header() {
  const currentId = useProjects((s) => s.currentId);
  const canUndo = useAppStore((s) => s.undoStack.length > 0);
  const canRedo = useAppStore((s) => s.redoStack.length > 0);
  const layout = useUi((s) => s.layout);
  const provider = useSession((s) => s.provider);
  const hosted = useSession((s) => s.hosted);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportSvg = () => {
    const m = store.getState().model;
    downloadText(planToSvg(m, { date: new Date().toISOString().slice(0, 10) }), `${safeName(m.name)}.svg`, "image/svg+xml");
    logActivity("human", "export_svg", "Plan drawing exported as SVG.");
  };

  return (
    <header className="hdr">
      <a className="brand" href="/dashboard" title="Back to your plans">
        <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
          <path d="M25.5 11V6.5H6.5v19h19V21" fill="none" stroke="var(--ink)" strokeWidth="5" />
          <path d="M25.5 21h-10a10 10 0 0 1 10-10z" fill="#5b78ff" />
        </svg>
        <span>Clavis</span>
      </a>
      <PlanName />
      <SaveStatus />

      <div className="hdr-group">
        <Menu label="Plan">
          <a href={`/plans/${encodeURIComponent(currentId)}`}>Versions and history</a>
          <button onClick={() => projectActions.duplicate()}>Duplicate this plan</button>
          <hr />
          <a href="/plans">All plans</a>
          <a href="/dashboard">Home</a>
        </Menu>
        <SaveVersion />
        <Menu label="New">
          <a href="/new">New plan…</a>
          <hr />
          <button onClick={() => projectActions.newBlank()}>Blank plan</button>
          <button
            onClick={() => {
              projectActions.newBlank();
              setUi({ rightTab: "assistant" });
              setTimeout(() => document.querySelector<HTMLTextAreaElement>("#assistant-input")?.focus(), 50);
            }}
          >
            Describe a home…
          </button>
          <hr />
          <button onClick={() => startTemplate("compact-two-bedroom")}>Template: compact two-bedroom</button>
          <button onClick={() => startTemplate("sunset-loft")}>Showcase: Sunset Loft</button>
          <a href="/templates">All templates…</a>
        </Menu>
        <button onClick={() => fileRef.current?.click()} title="Open a .clavis.json design file">
          Open
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void projectActions.importFile(f);
            e.target.value = "";
          }}
        />
        <Menu label="Export">
          <button onClick={() => downloadDocument(store.getState().model, store.getState().notes)}>Design file (.json)</button>
          <button onClick={exportSvg}>Plan drawing (.svg)</button>
          <hr />
          <button disabled={layout === "plan"} onClick={() => sendCommand("export-png")}>3D snapshot (.png)</button>
          <button disabled={layout === "plan"} onClick={() => sendCommand("export-obj")}>3D model (.obj)</button>
        </Menu>
      </div>

      <div className="hdr-group">
        <button
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          onClick={() => {
            const r = actions.undo();
            logActivity("human", "undo", r.summary, r.ok);
          }}
        >
          ↶ Undo
        </button>
        <button
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          onClick={() => {
            const r = actions.redo();
            logActivity("human", "redo", r.summary, r.ok);
          }}
        >
          ↷ Redo
        </button>
      </div>

      <div className="seg" role="group" aria-label="Layout">
        {(["plan", "split", "3d"] as Layout[]).map((l) => (
          <button key={l} className={layout === l ? "active" : ""} onClick={() => setUi({ layout: l })}>
            {l === "plan" ? "Plan" : l === "split" ? "Split" : "3D"}
          </button>
        ))}
      </div>

      <button className={`pill ${provider === "server" ? "server" : "local"}`} onClick={() => setUi({ rightTab: "project" })} title="Which assistant is answering — change it in Project → Assistant">
        {provider === "local"
          ? "● Clavis Local"
          : provider === "server"
            ? `● ${hosted?.label ?? "Hosted model"}`
            : hosted?.configured
              ? `● Local + ${hosted.label}`
              : "● Clavis Local"}
      </button>
    </header>
  );
}
