/**
 * The plan editor. Tools: select (click, drag to move), wall (click to chain), room (drag a
 * rectangle), door / window (click a wall), place (click to drop a catalog piece).
 * Every change is a store action, so it runs through the operation pipeline; a drag is a
 * single undo step.
 *
 * While an assistant proposal is previewed, the plan shows the proposed design read-only,
 * outlining what would be added or changed, and dashing what would be removed.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { actions, beginGesture, endGesture, logActivity, store, useAppStore } from "../model/store";
import { snap, segLen, pointSegDist, projectT, type Pt } from "../model/geometry";
import { catalogByKind } from "../model/catalog";
import { useSession } from "../ai/session";
import { useUi } from "../studio/uiStore";
import { onCommand, sendCommand } from "../three/events";
import { extentOf, movedFar, useViewport } from "./useViewport";
import { FurnitureLayer, GridLayer, INK, OpeningsLayer, RemovedLayer, RoomsLayer, RouteLayer, TracingLayer, WallsLayer } from "./layers";

type Drag =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "move"; what: "item" | "room"; id: string; grab: Pt; moved: boolean }
  | { kind: "room"; from: Pt };

const inField = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function Editor() {
  const live = useAppStore((s) => s.model);
  const editor = useAppStore((s) => s.editor);
  const previewing = useSession((s) => {
    const t = s.turns.find((x) => x.id === s.previewTurnId);
    return t?.check?.preview?.ok ? t.check.preview : null;
  });
  const route = useUi((s) => s.route);
  const model = previewing ? previewing.model : live;
  const proposed = useMemo(() => new Set(previewing?.changedEntityIds ?? []), [previewing]);

  const svg = useRef<SVGSVGElement>(null);
  const { view, size, fit, toWorld, zoomCentre, panBy, touched, framed } = useViewport(svg);
  const [cursor, setCursor] = useState<Pt | null>(null);
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
      if (key === "escape") {
        actions.setDrawMode("select");
        actions.setHighlight([]);
        return setDrag(null);
      }
      if (key === "f" && !ctrl) return sendCommand("fit-plan");
      if (previewing) return; // nothing below edits a proposal being previewed
      if (key === "delete" || key === "backspace") {
        const removals: [string | null, (id: string) => { ok: boolean; summary: string }, string][] = [
          [ed.selectedItemId, actions.removeItem, "remove_item"],
          [ed.selectedOpeningId, actions.removeOpening, "remove_opening"],
          [ed.selectedWallId, actions.removeWall, "remove_wall"],
          [ed.selectedRoomId, actions.removeRoom, "remove_room"],
        ];
        const hit = removals.find(([id]) => id);
        if (hit) {
          const r = hit[1](hit[0]!);
          logActivity("human", hit[2], r.summary, r.ok);
          actions.selectEntity(null);
        }
        return;
      }
      const item = ed.selectedItemId ? store.getState().model.items.find((i) => i.id === ed.selectedItemId) : undefined;
      if (!item) return;
      if (key === "r") return void actions.moveItem(item.id, undefined, undefined, (item.rotation + (e.shiftKey ? 270 : 90)) % 360);
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
        if (start && Math.hypot(p.x - start.x, p.y - start.y) >= 0.2) {
          const r = actions.addWall(start.x, start.y, p.x, p.y);
          logActivity("human", "add_wall", r.summary, r.ok);
        }
        return actions.setPendingWallStart(p); // keep chaining from the last point
      }
      case "room":
        svg.current?.setPointerCapture(e.pointerId);
        return setDrag({ kind: "room", from: p });
      case "place": {
        if (!editor.placingKind) return;
        const r = actions.placeItem(editor.placingKind, p.x, p.y, 0);
        return logActivity("human", "place_item", r.summary, r.ok);
      }
      case "door":
      case "window": {
        const hit = wallUnder(toWorld(e.clientX, e.clientY));
        const r = hit ? actions.addOpening(editor.drawMode, hit.id, hit.t) : { ok: false, summary: "Click on a wall to place it." };
        return logActivity("human", `add_${editor.drawMode}`, r.summary, r.ok);
      }
      default:
        actions.selectEntity(null);
        if (editor.highlightIds.length) actions.setHighlight([]);
        startPan(e);
    }
  };

  const onMove = (e: ReactPointerEvent) => {
    setCursor(snapped(e));
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
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
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
        const r = actions.addRoom(Math.min(p.x, d.from.x), Math.min(p.y, d.from.y), w, h, `Room ${live.rooms.length + 1}`);
        logActivity("human", "add_room", r.summary, r.ok);
      }
    }
  };

  // ---- drawing ----
  const k = view.scale;
  const flagged = new Set(editor.highlightIds);
  const selected = new Set([editor.selectedItemId, editor.selectedWallId, editor.selectedRoomId, editor.selectedOpeningId]);
  const mark = (id: string) => (flagged.has(id) ? INK.flagged : selected.has(id) ? INK.selected : previewing && proposed.has(id) ? INK.proposed : null);
  const removed = previewing ? live.items.filter((i) => !model.items.some((x) => x.id === i.id)) : [];
  const start = editor.pendingWallStart;
  const help: Partial<Record<typeof editor.drawMode, string>> = {
    wall: " · click to chain walls · Esc to stop",
    room: " · drag to draw a room",
    door: " · click a wall to add a door",
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
        <OpeningsLayer model={model} k={k} mark={mark} pickable={editable} onPress={pick(actions.selectOpening)} />
        {route && <RouteLayer points={route.points} k={k} />}

        {editor.drawMode === "wall" && start && cursor && (
          <g pointerEvents="none">
            <line x1={start.x * k} y1={start.y * k} x2={cursor.x * k} y2={cursor.y * k} stroke={INK.selected} strokeWidth={Math.max(3, 0.15 * k)} strokeDasharray="8 5" />
            <text x={cursor.x * k + 10} y={cursor.y * k - 10} fontSize={12} fill={INK.selected} fontFamily="ui-monospace, monospace">
              {segLen(start.x, start.y, cursor.x, cursor.y).toFixed(2)} m
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
            fill="#f0a04b22"
            stroke={INK.selected}
            strokeDasharray="6 4"
          />
        )}
        {cursor && editor.drawMode !== "select" && !previewing && <circle cx={cursor.x * k} cy={cursor.y * k} r={4} fill={INK.selected} pointerEvents="none" />}
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
      </div>
      <div className="plan-readout">
        {cursor ? `${cursor.x.toFixed(2)}, ${cursor.y.toFixed(2)} m` : ""}
        {help[editor.drawMode] ?? ""}
      </div>
    </div>
  );
}
