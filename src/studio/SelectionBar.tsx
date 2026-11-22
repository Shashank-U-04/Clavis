/**
 * What is selected, its measurements and the buttons for it, floating over the plan (or over
 * the 3D model when the plan is hidden): type a new length, width or height straight in, or
 * Turn, Details and Delete. The keys still work — R and Delete — but nobody has to know them.
 */

import { useEffect, useState } from "react";
import { actions, logActivity, useAppStore, type ActionResult } from "../model/store";
import { itemSize } from "../model/catalog";
import type { PlanModel } from "../model/types";
import type { Selection } from "../editor/selection";
import { useSession } from "../ai/session";
import { removeSelection, selectionOf, turnSelection } from "../editor/selection";
import { setUi, useUi } from "./uiStore";

const TRASH = "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6";
const TURN = "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5";

function Glyph({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** One measurement of the selection, edited in place: Enter or leaving the field applies it. */
function Measure({ label, value, min, max, step = 0.05, apply }: { label: string; value: number; min: number; max: number; step?: number; apply: (v: number) => ActionResult }) {
  const [draft, setDraft] = useState(String(r2(value)));
  useEffect(() => setDraft(String(r2(value))), [value]);
  const commit = () => {
    const v = Number(draft);
    if (!Number.isFinite(v) || Math.abs(v - value) < 1e-6) return setDraft(String(r2(value)));
    const r = apply(Math.min(max, Math.max(min, v)));
    logActivity("human", "edit", r.summary, r.ok);
    if (!r.ok) setDraft(String(r2(value)));
  };
  return (
    <label className="sel-measure" title={`${label} in metres`}>
      <span>{label}</span>
      <input type="number" inputMode="decimal" step={step} min={min} max={max} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

/** The measurements that matter for what is selected. */
function Measurements({ sel, model }: { sel: Selection; model: PlanModel }) {
  if (sel.kind === "item") {
    const it = model.items.find((i) => i.id === sel.id);
    const size = it && itemSize(it);
    if (!it || !size) return null;
    return (
      <>
        <Measure label="W" value={size.w} min={0.1} max={12} apply={(w) => actions.resizeItem(it.id, { w })} />
        <Measure label="D" value={size.d} min={0.1} max={12} apply={(d) => actions.resizeItem(it.id, { d })} />
        <Measure label="H" value={size.h} min={0.1} max={12} apply={(h) => actions.resizeItem(it.id, { h })} />
      </>
    );
  }
  if (sel.kind === "room") {
    const r = model.rooms.find((x) => x.id === sel.id);
    if (!r) return null;
    return (
      <>
        <Measure label="W" value={r.w} min={0.5} max={40} apply={(w) => actions.updateRoom(r.id, { w })} />
        <Measure label="D" value={r.h} min={0.5} max={40} apply={(h) => actions.updateRoom(r.id, { h })} />
      </>
    );
  }
  if (sel.kind === "opening") {
    const o = model.openings.find((x) => x.id === sel.id);
    if (!o) return null;
    return (
      <>
        <Measure label="W" value={o.width} min={0.3} max={4} apply={(width) => actions.editOpening(o.id, { width })} />
        <Measure label="H" value={o.height} min={0.3} max={3} apply={(height) => actions.editOpening(o.id, { height })} />
        {o.kind === "window" && <Measure label="Sill" value={o.sill} min={0} max={2} apply={(sill) => actions.editOpening(o.id, { sill })} />}
      </>
    );
  }
  const w = model.walls.find((x) => x.id === sel.id);
  if (!w) return null;
  const len = Math.hypot(w.bx - w.ax, w.by - w.ay);
  // a new length keeps the wall's start where it is and moves its end along the same line
  const toLength = (L: number) => actions.editWall(w.id, { bx: w.ax + ((w.bx - w.ax) / len) * L, by: w.ay + ((w.by - w.ay) / len) * L });
  return (
    <>
      <Measure label="Length" value={len} min={0.2} max={100} apply={toLength} />
      <Measure label="Thick" value={w.thickness} min={0.05} max={0.5} step={0.01} apply={(thickness) => actions.editWall(w.id, { thickness })} />
      <Measure label="H" value={w.height} min={2.1} max={5} apply={(height) => actions.editWall(w.id, { height })} />
    </>
  );
}

export function SelectionBar({ where }: { where: "plan" | "scene" }) {
  const model = useAppStore((s) => s.model);
  const editor = useAppStore((s) => s.editor);
  const views = useUi((s) => s.views);
  const previewing = useSession((s) => !!s.previewTurnId);
  const sel = selectionOf(model, editor);

  // one bar at a time: on the plan when it is on screen, otherwise on the 3D model (not while walking)
  const here = where === "plan" ? views.plan : !views.plan && views.scene && editor.camera !== "walk";
  if (!sel || !here || previewing) return null;

  const isDoor = sel.kind === "opening" && sel.turnable;
  return (
    <div className={`sel-bar ${where}`} role="toolbar" aria-label={`Selected: ${sel.label}`}>
      <span className="sel-name" title={sel.label}>
        {sel.label}
      </span>
      <Measurements sel={sel} model={model} />
      {sel.turnable && (
        <button onClick={() => turnSelection()} title={isDoor ? "Change which way the door opens (R)" : "Turn a quarter (R)"}>
          <Glyph d={TURN} />
          {isDoor ? "Swing" : "Turn"}
        </button>
      )}
      <button onClick={() => setUi({ views: { ...views, side: true }, rightTab: "inspect" })} title="Sizes, finish and position">
        Details
      </button>
      <button className="danger" onClick={() => removeSelection()} title={`Delete the ${sel.label.toLowerCase()} (Delete)`}>
        <Glyph d={TRASH} />
        Delete
      </button>
    </div>
  );
}
