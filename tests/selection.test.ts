import { describe, it, expect, beforeEach } from "vitest";
import { actions, store } from "../src/model/store";
import { emptyModel } from "../src/model/types";
import { removeSelection, selectionOf, turnSelection } from "../src/editor/selection";

beforeEach(() => {
  store.setState({ model: emptyModel(), revision: 0, undoStack: [], redoStack: [], notes: [] });
  actions.selectEntity(null);
});

const sel = () => selectionOf(store.getState().model, store.getState().editor);

describe("selection", () => {
  it("is nothing when nothing is selected, and Delete then does nothing", () => {
    expect(sel()).toBeNull();
    expect(removeSelection()).toBeNull();
    expect(store.getState().revision).toBe(0);
  });

  it("names a selected piece, turns it a quarter each way, and deletes it in one undo step", () => {
    const id = actions.placeItem("sofa", 2, 2, 0).id!;
    actions.selectItem(id);
    expect(sel()).toMatchObject({ kind: "item", id, turnable: true });
    expect(sel()!.label.length).toBeGreaterThan(0);

    turnSelection();
    expect(store.getState().model.items[0].rotation).toBe(90);
    turnSelection(true);
    expect(store.getState().model.items[0].rotation).toBe(0);

    expect(removeSelection()?.ok).toBe(true);
    expect(store.getState().model.items).toHaveLength(0);
    expect(sel()).toBeNull();
    actions.undo();
    expect(store.getState().model.items).toHaveLength(1);
  });

  it("deletes a selected wall, and cycles a door's swing but not a window's", () => {
    const wall = actions.addWall(0, 0, 4, 0).id!;
    const door = actions.addOpening("door", wall, 0.3).id!;
    const win = actions.addOpening("window", wall, 0.75).id!;

    actions.selectOpening(door);
    const before = store.getState().model.openings.find((o) => o.id === door)!;
    expect(turnSelection()?.ok).toBe(true);
    const after = store.getState().model.openings.find((o) => o.id === door)!;
    expect([after.hinge, after.side]).not.toEqual([before.hinge, before.side]);

    actions.selectOpening(win);
    expect(sel()).toMatchObject({ label: "Window", turnable: false });
    expect(turnSelection()).toBeNull();

    actions.selectWall(wall);
    expect(removeSelection()?.ok).toBe(true);
    expect(store.getState().model.walls).toHaveLength(0);
  });
});
