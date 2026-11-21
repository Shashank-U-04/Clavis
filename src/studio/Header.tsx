/**
 * The studio's one bar: where you are (the plan and whether it is saved), one File menu for
 * everything about the plan, undo and redo, which views are on screen, and the assistant,
 * theme and shortcuts. Everything else lives in the views themselves.
 */

import { useAccount } from "@/lib/account/bridge";
import { auth, herePath } from "@/lib/auth/client";
import { authConfigured } from "@/lib/auth/config";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { actions, logActivity, store, useAppStore } from "../model/store";
import { findTemplate, makerText } from "../lib/catalogue";
import { buildTemplate } from "../lib/buildTemplate";
import { downloadDocument } from "../model/persistence";
import { downloadText, planToSvg, safeName } from "../export/planSvg";
import { sendCommand } from "../three/events";
import { projectActions, useProjects } from "./projects";
import { featureActions, setUi, ui, useResolvedTheme, useUi } from "./uiStore";
import { countViews, featureOn, type Feature } from "./views";
import { useSession } from "../ai/session";

/** A popover that closes on outside click and Escape. */
function usePopover() {
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
  return { open, setOpen, ref };
}

export function Menu({ label, children, align = "left", title }: { label: ReactNode; children: ReactNode; align?: "left" | "right"; title?: string }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="menu" ref={ref}>
      <button className={open ? "active" : ""} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={title}>
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

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

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
  const { account } = useAccount();
  const where = account ? "Saved here and synced to your account" : "Saved in this browser (sign in to keep it on every device)";
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  if (save.state === "error") return <span className="save err" title={save.message}>⚠ Not saved</span>;
  if (save.state === "saved") {
    const s = Math.round((Date.now() - save.at) / 1000);
    return <span className="save ok" title={where}>✓ Saved{s > 20 ? ` ${s < 3600 ? `${Math.round(s / 60) || 1} min ago` : "earlier"}` : ""}</span>;
  }
  return <span className="save">Not saved yet</span>;
}

/** Start a plan from a catalogue template, saying what made it. */
export function startTemplate(slug: string) {
  const t = findTemplate(slug);
  if (t) projectActions.newFrom(buildTemplate(t.slug), `Started from the ${t.name} template (${makerText(t.maker).toLowerCase()}, not AI output).`, `template:${t.slug}`);
}

/** Name and keep the design as it is now; opened from the File menu. */
function VersionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  return (
    <form
      className="menu-pop left version-pop"
      onSubmit={(e) => {
        e.preventDefault();
        if (projectActions.saveVersion(label || `Version of ${new Date().toLocaleString()}`)) onSaved();
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <label htmlFor="version-label">Name this version</label>
      <input id="version-label" autoFocus value={label} maxLength={80} placeholder="e.g. Before moving the kitchen" onChange={(e) => setLabel(e.target.value)} />
      <button className="primary" type="submit">
        Save version
      </button>
      <small className="muted">Versions are kept with the plan. Checkpoints are also taken while you work.</small>
    </form>
  );
}

function FileMenu() {
  const currentId = useProjects((s) => s.currentId);
  const scene = useUi((s) => s.views.scene);
  const version = usePopover();
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const exportSvg = () => {
    const m = store.getState().model;
    downloadText(planToSvg(m, { date: new Date().toISOString().slice(0, 10) }), `${safeName(m.name)}.svg`, "image/svg+xml");
    logActivity("human", "export_svg", "Plan drawing exported as SVG.");
  };
  const describe = () => {
    projectActions.newBlank();
    setUi({ rightTab: "assistant" });
    setTimeout(() => document.querySelector<HTMLTextAreaElement>("#assistant-input")?.focus(), 50);
  };

  return (
    <div className="menu" ref={version.ref}>
      <Menu label={saved ? "✓ Version saved" : "File"} title="New, open, save a version, export">
        <p className="menu-label">New</p>
        <a href="/new">New plan…</a>
        <button onClick={describe}>Describe a home…</button>
        <button onClick={() => projectActions.newBlank()}>Blank plan</button>
        <button onClick={() => startTemplate("sunset-loft")}>Showcase: Sunset Loft</button>
        <a href="/templates">From a template…</a>
        <hr />
        <p className="menu-label">This plan</p>
        <button onClick={() => version.setOpen(true)}>Save version…</button>
        <button onClick={() => projectActions.duplicate()}>Duplicate</button>
        <a href={`/plans/${encodeURIComponent(currentId)}`}>Versions and history</a>
        <button onClick={() => fileRef.current?.click()}>Open a design file…</button>
        <hr />
        <p className="menu-label">Export</p>
        <button onClick={() => downloadDocument(store.getState().model, store.getState().notes)}>Design file (.json)</button>
        <button onClick={exportSvg}>Plan drawing (.svg)</button>
        <button disabled={!scene} title={scene ? undefined : "Show the 3D view to export from it"} onClick={() => sendCommand("export-png")}>
          3D snapshot (.png)
        </button>
        <button disabled={!scene} title={scene ? undefined : "Show the 3D view to export from it"} onClick={() => sendCommand("export-obj")}>
          3D model (.obj)
        </button>
        <hr />
        <a href="/plans">All plans</a>
        <a href="/dashboard">Home</a>
      </Menu>
      {version.open && (
        <VersionForm
          onClose={() => version.setOpen(false)}
          onSaved={() => {
            version.setOpen(false);
            setSaved(true);
          }}
        />
      )}
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
    </div>
  );
}

const FEATURE_BUTTONS: { f: Feature; label: string; n: string; icon: string; tip: string }[] = [
  { f: "plan", label: "2D Plan", n: "1", icon: "M4 4h16v16H4zM4 11h8M12 4v16", tip: "the 2D layout builder" },
  { f: "model", label: "3D Model", n: "2", icon: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5", tip: "the 3D model (orbit or top view)" },
  { f: "walk", label: "Walk", n: "3", icon: "M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 22l2-7 3 3v4M8 12l2-4h4l2 4 3 1M12 8l-1 5", tip: "the first-person walk-through" },
  { f: "chat", label: "Chat", n: "4", icon: "M4 5h16v11H9l-5 4z", tip: "the chat with the assistant" },
];

/** The studio's four features: any mix on screen, from all of them down to one. */
function ViewSwitch() {
  const views = useUi((s) => s.views);
  const walking = useAppStore((s) => s.editor.camera === "walk");
  const screen = { views, walk: walking };
  return (
    <div className="views" role="group" aria-label="What is on screen">
      {FEATURE_BUTTONS.map((b) => {
        const on = featureOn(screen, b.f);
        const last = on && countViews(views) === 1;
        const shared = b.f === "model" || b.f === "walk" ? " The 3D model and the walk share the 3D view." : "";
        return (
          <button
            key={b.f}
            className={`view ${on ? "on" : ""}`}
            aria-pressed={on}
            onClick={() => featureActions.toggle(b.f)}
            onDoubleClick={() => featureActions.solo(b.f)}
            title={`${on ? (last ? `${b.label} is the only view on screen` : `Hide ${b.tip}`) : `Show ${b.tip}`} (${b.n}). Double-click to show it alone.${shared}`}
          >
            <Icon d={b.icon} />
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const SUN = "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";
const MOON = "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z";

function ThemeButton() {
  const now = useResolvedTheme();
  const next = now === "light" ? "dark" : "light";
  return (
    <button className="icon-btn" onClick={() => setUi({ theme: next })} aria-label={`Switch to the ${next} theme`} title={`Switch to the ${next} theme`}>
      <Icon d={now === "light" ? MOON : SUN} />
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ["1 · 2 · 3 · 4", "2D plan, 3D model, walk, chat"],
  ["0", "Plan, model and chat together"],
  ["V W M D N", "Select, wall, room, door, window"],
  ["L", "Library: rooms and furniture"],
  ["F", "Fit the plan to the window"],
  ["R · Shift R", "Turn the selected piece"],
  ["Arrows", "Nudge the selected piece"],
  ["Delete", "Remove the selection"],
  ["Ctrl Z · Ctrl Y", "Undo · redo"],
  ["W A S D · drag", "Walk and look, in Walk"],
  ["Esc", "Leave the walk; back to Select"],
];

function Shortcuts() {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="menu" ref={ref}>
      <button className={`icon-btn ${open ? "active" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
        <Icon d="M3 7h18v11H3zM7 11h1M11 11h1M15 11h2M7 14h10" />
      </button>
      {open && (
        <div className="menu-pop right shortcuts" role="dialog" aria-label="Keyboard shortcuts">
          <p className="menu-label">Keyboard</p>
          <dl>
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

const GoogleG = () => (
  <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

/**
 * Who you are, in the studio too: a guest gets one Google button that brings this plan (and
 * every other one made here) into an account and comes straight back; someone signed in sees
 * their initial and whether the cloud copy is up to date.
 */
function AccountChip() {
  const { account, sync } = useAccount();
  const [busy, setBusy] = useState(false);
  if (!authConfigured()) return null;
  if (!account)
    return (
      <button
        className="acct guest"
        disabled={busy}
        title="Sign in with Google: this plan and the others you made here come with you, on every device"
        onClick={async () => {
          setBusy(true);
          const r = await auth.signInWithGoogle(herePath());
          if (!r.ok) setBusy(false);
        }}
      >
        <GoogleG />
        {busy ? "Opening Google…" : "Sign in"}
      </button>
    );
  const state = sync.state === "synced" ? "synced" : sync.state === "syncing" ? "syncing…" : sync.state === "offline" ? "not synced yet, kept here" : "";
  return (
    <a className="acct" href="/profile" title={`${account.email} · ${state}`} aria-label={`Your account, ${account.email}, ${state}`}>
      <span className="avatar">{(account.name || account.email).trim().charAt(0).toUpperCase()}</span>
      <span className={`sync-dot ${sync.state}`} aria-hidden />
    </a>
  );
}

export function Header() {
  const canUndo = useAppStore((s) => s.undoStack.length > 0);
  const canRedo = useAppStore((s) => s.redoStack.length > 0);
  const provider = useSession((s) => s.provider);
  const hosted = useSession((s) => s.hosted);

  return (
    <header className="hdr">
      <div className="hdr-left">
        <a className="brand" href="/dashboard" title="Back to your plans">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
            <path d="M25.5 11V6.5H6.5v19h19V21" fill="none" stroke="var(--ink)" strokeWidth="5" />
            <path d="M25.5 21h-10a10 10 0 0 1 10-10z" fill="var(--accent)" />
          </svg>
          <span className="sr-only">Clavis: your plans</span>
        </a>
        <div className="hdr-plan">
          <PlanName />
          <SaveStatus />
        </div>
        <FileMenu />
        <div className="hdr-history">
          <button
            className="icon-btn"
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            onClick={() => {
              const r = actions.undo();
              logActivity("human", "undo", r.summary, r.ok);
            }}
          >
            <Icon d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
          </button>
          <button
            className="icon-btn"
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            onClick={() => {
              const r = actions.redo();
              logActivity("human", "redo", r.summary, r.ok);
            }}
          >
            <Icon d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
          </button>
        </div>
      </div>

      <ViewSwitch />

      <div className="hdr-right">
        <button className={`pill ${provider === "server" ? "server" : "local"}`} onClick={() => setUi({ rightTab: "project" })} title="Which assistant is answering — change it in Project → Assistant">
          {provider === "local" ? "● Clavis Local" : provider === "server" ? `● ${hosted?.label ?? "Hosted model"}` : hosted?.configured ? `● Local + ${hosted.label}` : "● Clavis Local"}
        </button>
        <ThemeButton />
        <Shortcuts />
        <AccountChip />
      </div>
    </header>
  );
}

/** The features as keys: 1 2 3 4 for plan, model, walk and chat; 0 for all; L for furniture. */
export function viewKey(key: string): boolean {
  const map: Record<string, Feature> = { "1": "plan", "2": "model", "3": "walk", "4": "chat" };
  if (map[key]) return featureActions.toggle(map[key]), true;
  if (key === "0") return featureActions.all(), true;
  if (key === "l" || key === "L") return setUi({ library: !ui.getState().library }), true;
  return false;
}
