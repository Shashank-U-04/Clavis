import { useMemo, useState } from "react";
import { actions, useAppStore } from "../model/store";
import { CATALOG, CATEGORIES, type CatalogCategory } from "../model/catalog";
import { thumbnailFor } from "../three/thumbnails";

const TOOLS = [
  { mode: "select", label: "Select", key: "V", icon: "M5 3l14 8-6 2-2 6z" },
  { mode: "wall", label: "Wall", key: "W", icon: "M3 17h18M3 7h18M3 7v10M21 7v10" },
  { mode: "room", label: "Room", key: "M", icon: "M4 4h16v16H4z" },
  { mode: "door", label: "Door", key: "D", icon: "M5 21V4h9v17M14 4a9 9 0 0 1 0 17" },
  { mode: "window", label: "Window", key: "N", icon: "M4 6h16v12H4zM12 6v12M4 12h16" },
] as const;

const CAT_LABEL: Record<CatalogCategory, string> = {
  living: "Living",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bath: "Bath",
  office: "Office",
  decor: "Decor",
};

export function LeftRail() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const placing = useAppStore((s) => s.editor.placingKind);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CatalogCategory | null>(null);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CATALOG.filter((c) => (!cat || c.category === cat) && (!t || c.label.toLowerCase().includes(t) || c.kind.includes(t) || c.tags?.some((x) => x.includes(t))));
  }, [q, cat]);

  return (
    <aside className="rail">
      <div className="rail-section">
        <div className="rail-title">Draw</div>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.mode}
              className={`tool ${mode === t.mode ? "active" : ""}`}
              onClick={() => actions.setDrawMode(t.mode)}
              title={`${t.label} (${t.key})`}
              data-tool={t.mode}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rail-section grow">
        <div className="rail-title">Furniture</div>
        <input className="search" placeholder="Search furniture…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search furniture" />
        <div className="chips">
          <button className={`chip ${cat === null ? "active" : ""}`} onClick={() => setCat(null)}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(cat === c ? null : c)}>
              {CAT_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="catalog">
          {items.map((c) => {
            const thumb = thumbnailFor(c.kind);
            return (
              <button
                key={c.kind}
                className={`cat-item ${mode === "place" && placing === c.kind ? "active" : ""}`}
                onClick={() => actions.setDrawMode("place", c.kind)}
                title={`${c.label} — ${c.w} × ${c.d} × ${c.h} m (nominal). Click, then click on the plan or the 3D floor.`}
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
      </div>
    </aside>
  );
}
