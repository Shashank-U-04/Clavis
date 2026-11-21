/**
 * The plan editor. Tools: select (click, drag to move), wall (click to chain), room (drag a
 * rectangle: the room and its walls), block (click to drop a ready-made room, which snaps flush
 * to its neighbours), door / window (click a wall), place (click to drop a catalog piece).
 * Every change is a store action, so it runs through the operation pipeline; a drag is a
 * single undo step.
 *
 * While an assistant proposal is previewed, the plan shows the proposed design read-only,
 * outlining what would be added or changed, and dashing what would be removed.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { actions, beginGesture, endGesture, logActivity, store, useAppStore } from "../model/store";
import type { Opening } from "../model/types";
import { snap, segLen, pointSegDist, projectT, type Pt } from "../model/geometry";
import { wallEnd } from "./wallDraw";
import { swingToward } from "./doorPlace";
import { removeSelection, turnSelection } from "./selection";
import { catalogByKind } from "../model/catalog";
import { blockById, nextLabel, snapRect } from "../model/blocks";
import { useSession } from "../ai/session";
import { setUi, useUi } from "../studio/uiStore";
import { ItemDimensions, OverallDimensions, RoomDimensions } from "./dimensions";
import { onCommand, sendCommand } from "../three/events";
import { extentOf, movedFar, useViewport } from "./useViewport";
import { FurnitureLayer, GridLayer, INK, OpeningsLayer, RemovedLayer, RoomLabelsLayer, RoomsLayer, RouteLayer, TracingLayer, WallsLayer } from "./layers";

type Drag =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move"; what: "item" | "room"; id: string; grab: Pt; moved: boolean }
  | { kind: "slide"; id: string; moved: boolean }
  | { kind: "room"; from: Pt };

const inField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** A direction on the plan as drawn: 0° to the right (east), 90° down (south). */
const angleOf = (a: Pt, b: Pt) => {
  const d = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  return d < 0 ? d + 360 : d;
};

export function Editor() {
  const live = useAppStore((s) => s.model);
  const editor = useAppStore((s) => s.editor);
  const previewing = useSession((s) => {
    const t = s.turns.find((x) => x.id === s.previewTurnId);
    return t?.check?.preview?.ok ? t.check.preview : null;
  });
  const route = useUi((s) => s.route);
  const dims = useUi((s) => s.dims);
  const model = previewing ? previewing.model : live;
  const proposed = useMemo(() => new Set(previewing?.changedEntityIds ?? []), [previewing]);

  const svg = useRef<SVGSVGElement>(null);
  const { view, size, fit, toWorld, zoomCentre, panBy, touched, framed } = useViewport(svg);
  const scaleRef = useRef(view.scale);
  scaleRef.current = view.scale;
  const [cursor, setCursor] = useState<Pt | null>(null);
  /** a wall length being typed while drawing walls (metres), committed with Enter */
  const [typed, setTyped] = useState("");
  const typedRef = useRef("");
  typedRef.current = typed;
  /** the raw pointer position in metres, and whether Shift (any angle) is held */
  const pointer = useRef<{ p: Pt; free: boolean } | null>(null);
  /** where the current chain of walls began, to end it when it closes */
  const chainStart = useRef<Pt | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // ---- framing ----
  const extent = useMemo(() => extentOf(model), [model]);
  useEffect(() => {
    if (movedFar(framed.current, extent)) fit(extent);
  }, [extent, fit, framed]);
  useEffect(() => {
    if (!touched.current) fit(extentOf(store.getState().model));
  }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onCommand("fit-plan", () => fit(extent)), [fit, extent]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const ed = store.getState().editor;
      if (ctrl && (key === "y" || (key === "z" && e.shiftKey))) {
        e.preventDefault();
        const r = actions.redo();
        return logActivity("human", "redo", r.summary, r.ok);
      }
      if (ctrl && key === "z") {
        e.preventDefault();
        const r = actions.undo();
        return logActivity("human", "undo", r.summary, r.ok);
      }
      if (ed.drawMode === "wall" && ed.pendingWallStart) {
        const from = ed.pendingWallStart;
        if (/^[0-9.]$/.test(e.key)) {
          e.preventDefault();
          return setTyped((t) => (t + e.key).slice(0, 7));
        }
        if (key === "backspace" && typedRef.current) {
          e.preventDefault();
          return setTyped((t) => t.slice(0, -1));
        }
        if (key === "enter") {
          e.preventDefault();
          const length = Number(typedRef.current);
          const at = pointer.current;
          if (!typedRef.current || !(length > 0) || !at) return;
          const end = wallEnd(from, at.p, store.getState().model.walls, { free: at.free, length, scale: scaleRef.current });
          const r = actions.addWall(from.x, from.y, end.x, end.y, undefined, undefined, true);
          logActivity("human", "add_wall", r.summary, r.ok);
          if (r.ok) actions.setPendingWallStart(end);
          return setTyped("");
        }
        if (key === "escape") {
          // the first Esc ends the chain; the next one leaves the wall tool
          setTyped("");
          chainStart.current = null;
          return actions.setPendingWallStart(null);
        }
      }
      if (key === "escape") {
        actions.setDrawMode("select");
        actions.setHighlight([]);
        return setDrag(null);
      }
      if (key === "f" && !ctrl) return sendCommand("fit-plan");
      if (previewing) return; // nothing below edits a proposal being previewed
      if (key === "delete" || key === "backspace") return void removeSelection();
      if (ed.selectedOpeningId && key === "r") return void turnSelection();
      const item = ed.selectedItemId ? store.getState().model.items.find((i) => i.id === ed.selectedItemId) : undefined;
      if (!item || ed.camera === "walk") return; // while walking, the arrows move the walker
      if (key === "r") return void turnSelection(e.shiftKey);
      const nudge = e.shiftKey ? 0.25 : 0.05;
      const step: Record<string, [number, number]> = { arrowleft: [-nudge, 0], arrowright: [nudge, 0], arrowup: [0, -nudge], arrowdown: [0, nudge] };
      if (step[key]) {
        e.preventDefault();
        actions.moveItem(item.id, item.x + step[key][0], item.y + step[key][1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewing]);

  // ---- pointer ----
  const snapped = (e: { clientX: number; clientY: number }) => {
    const p = toWorld(e.clientX, e.clientY);
    return { x: snap(p.x), y: snap(p.y) };
  };

  /** The wall under a point (within a few pixels), and how far along it the point is. */
  const wallUnder = (p: Pt) => {
    let best: { id: string; t: number; d: number } | null = null;
    for (const w of live.walls) {
      const a = { x: w.ax, y: w.ay };
      const b = { x: w.bx, y: w.by };
      const d = pointSegDist(p, a, b);
      if (d <= Math.max(0.3, 12 / view.scale) && (!best || d < best.d)) best = { id: w.id, t: Math.min(1, Math.max(0, projectT(p, a, b))), d };
    }
    return best;
  };

  const editable = editor.drawMode === "select" && !previewing;

  const grab = (e: ReactPointerEvent, what: "item" | "room", id: string) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    if (what === "item") actions.selectItem(id);
    else actions.selectRoom(id);
    const p = toWorld(e.clientX, e.clientY);
    const at = what === "item" ? live.items.find((i) => i.id === id)! : live.rooms.find((r) => r.id === id)!;
    beginGesture();
    setDrag({ kind: "move", what, id, grab: { x: p.x - at.x, y: p.y - at.y }, moved: false });
    svg.current?.setPointerCapture(e.pointerId);
  };

  const pick = (select: (id: string) => void) => (e: ReactPointerEvent, id: string) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    select(id);
  };

  /** Press on a door or window: select it, and drag to slide it along its wall. */
  const grabOpening = (e: ReactPointerEvent, id: string) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    actions.selectOpening(id);
    beginGesture();
    setDrag({ kind: "slide", id, moved: false });
    svg.current?.setPointerCapture(e.pointerId);
  };

  const startPan = (e: ReactPointerEvent) => {
    setDrag({ kind: "pan", lastX: e.clientX, lastY: e.clientY });
    svg.current?.setPointerCapture(e.pointerId);
  };

  const onDown = (e: ReactPointerEvent) => {
    if (previewing || e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) return startPan(e);
    const p = snapped(e);
    switch (editor.drawMode) {
      case "wall": {
        const start = editor.pendingWallStart;
        const end = wallEnd(start, toWorld(e.clientX, e.clientY), live.walls, { free: e.shiftKey, scale: view.scale });
        setTyped("");
        if (!start) chainStart.current = end;
        else if (Math.hypot(end.x - start.x, end.y - start.y) >= 0.2) {
          const r = actions.addWall(start.x, start.y, end.x, end.y, undefined, undefined, true);
          logActivity("human", "add_wall", r.summary, r.ok);
          // closing the loop back onto where the chain began ends it
          const first = chainStart.current;
          if (r.ok && first && Math.hypot(end.x - first.x, end.y - first.y) < 0.01) {
            chainStart.current = null;
            return actions.setPendingWallStart(null);
          }
        }
        return actions.setPendingWallStart(end); // keep chaining from the last point
      }
      case "room":
        svg.current?.setPointerCapture(e.pointerId);
        return setDrag({ kind: "room", from: p });
      case "block": {
        const ghost = blockGhost(p);
        if (!ghost) return;
        const r = actions.addRoomBlock(ghost.x, ghost.y, ghost.w, ghost.h, ghost.label, ghost.floor);
        return logActivity("human", "add_room", r.summary, r.ok);
      }
      case "place": {
        if (!editor.placingKind) return;
        const r = actions.placeItem(editor.placingKind, p.x, p.y, 0);
        return logActivity("human", "place_item", r.summary, r.ok);
      }
      case "door":
      case "window": {
        const at = toWorld(e.clientX, e.clientY);
        const hit = wallUnder(at);
        const host = hit && live.walls.find((w) => w.id === hit.id);
        const swing = host && editor.drawMode === "door" ? swingToward(host, hit.t, at) : undefined;
        const r = hit ? actions.addOpening(editor.drawMode, hit.id, hit.t, undefined, undefined, undefined, swing) : { ok: false, summary: "Click on a wall to place it." };
        return logActivity("human", `add_${editor.drawMode}`, r.summary, r.ok);
      }
      default:
        actions.selectEntity(null);
        if (editor.highlightIds.length) actions.setHighlight([]);
        startPan(e);
    }
  };

  const onMove = (e: ReactPointerEvent) => {
    pointer.current = { p: toWorld(e.clientX, e.clientY), free: e.shiftKey };
    setCursor(editor.drawMode === "wall" ? wallEnd(editor.pendingWallStart, pointer.current.p, live.walls, { free: e.shiftKey, scale: view.scale }) : snapped(e));
    if (!drag) return;
    if (drag.kind === "pan") {
      panBy(e.clientX - drag.lastX, e.clientY - drag.lastY);
      setDrag({ ...drag, lastX: e.clientX, lastY: e.clientY });
    } else if (drag.kind === "move") {
      const p = toWorld(e.clientX, e.clientY);
      const x = snap(p.x - drag.grab.x);
      const y = snap(p.y - drag.grab.y);
      if (drag.what === "item") actions.moveItem(drag.id, x, y);
      else actions.updateRoom(drag.id, { x, y });
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === "slide") {
      const o = live.openings.find((x) => x.id === drag.id);
      const w = o && live.walls.find((x) => x.id === o.wallId);
      if (!o || !w) return;
      const len = segLen(w.ax, w.ay, w.bx, w.by) || 1;
      const t = projectT(toWorld(e.clientX, e.clientY), { x: w.ax, y: w.ay }, { x: w.bx, y: w.by });
      // along the wall in 5 cm steps, kept inside it
      const offset = Math.min(len, Math.max(0, snap(t * len)));
      if (Math.abs(offset - o.t * len) > 1e-6) actions.editOpening(o.id, { offset });
      if (!drag.moved) setDrag({ ...drag, moved: true });
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "slide") {
      endGesture();
      const o = store.getState().model.openings.find((x) => x.id === d.id);
      if (d.moved && o) logActivity("human", "update_opening", `${o.kind === "door" ? "Door" : "Window"} slid along its wall.`);
    }
    if (d.kind === "move") {
      endGesture();
      if (d.moved && d.what === "item") {
        const it = store.getState().model.items.find((i) => i.id === d.id);
        if (it) logActivity("human", "move_item", `${catalogByKind(it.kind)?.label ?? it.kind} moved to (${it.x.toFixed(2)}, ${it.y.toFixed(2)}).`);
      }
    }
    if (d.kind === "room") {
      const p = snapped(e);
      const w = Math.abs(p.x - d.from.x);
      const h = Math.abs(p.y - d.from.y);
      if (w >= 0.5 && h >= 0.5) {
        const r = actions.addRoomBlock(Math.min(p.x, d.from.x), Math.min(p.y, d.from.y), w, h, nextLabel(live, "Room"));
        logActivity("human", "add_room", r.summary, r.ok);
      }
    }
  };

  /** Where a ready-made room would land with its centre at p: snapped flush to its neighbours. */
  function blockGhost(p: Pt) {
    const b = editor.drawMode === "block" ? blockById(editor.placingKind) : null;
    if (!b) return null;
    const r = snapRect(live, { x: snap(p.x - b.w / 2), y: snap(p.y - b.h / 2), w: b.w, h: b.h });
    return { ...r, label: nextLabel(live, b.label), floor: b.floor };
  }

  // ---- drawing ----
  const k = view.scale;
  const ghost = cursor && !previewing ? blockGhost(cursor) : null;
  const flagged = new Set(editor.highlightIds);
  const selected = new Set([editor.selectedItemId, editor.selectedWallId, editor.selectedRoomId, editor.selectedOpeningId]);
  const mark = (id: string) => (flagged.has(id) ? INK.flagged : selected.has(id) ? INK.selected : previewing && proposed.has(id) ? INK.proposed : null);
  const removed = previewing ? live.items.filter((i) => !model.items.some((x) => x.id === i.id)) : [];
  const start = editor.pendingWallStart;
  // the wall a click or Enter would add: the typed length along the pointer's direction
  const typedLength = Number(typed);
  const wallPreview =
    editor.drawMode === "wall" && start && cursor
      ? typed && typedLength > 0 && pointer.current
        ? wallEnd(start, pointer.current.p, live.walls, { free: pointer.current.free, length: typedLength, scale: k })
        : cursor
      : null;
  // where a door or window would go, and for a door which way it would open
  const openingGhost = (() => {
    if ((editor.drawMode !== "door" && editor.drawMode !== "window") || previewing || !pointer.current) return null;
    const hit = wallUnder(pointer.current.p);
    const w = hit && live.walls.find((x) => x.id === hit.id);
    if (!hit || !w) return null;
    const door = editor.drawMode === "door";
    const ghost: Opening = { id: "ghost", kind: editor.drawMode, wallId: w.id, t: hit.t, width: door ? 0.9 : 1.2, sill: door ? 0 : 0.9, height: door ? 2.1 : 1.2, ...(door && swingToward(w, hit.t, pointer.current.p)) };
    return { ...live, walls: [w], openings: [ghost] };
  })();
  const selRoom = model.rooms.find((r) => r.id === editor.selectedRoomId);
  const selItem = model.items.find((i) => i.id === editor.selectedItemId);
  const help: Partial<Record<typeof editor.drawMode, string>> = {
    wall: start
      ? " · click the next corner, or type a length + Enter · Shift: any angle · Esc ends the wall"
      : " · click where the wall starts; it snaps to 15° steps and to other walls' ends",
    room: " · drag to draw a room; its walls come with it",
    block: editor.placingKind ? ` · click to place a ${blockById(editor.placingKind)?.label ?? "room"}; it snaps to its neighbours · Esc to stop` : "",
    door: " · click a wall to add a door; it opens towards the side you click on, hinged on the nearer jamb · select it and press R to turn it",
    window: " · click a wall to add a window",
    place: editor.placingKind ? ` · click to place ${catalogByKind(editor.placingKind)?.label ?? ""} · Esc to stop` : "",
  };

  return (
    <div className="plan-wrap">
      <svg
        ref={svg}
        className="editor-svg"
        data-testid="plan-svg"
        style={{ background: INK.paper, cursor: previewing || editor.drawMode === "select" ? "default" : "crosshair" }}
        viewBox={`${view.left * k} ${view.top * k} ${size.width} ${size.height}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setCursor(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          actions.setDrawMode("select");
        }}
      >
        <GridLayer left={view.left} top={view.top} width={size.width} height={size.height} k={k} />
        <TracingLayer model={model} k={k} />
        <RoomsLayer rooms={model.rooms} k={k} mark={mark} movable={editable} onPress={(e, id) => grab(e, "room", id)} />
        <FurnitureLayer items={model.items} k={k} mark={mark} movable={editable} onPress={(e, id) => grab(e, "item", id)} />
        <RemovedLayer items={removed} k={k} />
        <WallsLayer walls={model.walls} k={k} mark={mark} pickable={editable} onPress={pick(actions.selectWall)} />
        <OpeningsLayer model={model} k={k} mark={mark} pickable={editable} onPress={grabOpening} />
        {openingGhost && (
          <g pointerEvents="none" opacity={0.75}>
            <OpeningsLayer model={openingGhost} k={k} mark={() => INK.selected} pickable={false} onPress={() => {}} />
          </g>
        )}
        <RoomLabelsLayer rooms={model.rooms} k={k} />
        {route && <RouteLayer points={route.points} k={k} />}
        {dims && <OverallDimensions model={model} k={k} />}
        {dims && !previewing && selRoom && <RoomDimensions room={selRoom} k={k} />}
        {dims && !previewing && selItem && <ItemDimensions item={selItem} rooms={model.rooms} k={k} />}

        {editor.drawMode === "wall" && start && wallPreview && (
          <g pointerEvents="none">
            <line x1={start.x * k} y1={start.y * k} x2={wallPreview.x * k} y2={wallPreview.y * k} stroke={INK.selected} strokeWidth={Math.max(3, 0.15 * k)} strokeDasharray="8 5" />
            <circle cx={start.x * k} cy={start.y * k} r={4} fill={INK.selected} />
            <text x={wallPreview.x * k + 12} y={wallPreview.y * k - 12} fontSize={12} fill={INK.selected} fontFamily="ui-monospace, monospace" stroke="var(--plan-paper)" strokeWidth={3} paintOrder="stroke">
              {typed ? `${typed}▏ m` : `${segLen(start.x, start.y, wallPreview.x, wallPreview.y).toFixed(2)} m`} · {angleOf(start, wallPreview)}°
            </text>
          </g>
        )}
        {drag?.kind === "room" && cursor && (
          <rect
            pointerEvents="none"
            x={Math.min(drag.from.x, cursor.x) * k}
            y={Math.min(drag.from.y, cursor.y) * k}
            width={Math.abs(cursor.x - drag.from.x) * k}
            height={Math.abs(cursor.y - drag.from.y) * k}
            fill={INK.selectedSoft}
            stroke={INK.selected}
            strokeDasharray="6 4"
          />
        )}
        {drag?.kind === "room" && cursor && Math.abs(cursor.x - drag.from.x) > 0 && Math.abs(cursor.y - drag.from.y) > 0 && (
          <RoomDimensions room={{ id: "", label: "", floor: "oak", x: Math.min(drag.from.x, cursor.x), y: Math.min(drag.from.y, cursor.y), w: Math.abs(cursor.x - drag.from.x), h: Math.abs(cursor.y - drag.from.y) }} k={k} />
        )}
        {ghost && (
          <g pointerEvents="none">
            <rect x={ghost.x * k} y={ghost.y * k} width={ghost.w * k} height={ghost.h * k} fill={INK.selectedSoft} stroke={INK.selected} strokeWidth={Math.max(2, 0.15 * k)} strokeDasharray="8 5" />
            <text x={(ghost.x + ghost.w / 2) * k} y={(ghost.y + ghost.h / 2) * k} textAnchor="middle" fontSize={13} fontWeight={600} fill={INK.selected}>
              {ghost.label}
              <tspan x={(ghost.x + ghost.w / 2) * k} dy={16} fontSize={11} fontWeight={400}>
                {ghost.w} × {ghost.h} m
              </tspan>
            </text>
          </g>
        )}
        {cursor && editor.drawMode !== "select" && editor.drawMode !== "block" && !previewing && <circle cx={cursor.x * k} cy={cursor.y * k} r={4} fill={INK.selected} pointerEvents="none" />}
      </svg>

      {previewing && (
        <div className="plan-banner">
          Previewing a proposal — nothing is applied yet. <span className="ghost-key">Green</span> = added or changed
          {removed.length > 0 && (
            <>
              , <span className="removed-key">red</span> = removed
            </>
          )}
          .
        </div>
      )}
      <div className="plan-tools">
        <button title="Zoom in" onClick={() => zoomCentre(1.25)}>
          +
        </button>
        <button title="Zoom out" onClick={() => zoomCentre(0.8)}>
          −
        </button>
        <button title="Fit the plan (F)" onClick={() => fit(extent)}>
          Fit
        </button>
        <button title="Show or hide measurements" aria-pressed={dims} className={dims ? "on" : ""} onClick={() => setUi({ dims: !dims })}>
          Dimensions
        </button>
      </div>
      <div className="plan-readout">
        {cursor ? `${cursor.x.toFixed(2)}, ${cursor.y.toFixed(2)} m` : ""}
        {help[editor.drawMode] ?? ""}
      </div>
    </div>
  );
}
