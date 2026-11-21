/**
 * What is selected, and the buttons for it, floating over the plan (or over the 3D model when
 * the plan is hidden): Turn, Details and Delete. The keys still work — R and Delete — but
 * nobody has to know them.
 */

import { useAppStore } from "../model/store";
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
