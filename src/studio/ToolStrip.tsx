/**
 * The tool strip down the left edge, and the furniture drawer beside it. The strip is always
 * small; the catalogue only takes room when it is asked for. Picking a drawing tool while the
 * plan is hidden brings the plan back, since that is where walls, rooms and openings are drawn.
 */

import { useMemo, useState } from "react";
import { actions, useAppStore } from "../model/store";
import { CATALOG, CATEGORIES, type CatalogCategory } from "../model/catalog";
import { thumbnailFor } from "../three/thumbnails";
import { setUi, ui, useUi, viewActions } from "./uiStore";

const TOOLS = [
  { mode: "select", label: "Select", key: "V", icon: "M5 3l14 8-6 2-2 6z" },
  { mode: "wall", label: "Wall", key: "W", icon: "M3 17h18M3 7h18M3 7v10M21 7v10" },
  { mode: "room", label: "Room", key: "M", icon: "M4 4h16v16H4z" },
  { mode: "door", label: "Door", key: "D", icon: "M5 21V4h9v17M14 4a9 9 0 0 1 0 17" },
  { mode: "window", label: "Window", key: "N", icon: "M4 6h16v12H4zM12 6v12M4 12h16" },
] as const;

const SOFA = "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2";

const CAT_LABEL: Record<CatalogCategory, string> = {
  living: "Living",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bath: "Bath",
  office: "Office",
  decor: "Decor",
};

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

/** Pick a drawing tool; drawing needs the plan, so show it if it was hidden. */
export function pickTool(mode: (typeof TOOLS)[number]["mode"]) {
  if (mode !== "select") viewActions.show("plan");
  actions.setDrawMode(mode);
}

export function ToolStrip() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const library = useUi((s) => s.library);
  return (
    <nav className="strip" aria-label="Tools">
      {TOOLS.map((t) => (
        <button key={t.mode} className={`tool ${mode === t.mode ? "active" : ""}`} onClick={() => pickTool(t.mode)} title={`${t.label} (${t.key})`} aria-pressed={mode === t.mode} data-tool={t.mode}>
          <Icon d={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
      <span className="strip-rule" aria-hidden="true" />
      <button className={`tool ${library ? "active" : ""}`} onClick={() => setUi({ library: !ui.getState().library })} aria-pressed={library} aria-controls="library" title="Furniture (L)">
        <Icon d={SOFA} />
        <span>Furniture</span>
      </button>
    </nav>
  );
}

export function Library() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const placing = useAppStore((s) => s.editor.placingKind);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CatalogCategory | null>(null);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CATALOG.filter((c) => (!cat || c.category === cat) && (!t || c.label.toLowerCase().includes(t) || c.kind.includes(t) || c.tags?.some((x) => x.includes(t))));
  }, [q, cat]);

  return (
    <aside className="library" id="library" aria-label="Furniture">
      <div className="library-head">
        <span className="eyebrow">Furniture · {CATALOG.length}</span>
        <button className="icon-btn" onClick={() => setUi({ library: false })} aria-label="Close furniture" title="Close (L)">
          <Icon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>
      <input className="search" placeholder="Search furniture…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search furniture" />
      <div className="chips">
        <button className={`chip ${cat === null ? "active" : ""}`} onClick={() => setCat(null)}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(cat === c ? null : c)}>
            {CAT_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="library-hint">Pick a piece, then click on the plan or the 3D floor to place it.</p>
      <div className="catalog">
        {items.map((c) => {
          const thumb = thumbnailFor(c.kind);
          return (
            <button
              key={c.kind}
              className={`cat-item ${mode === "place" && placing === c.kind ? "active" : ""}`}
              onClick={() => actions.setDrawMode("place", c.kind)}
              title={`${c.label} — ${c.w} × ${c.d} × ${c.h} m (nominal)`}
            >
              {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="swatch" style={{ background: c.color }} />}
              <span className="cat-text">
                <span>{c.label}</span>
                <small>
                  {c.w} × {c.d} m
                </small>
              </span>
            </button>
          );
        })}
        {items.length === 0 && <p className="muted small">Nothing matches “{q}”.</p>}
      </div>
    </aside>
  );
}
