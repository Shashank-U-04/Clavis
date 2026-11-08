import { useEffect, useRef, useState, type ReactNode } from "react";
import { actions, logActivity, store, useAppStore } from "../model/store";
import { sunsetLoftModel, templateModel } from "../model/templates";
import { downloadDocument } from "../model/persistence";
import { downloadText, planToSvg, safeName } from "../export/planSvg";
import { sendCommand } from "../three/events";
import { projectActions } from "./projects";
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

export function Header() {
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
      <div className="brand" title="Clavis — design a home in plain language, checked by geometry">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path d="M3 10.5 12 3l9 7.5V21H3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="14" r="2.6" fill="currentColor" />
        </svg>
        <span>Clavis</span>
      </div>
      <PlanName />
      <SaveStatus />

      <div className="hdr-group">
        <Menu label="New">
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
          <button onClick={() => projectActions.newFrom(templateModel(), "Started from the compact two-bedroom template (hand-made, not AI output).")}>
            Template: compact two-bedroom
          </button>
          <button onClick={() => projectActions.newFrom(sunsetLoftModel(), "Opened the Sunset Loft showcase home.")}>Showcase: Sunset Loft</button>
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
