/**
 * The studio's left side: a list of everything a home is made of, by name, and the library
 * beside it.
 *
 * The list runs in the order a home is put together: Select, then the building (walls, rooms,
 * doors, windows, stairs), then the furniture room by room, then the guide. Choosing one opens
 * its shelf: what there is to place, each with its size, and the measurements the next one
 * will be placed at, which you can change before placing it (a wall's thickness and height, a
 * door's width, a room's width and depth, a sofa's width, depth and height). Choosing it again
 * closes the shelf. Picking a drawing tool while the plan is hidden brings the plan back.
 */

import { useMemo, useState, type ReactNode } from "react";
import { actions, useAppStore } from "../model/store";
import { CATALOG, ITEM_SIZE_LIMITS, catalogByKind, type CatalogEntry } from "../model/catalog";
import { BLOCK_WALL, ROOM_BLOCKS, blockById, type RoomBlock } from "../model/blocks";
import { thumbnailFor } from "../three/thumbnails";
import { openLibrary, setUi, ui, useUi, viewActions } from "./uiStore";
import { BUILD_GROUPS, FURNISH_GROUPS, GROUP_LABEL, type GroupId } from "./libraryGroups";
import { DEFAULT_SIZES, clampSize, nextSizes, setNextSizes, useNextSizes } from "./nextSizes";

const TOOLS = {
  select: { label: "Select", key: "V", icon: "M5 3l14 8-6 2-2 6z", tip: "Select, move and edit" },
  wall: { label: "Wall", key: "W", icon: "M3 17h18M3 7h18M3 7v10M21 7v10", tip: "Draw single walls" },
  room: { label: "Room", key: "M", icon: "M4 4h16v16H4z", tip: "Drag out a room; its walls come with it" },
  door: { label: "Door", key: "D", icon: "M5 21V4h9v17M14 4a9 9 0 0 1 0 17", tip: "Click a wall to put a door in it" },
  window: { label: "Window", key: "N", icon: "M4 6h16v12H4zM12 6v12M4 12h16", tip: "Click a wall to put a window in it" },
} as const;
type Tool = keyof typeof TOOLS;

/** An icon for each group on the list. */
const GROUP_ICON: Record<GroupId, string> = {
  walls: TOOLS.wall.icon,
  rooms: "M3 4h18v16H3zM3 12h9M12 4v16",
  doors: TOOLS.door.icon,
  windows: TOOLS.window.icon,
  stairs: "M4 20h4v-4h4v-4h4V8h4",
  living: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2",
  bedroom: "M3 18V8M3 14h18v4M21 18v-6a2 2 0 0 0-2-2H10v4M6 11a1.5 1.5 0 1 0 0-.01",
  kitchen: "M5 3v8M8 3v8M5 7h3M6.5 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9",
  bath: "M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM6 12V5a2 2 0 0 1 4 0",
  office: "M3 9h18M5 9v11M19 9v11M9 5h6v4",
  decor: "M12 3v4M8 21h8M12 7c-3 0-5 3-5 7h10c0-4-2-7-5-7zM12 14v7",
  structure: "M4 20V6M10 20V6M16 20V6M2 6h20M2 20h20",
  outdoor: "M12 21v-7M8 14h8M12 3c-4 0-6 3-6 6 0 2 2 5 6 5s6-3 6-5c0-3-2-6-6-6z",
};
const GUIDE = "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2";

/** The tool a group switches on as it opens (furniture and rooms wait until a piece is picked). */
const GROUP_TOOL: Partial<Record<GroupId, Tool>> = { walls: "wall", doors: "door", windows: "window" };

/** What is on a group's furniture shelf. */
const piecesOf = (g: GroupId): CatalogEntry[] =>
  g === "stairs" ? CATALOG.filter((c) => !!c.stair) : g === "structure" ? CATALOG.filter((c) => c.category === "structure" && !c.stair) : CATALOG.filter((c) => c.category === g);

/** The kind of piece within its group, so a shelf reads Seating, Tables, Storage… */
function typeOf(c: CatalogEntry): string {
  const t = c.tags ?? [];
  if (c.stair) return "Stairs";
  if (t.includes("pool")) return "Pools";
  if (t.includes("paving")) return "Paving";
  if (t.includes("planting")) return "Planting";
  if (t.includes("shade")) return "Shade";
  if (t.includes("lighting")) return "Lighting";
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

function groupBy<T>(list: readonly T[], key: (x: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const x of list) out.set(key(x), [...(out.get(key(x)) ?? []), x]);
  return [...out];
}

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

/** Pick a drawing tool; drawing needs the plan, so show it if it was hidden. */
export function pickTool(mode: Tool) {
  if (mode !== "select") viewActions.show("plan");
  actions.setDrawMode(mode);
}

/** Open a group's shelf (or close it if it is the one open), switching on its tool. */
function chooseGroup(g: GroupId) {
  const s = ui.getState();
  const closing = s.library && s.libraryTab === g;
  openLibrary(g);
  const tool = GROUP_TOOL[g];
  if (tool) pickTool(closing ? "select" : tool);
}

export function ToolStrip() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const library = useUi((s) => s.library);
  const tab = useUi((s) => s.libraryTab);
  const guide = useUi((s) => s.guide);
  const item = (g: GroupId) => {
    const on = library && tab === g;
    return (
      <button key={g} className={`tool ${on ? "active" : ""}`} onClick={() => chooseGroup(g)} aria-pressed={on} aria-controls="library" data-group={g} title={GROUP_LABEL[g]}>
        <Icon d={GROUP_ICON[g]} />
        <span>{GROUP_LABEL[g]}</span>
      </button>
    );
  };
  return (
    <nav className="strip" aria-label="Components">
      <button
        className={`tool ${mode === "select" ? "active" : ""}`}
        onClick={() => (pickTool("select"), setUi({ library: false }))}
        title={`${TOOLS.select.tip} (${TOOLS.select.key})`}
        aria-pressed={mode === "select"}
        data-tool="select"
      >
        <Icon d={TOOLS.select.icon} />
        <span>Select</span>
      </button>
      <p className="strip-label">Build</p>
      {BUILD_GROUPS.map(item)}
      <p className="strip-label">Furnish</p>
      {FURNISH_GROUPS.map(item)}
      <span className="strip-rule" aria-hidden="true" />
      <button className={`tool ${guide ? "active" : ""}`} onClick={() => setUi({ guide: !ui.getState().guide })} aria-pressed={guide} title="Step-by-step guide to building a plan">
        <Icon d={GUIDE} />
        <span>Guide</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------------- sizes

/** A measurement field: metres, kept within limits, committed on Enter or leaving the field. */
export function SizeField({ label, value, min, max, step = 0.05, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    if (Number.isFinite(v) && v > 0) onChange(clampSize(v, min, max));
    setDraft(null);
  };
  return (
    <label className="size-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <em>m</em>
    </label>
  );
}

function SizeBox({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  return (
    <div className="size-box">
      <p className="size-title">
        {title}
        {onReset && (
          <button className="link" onClick={onReset}>
            Reset
          </button>
        )}
      </p>
      <div className="size-fields">{children}</div>
    </div>
  );
}

// --------------------------------------------------------------------------------- shelves

function WallsShelf() {
  const wall = useNextSizes((s) => s.wall);
  const set = (patch: Partial<typeof wall>) => setNextSizes({ wall: { ...nextSizes.getState().wall, ...patch } });
  return (
    <>
      <p className="library-hint">Click on the plan to start a wall and again to end it; keep clicking to chain walls. While drawing, type a length (say 4.2) and press Enter. Esc stops.</p>
      <SizeBox title="New walls" onReset={() => setNextSizes({ wall: { ...DEFAULT_SIZES.wall } })}>
        <SizeField label="Thickness" value={wall.thickness} min={0.05} max={0.5} step={0.01} onChange={(thickness) => set({ thickness })} />
        <SizeField label="Height" value={wall.height} min={2.1} max={5} onChange={(height) => set({ height })} />
      </SizeBox>
      <div className="presets">
        {[
          ["Partition", 0.1],
          ["Inside wall", 0.15],
          ["Outside wall", 0.2],
          ["Thick outside wall", 0.3],
        ].map(([label, t]) => (
          <button key={label} className={`chip ${wall.thickness === t ? "active" : ""}`} onClick={() => set({ thickness: t as number })}>
            {label} · {t} m
          </button>
        ))}
      </div>
    </>
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

const ROOM_CLASSES: [string, string[]][] = [
  ["Living & dining", ["living", "living-kitchen", "dining"]],
  ["Bedrooms", ["bedroom", "main-bedroom"]],
  ["Kitchen & utility", ["kitchen", "utility"]],
  ["Bathrooms", ["bathroom", "wc"]],
  ["Work & circulation", ["study", "hall"]],
];

function RoomsShelf() {
  const mode = useAppStore((s) => s.editor.drawMode);
  const placing = useAppStore((s) => s.editor.placingKind);
  const custom = useNextSizes((s) => s.room);
  const active = mode === "block" ? blockById(placing) : null;
  const size = (b: RoomBlock) => custom[b.id] ?? { w: b.w, h: b.h };
  const setSize = (b: RoomBlock, patch: Partial<{ w: number; h: number }>) => setNextSizes({ room: { ...nextSizes.getState().room, [b.id]: { ...size(b), ...patch } } });
  return (
    <>
      <p className="library-hint">Pick a room, set its size if you like, then click on the plan. It arrives with its walls and snaps against its neighbours, so rooms side by side share a wall.</p>
      {active && (
        <SizeBox
          title={`${active.label}: size`}
          onReset={() => {
            const rest = { ...nextSizes.getState().room };
            delete rest[active.id];
            setNextSizes({ room: rest });
          }}
        >
          <SizeField label="Width" value={size(active).w} min={1} max={15} onChange={(w) => setSize(active, { w })} />
          <SizeField label="Depth" value={size(active).h} min={1} max={15} onChange={(h) => setSize(active, { h })} />
        </SizeBox>
      )}
      <button className={`cat-item any-size ${mode === "room" ? "active" : ""}`} onClick={() => pickTool("room")}>
        <Icon d={TOOLS.room.icon} />
        <span className="cat-text">
          <span>A room of any size</span>
          <small>Drag it out on the plan</small>
        </span>
      </button>
      <div className="catalog">
        {ROOM_CLASSES.map(([title, ids]) => {
          const blocks = ids.map((id) => ROOM_BLOCKS.find((b) => b.id === id)).filter((b): b is RoomBlock => !!b);
          return (
            <section key={title} className="shelf-section">
              <p className="shelf-type-label">{title}</p>
              {blocks.map((b) => {
                const s = size(b);
                return (
                  <button
                    key={b.id}
                    className={`cat-item ${mode === "block" && placing === b.id ? "active" : ""}`}
                    onClick={() => {
                      viewActions.show("plan");
                      actions.setDrawMode("block", b.id);
                    }}
                    title={`${b.label}: ${s.w} × ${s.h} m — ${b.note}`}
                    data-block={b.id}
                  >
                    <RoomGlyph w={s.w} h={s.h} />
                    <span className="cat-text">
                      <span>{b.label}</span>
                      <small>
                        {s.w} × {s.h} m · {Math.round((s.w - BLOCK_WALL) * (s.h - BLOCK_WALL) * 10) / 10} m² floor
                      </small>
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}

const DOOR_PRESETS: [string, string, number, number][] = [
  ["Bathroom door", "a narrow leaf", 0.8, 2.1],
  ["Room door", "the usual inside door", 0.9, 2.1],
  ["Front door", "a wide single leaf", 1.0, 2.2],
  ["Double door", "two leaves, between living rooms", 1.6, 2.1],
  ["Garden doors", "glazed, onto a terrace", 2.4, 2.4],
];
const WINDOW_PRESETS: [string, string, number, number, number][] = [
  ["Bathroom window", "small and high", 0.6, 0.9, 1.2],
  ["Standard window", "for a bedroom or study", 1.2, 1.2, 0.9],
  ["Wide window", "for a living room", 2.0, 1.4, 0.8],
  ["Picture window", "a low, wide view", 3.0, 1.8, 0.4],
  ["Floor to ceiling", "a glass wall", 2.4, 2.4, 0],
];

function OpeningsShelf({ kind }: { kind: "door" | "window" }) {
  const door = useNextSizes((s) => s.door);
  const win = useNextSizes((s) => s.window);
  const tool = useAppStore((s) => s.editor.drawMode);
  const ensureTool = () => tool !== kind && pickTool(kind);
  if (kind === "door")
    return (
      <>
        <p className="library-hint">Pick a door, or set its size, then click on a wall. It swings towards the side you click.</p>
        <SizeBox title="Next door" onReset={() => setNextSizes({ door: { ...DEFAULT_SIZES.door } })}>
          <SizeField label="Width" value={door.width} min={0.6} max={4} onChange={(width) => (setNextSizes({ door: { ...door, width } }), ensureTool())} />
          <SizeField label="Height" value={door.height} min={1.9} max={3} onChange={(height) => (setNextSizes({ door: { ...door, height } }), ensureTool())} />
        </SizeBox>
        <div className="catalog">
          {DOOR_PRESETS.map(([label, note, w, h]) => (
            <button key={label} className={`cat-item ${door.width === w && door.height === h ? "active" : ""}`} onClick={() => (setNextSizes({ door: { width: w, height: h } }), ensureTool())}>
              <Icon d={TOOLS.door.icon} />
              <span className="cat-text">
                <span>{label}</span>
                <small>
                  {w} × {h} m · {note}
                </small>
              </span>
            </button>
          ))}
        </div>
      </>
    );
  return (
    <>
      <p className="library-hint">Pick a window, or set its size, then click on a wall.</p>
      <SizeBox title="Next window" onReset={() => setNextSizes({ window: { ...DEFAULT_SIZES.window } })}>
        <SizeField label="Width" value={win.width} min={0.3} max={4} onChange={(width) => (setNextSizes({ window: { ...win, width } }), ensureTool())} />
        <SizeField label="Height" value={win.height} min={0.3} max={3} onChange={(height) => (setNextSizes({ window: { ...win, height } }), ensureTool())} />
        <SizeField label="Sill" value={win.sill} min={0} max={2} onChange={(sill) => (setNextSizes({ window: { ...win, sill } }), ensureTool())} />
      </SizeBox>
      <div className="catalog">
        {WINDOW_PRESETS.map(([label, note, w, h, sill]) => (
          <button key={label} className={`cat-item ${win.width === w && win.height === h && win.sill === sill ? "active" : ""}`} onClick={() => (setNextSizes({ window: { width: w, height: h, sill } }), ensureTool())}>
            <Icon d={TOOLS.window.icon} />
            <span className="cat-text">
              <span>{label}</span>
              <small>
                {w} × {h} m, sill {sill} m · {note}
              </small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function PiecesShelf({ group }: { group: GroupId }) {
  const mode = useAppStore((s) => s.editor.drawMode);
  const placing = useAppStore((s) => s.editor.placingKind);
  const custom = useNextSizes((s) => s.item);
  const [q, setQ] = useState("");
  const all = useMemo(() => piecesOf(group), [group]);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((c) => !t || c.label.toLowerCase().includes(t) || c.kind.includes(t) || c.tags?.some((x) => x.includes(t)));
  }, [all, q]);
  const active = mode === "place" && placing ? catalogByKind(placing) : undefined;
  const size = (c: CatalogEntry) => custom[c.kind] ?? { w: c.w, d: c.d, h: c.h };
  const setSize = (c: CatalogEntry, patch: Partial<{ w: number; d: number; h: number }>) => setNextSizes({ item: { ...nextSizes.getState().item, [c.kind]: { ...size(c), ...patch } } });
  return (
    <>
      {all.length > 6 && <input className="search" placeholder={`Search ${GROUP_LABEL[group].toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${GROUP_LABEL[group]}`} />}
      <p className="library-hint">Pick a piece, set its size if you like, then click on the plan or the 3D floor to place it.</p>
      {active && all.includes(active) && !active.stair && (
        <SizeBox
          title={`${active.label}: size`}
          onReset={() => {
            const rest = { ...nextSizes.getState().item };
            delete rest[active.kind];
            setNextSizes({ item: rest });
          }}
        >
          <SizeField label="Width" value={size(active).w} min={ITEM_SIZE_LIMITS.min} max={ITEM_SIZE_LIMITS.maxPlan} onChange={(w) => setSize(active, { w })} />
          <SizeField label="Depth" value={size(active).d} min={ITEM_SIZE_LIMITS.min} max={ITEM_SIZE_LIMITS.maxPlan} onChange={(d) => setSize(active, { d })} />
          <SizeField label="Height" value={size(active).h} min={ITEM_SIZE_LIMITS.min} max={ITEM_SIZE_LIMITS.maxHeight} onChange={(h) => setSize(active, { h })} />
        </SizeBox>
      )}
      <div className="catalog">
        {groupBy(items, typeOf).map(([type, list]) => (
          <section key={type} className="shelf-section">
            <p className="shelf-type-label">{type}</p>
            {list.map((c) => {
              const thumb = thumbnailFor(c.kind);
              const s = size(c);
              return (
                <button key={c.kind} className={`cat-item ${mode === "place" && placing === c.kind ? "active" : ""}`} onClick={() => actions.setDrawMode("place", c.kind)} title={`${c.label}: ${s.w} × ${s.d} × ${s.h} m`} data-kind={c.kind}>
                  {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="swatch" style={{ background: c.color }} />}
                  <span className="cat-text">
                    <span>{c.label}</span>
                    <small>
                      {s.w} × {s.d} × {s.h} m
                    </small>
                  </span>
                </button>
              );
            })}
          </section>
        ))}
        {items.length === 0 && <p className="muted small">Nothing matches “{q}”.</p>}
        <p className="library-soon">More libraries coming soon: new furniture, kitchens, bathrooms and garden pieces.</p>
      </div>
    </>
  );
}

export function Library() {
  const tab = useUi((s) => s.libraryTab);
  const count = tab === "walls" || tab === "doors" || tab === "windows" ? null : tab === "rooms" ? ROOM_BLOCKS.length : piecesOf(tab).length;
  return (
    <aside className="library" id="library" aria-label={`Library: ${GROUP_LABEL[tab]}`}>
      <div className="library-head">
        <h2 className="library-title">
          {GROUP_LABEL[tab]}
          {count !== null && <small>{count}</small>}
        </h2>
        <button className="icon-btn" onClick={() => setUi({ library: false })} aria-label="Close the library" title="Close (L)">
          <Icon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>
      {tab === "walls" ? <WallsShelf /> : tab === "rooms" ? <RoomsShelf /> : tab === "doors" ? <OpeningsShelf kind="door" /> : tab === "windows" ? <OpeningsShelf kind="window" /> : <PiecesShelf key={tab} group={tab} />}
    </aside>
  );
}
