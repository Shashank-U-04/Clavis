/**
 * The tool strip down the left edge, and the library drawer beside it.
 *
 * The strip holds the drawing tools and two shelves: Rooms (ready-made rooms that arrive with
 * their walls) and Furniture. The drawer only takes room when a shelf is open. Picking a
 * drawing tool while the plan is hidden brings the plan back, since that is where it draws.
 */

import { useMemo, useState, type ReactNode } from "react";
import { actions, useAppStore } from "../model/store";
import { CATALOG, CATEGORIES, type CatalogCategory, type CatalogEntry } from "../model/catalog";
import { BLOCK_WALL, ROOM_BLOCKS, type RoomBlock } from "../model/blocks";
import { thumbnailFor } from "../three/thumbnails";
import { openLibrary, setUi, ui, useUi, viewActions } from "./uiStore";

const TOOLS = [
  { mode: "select", label: "Select", key: "V", icon: "M5 3l14 8-6 2-2 6z", tip: "Select, move and edit" },
  { mode: "room", label: "Room", key: "M", icon: "M4 4h16v16H4z", tip: "Drag out a room; its walls come with it" },
  { mode: "wall", label: "Wall", key: "W", icon: "M3 17h18M3 7h18M3 7v10M21 7v10", tip: "Draw single walls, click to click" },
  { mode: "door", label: "Door", key: "D", icon: "M5 21V4h9v17M14 4a9 9 0 0 1 0 17", tip: "Click a wall to put a door in it" },
  { mode: "window", label: "Window", key: "N", icon: "M4 6h16v12H4zM12 6v12M4 12h16", tip: "Click a wall to put a window in it" },
] as const;

const ROOMS_ICON = "M3 4h18v16H3zM3 12h9M12 4v16";
const SOFA = "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2";
const GUIDE = "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2";

const CAT_LABEL: Record<CatalogCategory, string> = {
  living: "Living",
  bedroom: "Bedroom",
  kitchen: "Kitchen & dining",
  bath: "Bathroom",
  office: "Office",
  decor: "Decor",
  structure: "Stairs & structure",
  outdoor: "Outdoor & pool",
};

/** The kind of piece within its room class, so a shelf reads Seating, Tables, Storage… */
function typeOf(c: CatalogEntry): string {
  const t = c.tags ?? [];
  if (c.stair) return "Stairs";
  if (t.includes("pool")) return "Pools";
  if (t.includes("paving")) return "Paving";
  if (t.includes("planting")) return "Planting";
  if (t.includes("shade")) return "Shade";
  if (t.includes("railing")) return "Railings";
  if (t.includes("facade")) return "Facade";
  if (t.includes("structure")) return "Structure";
  if (c.isRug) return "Rugs";
  if (t.includes("bed")) return "Beds";
  if (t.includes("seating")) return "Seating";
  if (t.includes("table")) return "Tables";
  if (t.includes("appliance") && !t.includes("counter")) return "Appliances";
  if (t.includes("counter")) return "Units";
  if (t.includes("fixture")) return "Fixtures";
  if (t.includes("storage") || t.includes("shelving") || t.includes("media")) return "Storage";
  return "Accessories";
}

/** Group a list by a key, keeping first-seen order. */
function groupBy<T>(list: readonly T[], key: (x: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const x of list) out.set(key(x), [...(out.get(key(x)) ?? []), x]);
  return [...out];
}

/** The room shelf in classes, as a person looks for a room. */
const ROOM_CLASSES: [string, string[]][] = [
  ["Living & dining", ["living", "living-kitchen", "dining"]],
  ["Bedrooms", ["bedroom", "main-bedroom"]],
  ["Kitchen & utility", ["kitchen", "utility"]],
  ["Bathrooms", ["bathroom", "wc"]],
  ["Work & circulation", ["study", "hall"]],
];

/** A collapsible class on a shelf: a heading with a count, then its entries. */
function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="shelf-section">
      <button className="shelf-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="shelf-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span>{title}</span>
        <small>{count}</small>
      </button>
      {open && children}
    </section>
  );
}

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
  const tab = useUi((s) => s.libraryTab);
  const guide = useUi((s) => s.guide);
  const shelf = (t: "rooms" | "furniture") => library && tab === t;
  return (
    <nav className="strip" aria-label="Tools">
      {TOOLS.map((t) => (
        <button key={t.mode} className={`tool ${mode === t.mode ? "active" : ""}`} onClick={() => pickTool(t.mode)} title={`${t.tip} (${t.key})`} aria-pressed={mode === t.mode} data-tool={t.mode}>
          <Icon d={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
      <span className="strip-rule" aria-hidden="true" />
      <button className={`tool ${shelf("rooms") ? "active" : ""}`} onClick={() => openLibrary("rooms")} aria-pressed={shelf("rooms")} aria-controls="library" title="Ready-made rooms with their walls (L)">
        <Icon d={ROOMS_ICON} />
        <span>Rooms</span>
      </button>
      <button className={`tool ${shelf("furniture") ? "active" : ""}`} onClick={() => openLibrary("furniture")} aria-pressed={shelf("furniture")} aria-controls="library" title="Furniture to place on the plan or the 3D floor">
        <Icon d={SOFA} />
        <span>Furniture</span>
      </button>
      <span className="strip-rule" aria-hidden="true" />
      <button className={`tool ${guide ? "active" : ""}`} onClick={() => setUi({ guide: !ui.getState().guide })} aria-pressed={guide} title="Step-by-step guide to building a plan">
        <Icon d={GUIDE} />
        <span>Guide</span>
      </button>
    </nav>
  );
}

/** A room drawn to scale, as a small plan of itself. */
function RoomGlyph({ w, h }: { w: number; h: number }) {
  const s = 30 / Math.max(w, h);
  return (
    <svg width="40" height="40" viewBox="-5 -5 40 40" aria-hidden className="room-glyph">
      <rect x={(30 - w * s) / 2} y={(30 - h * s) / 2} width={w * s} height={h * s} />
    </svg>
  );
}

function RoomShelf() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const placing = useAppStore((s) => s.editor.placingKind);
  return (
    <>
      <p className="library-hint">Pick a room, then click on the plan. It arrives with its walls and snaps against its neighbours, so rooms placed side by side share a wall. Then add doors and windows.</p>
      <div className="catalog">
        {ROOM_CLASSES.map(([title, ids]) => {
          const blocks = ids.map((id) => ROOM_BLOCKS.find((b) => b.id === id)).filter((b): b is RoomBlock => !!b);
          return (
            <Section key={title} title={title} count={blocks.length}>
              {blocks.map((b) => (
                <button
                  key={b.id}
                  className={`cat-item ${mode === "block" && placing === b.id ? "active" : ""}`}
                  onClick={() => {
                    viewActions.show("plan");
                    actions.setDrawMode("block", b.id);
                  }}
                  title={`${b.label}: ${b.w} × ${b.h} m — ${b.note}. Resize it afterwards in Details.`}
                  data-block={b.id}
                >
                  <RoomGlyph w={b.w} h={b.h} />
                  <span className="cat-text">
                    <span>{b.label}</span>
                    <small>
                      {b.w} × {b.h} m · {Math.round((b.w - BLOCK_WALL) * (b.h - BLOCK_WALL) * 10) / 10} m² floor
                    </small>
                  </span>
                </button>
              ))}
            </Section>
          );
        })}
      </div>
    </>
  );
}

function FurnitureShelf() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const placing = useAppStore((s) => s.editor.placingKind);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CatalogCategory | null>(null);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CATALOG.filter((c) => (!cat || c.category === cat) && (!t || c.label.toLowerCase().includes(t) || c.kind.includes(t) || c.tags?.some((x) => x.includes(t))));
  }, [q, cat]);
  return (
    <>
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
        {groupBy(items, (c) => c.category).map(([category, pieces]) => (
          <Section key={category} title={CAT_LABEL[category as CatalogCategory]} count={pieces.length}>
            {groupBy(pieces, typeOf).map(([type, list]) => (
              <div key={type} className="shelf-type">
                <p className="shelf-type-label">{type}</p>
                {list.map((c) => {
                  const thumb = thumbnailFor(c.kind);
                  return (
                    <button
                      key={c.kind}
                      className={`cat-item ${mode === "place" && placing === c.kind ? "active" : ""}`}
                      onClick={() => actions.setDrawMode("place", c.kind)}
                      title={`${c.label} — ${c.w} × ${c.d} × ${c.h} m (nominal; change it after placing, in Details)`}
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
              </div>
            ))}
          </Section>
        ))}
        {items.length === 0 && <p className="muted small">Nothing matches “{q}”.</p>}
      </div>
    </>
  );
}

export function Library() {
  const tab = useUi((s) => s.libraryTab);
  return (
    <aside className="library" id="library" aria-label="Library">
      <div className="library-head">
        <div className="library-tabs" role="tablist" aria-label="Library">
          <button role="tab" aria-selected={tab === "rooms"} className={tab === "rooms" ? "active" : ""} onClick={() => openLibrary("rooms", false)}>
            Rooms · {ROOM_BLOCKS.length}
          </button>
          <button role="tab" aria-selected={tab === "furniture"} className={tab === "furniture" ? "active" : ""} onClick={() => openLibrary("furniture", false)}>
            Furniture · {CATALOG.length}
          </button>
        </div>
        <button className="icon-btn" onClick={() => setUi({ library: false })} aria-label="Close the library" title="Close (L)">
          <Icon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>
      {tab === "rooms" ? <RoomShelf /> : <FurnitureShelf />}
    </aside>
  );
}
