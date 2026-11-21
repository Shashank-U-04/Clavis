/**
 * The one thing selected on the plan or in 3D, and what can be done to it from anywhere:
 * the Delete key, the selection bar and the details panel all go through here.
 */

import { actions, logActivity, store, type ActionResult, type EditorState } from "../model/store";
import { catalogByKind } from "../model/catalog";
import { nextSwing } from "./doorPlace";
import type { PlanModel } from "../model/types";

export type SelectionKind = "item" | "opening" | "wall" | "room";

export interface Selection {
  kind: SelectionKind;
  id: string;
  /** what to call it on a button: "Sofa", "Door", "Wall", "Kitchen" */
  label: string;
  /** whether R / Turn does something to it */
  turnable: boolean;
}

export function selectionOf(model: PlanModel, e: EditorState): Selection | null {
  if (e.selectedItemId) {
    const it = model.items.find((i) => i.id === e.selectedItemId);
    if (it) return { kind: "item", id: it.id, label: catalogByKind(it.kind)?.label ?? it.kind, turnable: true };
  }
  if (e.selectedOpeningId) {
    const o = model.openings.find((x) => x.id === e.selectedOpeningId);
    if (o) return { kind: "opening", id: o.id, label: o.kind === "door" ? "Door" : "Window", turnable: o.kind === "door" };
  }
  if (e.selectedWallId && model.walls.some((w) => w.id === e.selectedWallId)) return { kind: "wall", id: e.selectedWallId, label: "Wall", turnable: false };
  if (e.selectedRoomId) {
    const r = model.rooms.find((x) => x.id === e.selectedRoomId);
    if (r) return { kind: "room", id: r.id, label: r.label || "Room", turnable: false };
  }
  return null;
}

const REMOVE: Record<SelectionKind, [(id: string) => ActionResult, string]> = {
  item: [actions.removeItem, "remove_item"],
  opening: [actions.removeOpening, "remove_opening"],
  wall: [actions.removeWall, "remove_wall"],
  room: [actions.removeRoom, "remove_room"],
};

/** Delete whatever is selected; one undo step. */
export function removeSelection(): ActionResult | null {
  const { model, editor } = store.getState();
  const sel = selectionOf(model, editor);
  if (!sel) return null;
  const [run, op] = REMOVE[sel.kind];
  const r = run(sel.id);
  logActivity("human", op, r.summary, r.ok);
  if (r.ok) actions.selectEntity(null);
  return r;
}

/** Turn the selected piece a quarter (back with `back`), or cycle a door's swing. */
export function turnSelection(back = false): ActionResult | null {
  const { model, editor } = store.getState();
  const sel = selectionOf(model, editor);
  if (!sel?.turnable) return null;
  if (sel.kind === "opening") {
    const door = model.openings.find((o) => o.id === sel.id)!;
    const s = nextSwing(door);
    const r = actions.setDoorSwing(door.id, s.hinge, s.side);
    logActivity("human", "set_door_swing", r.summary, r.ok);
    return r;
  }
  const item = model.items.find((i) => i.id === sel.id)!;
  return actions.moveItem(item.id, undefined, undefined, (item.rotation + (back ? 270 : 90)) % 360);
}
