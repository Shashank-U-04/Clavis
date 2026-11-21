import { useEffect, useState } from "react";
import { actions, logActivity, useAppStore, type ActionResult } from "../../model/store";
import { catalogByKind, isResized, itemSize } from "../../model/catalog";
import { FLOOR_FINISHES } from "../../model/layout";
import { segLen } from "../../model/geometry";
import { doorLeaves, leafPath } from "../../model/drawing";
import { SWINGS } from "../../editor/doorPlace";
import type { Opening, Wall } from "../../model/types";
import { analyzeModel } from "../../model/analysis";
import { assistant, useSession } from "../../ai/session";
import { setUi } from "../uiStore";

/** A number field that commits on Enter or blur and shows the pipeline's rejection, if any. */
function Num({ label, value, step = 0.05, unit = "m", onCommit, min, max }: { label: string; value: number; step?: number; unit?: string; min?: number; max?: number; onCommit: (v: number) => ActionResult }) {
  const [draft, setDraft] = useState(String(round(value)));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => {
    const v = Number(draft);
    if (!Number.isFinite(v)) return setDraft(String(round(value)));
    if (Math.abs(v - value) < 1e-9) return;
    const r = onCommit(v);
    logActivity("human", "edit", r.summary, r.ok);
    setErr(r.ok ? null : r.summary);
    if (!r.ok) setDraft(String(round(value)));
  };
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} min={min} max={max} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      <em>{unit}</em>
      {err && <small className="bad">{err}</small>}
    </label>
  );
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function Text({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => ActionResult }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="num wide">
      <span>{label}</span>
      <input
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft !== value) {
            const r = onCommit(draft.trim());
            logActivity("human", "edit", r.summary, r.ok);
          } else setDraft(value);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

function Remove({ what, run }: { what: string; run: () => ActionResult }) {
  return (
    <button
      className="danger"
      onClick={() => {
        const r = run();
        logActivity("human", "remove", r.summary, r.ok);
        actions.selectEntity(null);
      }}
    >
      Delete {what}
    </button>
  );
}

/** A door's swing drawn small, the way it lies on the plan, for picking which way it opens. */
function SwingIcon({ wall, o }: { wall: Wall; o: Opening }) {
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
  const d = { x: (wall.bx - wall.ax) / len, y: (wall.by - wall.ay) / len };
  // the same direction as the real wall, one door wide, centred on the icon
  const span = 1.6;
  const mini: Wall = { ...wall, ax: -d.x * span / 2, ay: -d.y * span / 2, bx: d.x * span / 2, by: d.y * span / 2 };
  const leaves = doorLeaves(mini, { ...o, t: 0.5, width: Math.min(o.width, 1.1) });
  const s = 18;
  return (
    <svg width="44" height="44" viewBox="-22 -22 44 44" aria-hidden>
      <line x1={mini.ax * s} y1={mini.ay * s} x2={mini.bx * s} y2={mini.by * s} stroke="currentColor" strokeWidth={4} opacity={0.35} />
      {leaves.map((l, i) => {
        const p = leafPath(l, s);
        return (
          <g key={i}>
            <path d={p.arc} fill="none" stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" />
            <path d={p.leaf} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

export function InspectorPanel() {
  const model = useAppStore((s) => s.model);
  const e = useAppStore((s) => s.editor);
  const busy = useSession((s) => s.busy);
  const wall = model.walls.find((w) => w.id === e.selectedWallId);
  const opening = model.openings.find((o) => o.id === e.selectedOpeningId);
  const room = model.rooms.find((r) => r.id === e.selectedRoomId);
  const item = model.items.find((i) => i.id === e.selectedItemId);

  if (item) {
    const cat = catalogByKind(item.kind);
    const size = itemSize(item);
    return (
      <div className="panel-pad inspector">
        <h4>{cat?.label ?? item.kind}</h4>
        <p className="muted small">
          {cat ? (isResized(item) ? `Resized · catalog size ${cat.w} × ${cat.d} × ${cat.h} m` : `Catalog size (nominal)`) : "Unknown catalog piece"} · <code>{item.id}</code>
        </p>
        {size && (
          <>
            <p className="field-group">Size</p>
            <div className="fields">
              <Num label="Width" value={size.w} step={0.05} min={0.1} max={6} onCommit={(v) => actions.resizeItem(item.id, { w: v })} />
              <Num label="Depth" value={size.d} step={0.05} min={0.1} max={6} onCommit={(v) => actions.resizeItem(item.id, { d: v })} />
              <Num label="Height" value={size.h} step={0.05} min={0.1} max={3.5} onCommit={(v) => actions.resizeItem(item.id, { h: v })} />
            </div>
            {isResized(item) && (
              <div className="row">
                <button
                  onClick={() => {
                    const r = actions.resizeItem(item.id, { reset: true });
                    logActivity("human", "resize_item", r.summary, r.ok);
                  }}
                >
                  Reset to catalog size
                </button>
              </div>
            )}
          </>
        )}
        <p className="field-group">Position</p>
        <div className="fields">
          <Num label="x" value={item.x} onCommit={(v) => actions.moveItem(item.id, v)} />
          <Num label="y" value={item.y} onCommit={(v) => actions.moveItem(item.id, undefined, v)} />
          <Num label="Facing" value={item.rotation} step={15} unit="°" onCommit={(v) => actions.moveItem(item.id, undefined, undefined, v)} />
        </div>
        <div className="row">
          <button onClick={() => actions.moveItem(item.id, undefined, undefined, (item.rotation + 270) % 360)}>⟲ 90°</button>
          <button onClick={() => actions.moveItem(item.id, undefined, undefined, (item.rotation + 90) % 360)}>⟳ 90°</button>
          <Remove what="piece" run={() => actions.removeItem(item.id)} />
        </div>
        <p className="muted small">Drag on the plan to move · R rotates · arrow keys nudge 5 cm (Shift: 25 cm).</p>
      </div>
    );
  }

  if (opening) {
    const host = model.walls.find((w) => w.id === opening.wallId);
    const len = host ? segLen(host.ax, host.ay, host.bx, host.by) : 0;
    const door = opening.kind === "door";
    return (
      <div className="panel-pad inspector">
        <h4>{door ? "Door" : "Window"}</h4>
        <p className="muted small">
          on wall <code>{opening.wallId}</code> ({len.toFixed(2)} m) · <code>{opening.id}</code>
        </p>
        <div className="fields">
          <Num label="Width" value={opening.width} onCommit={(v) => actions.editOpening(opening.id, { width: v })} />
          <Num label="Height" value={opening.height} onCommit={(v) => actions.editOpening(opening.id, { height: v })} />
          {!door && <Num label="Sill" value={opening.sill} onCommit={(v) => actions.editOpening(opening.id, { sill: v })} />}
          <Num label="From start" value={opening.t * len} onCommit={(v) => actions.editOpening(opening.id, { offset: v })} />
        </div>
        {door && host && (
          <>
            <p className="field-group">Opens</p>
            <div className="swings" role="radiogroup" aria-label="Which way the door opens">
              {SWINGS.map((s) => {
                const on = (opening.hinge ?? "a") === s.hinge && (opening.side ?? "right") === s.side;
                return (
                  <button
                    key={`${s.hinge}${s.side}`}
                    role="radio"
                    aria-checked={on}
                    className={on ? "on" : ""}
                    title="Open this way (R turns the selected door)"
                    onClick={() => {
                      const r = actions.setDoorSwing(opening.id, s.hinge, s.side);
                      logActivity("human", "set_door_swing", r.summary, r.ok);
                    }}
                  >
                    <SwingIcon wall={host} o={{ ...opening, ...s }} />
                  </button>
                );
              })}
            </div>
            <p className="field-group">Width</p>
            <div className="row">
              {[0.7, 0.8, 0.9, 1.0, 1.6].map((w) => (
                <button
                  key={w}
                  className={Math.abs(opening.width - w) < 1e-6 ? "on" : ""}
                  title={w > 1.15 ? "Double door" : "Single door"}
                  onClick={() => {
                    const r = actions.editOpening(opening.id, { width: w });
                    logActivity("human", "edit", r.summary, r.ok);
                  }}
                >
                  {w.toFixed(1)} m{w > 1.15 ? " double" : ""}
                </button>
              ))}
            </div>
          </>
        )}
        {door && <p className="muted small">Drag the door along its wall to move it · R turns it · Del deletes it.</p>}
        {!door && <p className="muted small">Drag the window along its wall to move it.</p>}
        <div className="row">
          <Remove what={door ? "door" : "window"} run={() => actions.removeOpening(opening.id)} />
        </div>
      </div>
    );
  }

  if (room) {
    const a = analyzeModel(model).rooms.find((r) => r.id === room.id);
    return (
      <div className="panel-pad inspector">
        <Text label="Name" value={room.label} onCommit={(v) => actions.updateRoom(room.id, { label: v })} />
        <p className="muted small">
          {(room.w * room.h).toFixed(2)} m² clear floor · {a?.types.join(", ")} · <code>{room.id}</code>
        </p>
        <div className="fields">
          <Num label="Width" value={room.w} onCommit={(v) => actions.updateRoom(room.id, { w: v })} />
          <Num label="Depth" value={room.h} onCommit={(v) => actions.updateRoom(room.id, { h: v })} />
          <Num label="x" value={room.x} onCommit={(v) => actions.updateRoom(room.id, { x: v })} />
          <Num label="y" value={room.y} onCommit={(v) => actions.updateRoom(room.id, { y: v })} />
        </div>
        <label className="num wide">
          <span>Floor</span>
          <select
            value={room.floor}
            onChange={(ev) => {
              const r = actions.updateRoom(room.id, { floor: ev.target.value as (typeof FLOOR_FINISHES)[number] });
              logActivity("human", "edit", r.summary, r.ok);
            }}
          >
            {FLOOR_FINISHES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        {a && (
          <p className="small">
            {a.windows.length} window(s), {Math.round(a.daylightRatio * 100)}% glazing · {a.doors.length} door(s) ·{" "}
            {a.depth === null ? <span className="bad">not reachable from the entrance</span> : `${a.depth} door(s) from the entrance`}
          </p>
        )}
        <div className="row">
          <button
            disabled={busy}
            onClick={() => {
              setUi({ rightTab: "assistant" });
              void assistant.ask(`Furnish ${room.label}`);
            }}
          >
            Furnish this room
          </button>
          <Remove what="room" run={() => actions.removeRoom(room.id)} />
        </div>
        <div className="row">
          {(["bigger", "smaller"] as const).map((how) => (
            <button
              key={how}
              disabled={busy}
              title="Regenerates the layout around the new size (you review it before it is applied)"
              onClick={() => {
                setUi({ rightTab: "assistant" });
                void assistant.ask(`Make ${room.label} ${how}`);
              }}
            >
              Make {how}
            </button>
          ))}
        </div>
        <p className="muted small">Width and depth above edit the floor rectangle only. “Make bigger / smaller” moves the walls too, by regenerating the layout for you to review.</p>
      </div>
    );
  }

  if (wall) {
    const len = segLen(wall.ax, wall.ay, wall.bx, wall.by);
    return (
      <div className="panel-pad inspector">
        <h4>Wall</h4>
        <p className="muted small">
          {len.toFixed(2)} m long · {model.openings.filter((o) => o.wallId === wall.id).length} opening(s) · <code>{wall.id}</code>
        </p>
        <div className="fields">
          <Num label="Start x" value={wall.ax} onCommit={(v) => actions.editWall(wall.id, { ax: v })} />
          <Num label="Start y" value={wall.ay} onCommit={(v) => actions.editWall(wall.id, { ay: v })} />
          <Num label="End x" value={wall.bx} onCommit={(v) => actions.editWall(wall.id, { bx: v })} />
          <Num label="End y" value={wall.by} onCommit={(v) => actions.editWall(wall.id, { by: v })} />
          <Num label="Thickness" value={wall.thickness} step={0.01} onCommit={(v) => actions.editWall(wall.id, { thickness: v })} />
          <Num label="Height" value={wall.height} onCommit={(v) => actions.editWall(wall.id, { height: v })} />
        </div>
        <div className="row">
          <Remove what="wall" run={() => actions.removeWall(wall.id)} />
        </div>
      </div>
    );
  }

  return (
    <div className="panel-pad muted">
      <p>Select a wall, door, window, room or piece of furniture on the plan (or furniture in 3D) to edit its exact dimensions here.</p>
      <p className="small">
        Shortcuts: V select · W wall · M room · D door · N window · F fit · Del delete · Ctrl+Z / Ctrl+Y undo / redo · Esc cancel.
      </p>
    </div>
  );
}
