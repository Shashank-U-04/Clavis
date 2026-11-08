import { describe, it, expect, beforeEach } from "vitest";
import { actions, beginGesture, commitPreview, dispatch, endGesture, preview, store } from "../src/model/store";
import { emptyModel } from "../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";

beforeEach(() => {
  store.setState({ model: emptyModel(), revision: 0, undoStack: [], redoStack: [], notes: [] });
});

describe("dispatch", () => {
  it("bumps the revision and returns changed ids and validation", () => {
    const r = dispatch([{ op: "add_wall", ax: 0, ay: 0, bx: 3, by: 0 }]);
    expect(r.ok).toBe(true);
    expect(r.revision).toBe(1);
    expect(r.changedEntityIds).toHaveLength(1);
    expect(Array.isArray(r.issues)).toBe(true);
  });

  it("leaves model, revision and history untouched when rejected", () => {
    const before = store.getState().model;
    const r = dispatch([{ op: "remove_wall", id: "nope" }]);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("not_found");
    expect(store.getState().model).toBe(before);
    expect(store.getState().revision).toBe(0);
    expect(store.getState().undoStack).toHaveLength(0);
  });
});

describe("undo / redo", () => {
  it("restores previous states in order and back again", () => {
    dispatch([{ op: "add_wall", ax: 0, ay: 0, bx: 3, by: 0 }]);
    const one = store.getState().model;
    dispatch([{ op: "add_wall", ax: 3, ay: 0, bx: 3, by: 3 }]);
    const two = store.getState().model;

    expect(actions.undo().ok).toBe(true);
    expect(store.getState().model).toBe(one);
    expect(actions.undo().ok).toBe(true);
    expect(store.getState().model.walls).toHaveLength(0);
    expect(actions.undo().ok).toBe(false);

    expect(actions.redo().ok).toBe(true);
    expect(actions.redo().ok).toBe(true);
    expect(store.getState().model).toBe(two);
    expect(actions.redo().ok).toBe(false);
  });

  it("a new edit clears the redo stack", () => {
    dispatch([{ op: "add_wall", ax: 0, ay: 0, bx: 3, by: 0 }]);
    actions.undo();
    dispatch([{ op: "add_wall", ax: 0, ay: 1, bx: 3, by: 1 }]);
    expect(actions.redo().ok).toBe(false);
  });

  it("revision keeps increasing through undo and redo", () => {
    dispatch([{ op: "add_wall", ax: 0, ay: 0, bx: 3, by: 0 }]);
    actions.undo();
    actions.redo();
    expect(store.getState().revision).toBe(3);
  });

  it("a drag gesture becomes a single undo step", () => {
    dispatch(COMPACT_TWO_BEDROOM);
    const item = store.getState().model.items[0];
    const before = store.getState().model;
    beginGesture();
    for (let i = 1; i <= 10; i++) dispatch([{ op: "move_item", id: item.id, x: item.x + i * 0.05 }]);
    endGesture();
    expect(store.getState().undoStack).toHaveLength(2); // the template + the drag
    actions.undo();
    expect(store.getState().model).toBe(before);
  });
});

describe("preview + commit", () => {
  it("previews without changing anything and commits the exact previewed model", () => {
    const base = store.getState().model;
    const p = preview(COMPACT_TWO_BEDROOM);
    expect(p.ok).toBe(true);
    expect(store.getState().model).toBe(base);
    const r = commitPreview(p);
    expect(r.ok).toBe(true);
    expect(store.getState().model).toBe(p.model);
  });

  it("refuses a stale preview after the design changed", () => {
    const p = preview([{ op: "add_wall", ax: 0, ay: 0, bx: 2, by: 0 }]);
    dispatch([{ op: "add_wall", ax: 0, ay: 3, bx: 2, by: 3 }]);
    const r = commitPreview(p);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("stale_preview");
  });

  it("reports which issues a change resolves and introduces", () => {
    dispatch(COMPACT_TWO_BEDROOM);
    const bed = store.getState().model.items.find((i) => i.kind === "bed_double")!;
    const door = store.getState().model.openings.find((o) => o.kind === "door")!;
    // introduce a conflict, then preview the fix
    const wardrobe = store.getState().model.items.find((i) => i.kind === "wardrobe")!;
    dispatch([{ op: "move_item", id: wardrobe.id, x: bed.x, y: bed.y }]);
    const p = preview([{ op: "move_item", id: wardrobe.id, x: wardrobe.x, y: wardrobe.y }]);
    expect(p.diff.resolved.some((i) => i.code === "items_overlap")).toBe(true);
    expect(p.diff.introduced).toEqual([]);
    expect(door).toBeTruthy();
  });
});
