import { describe, it, expect, beforeEach } from "vitest";
import { actions, store } from "../src/model/store";
import { emptyModel } from "../src/model/types";
import { itemSize } from "../src/model/catalog";
import { GROUP_IDS, isGroupId } from "../src/studio/libraryGroups";
import { CATALOG } from "../src/model/catalog";

beforeEach(() => {
  store.setState({ model: emptyModel(), revision: 0, undoStack: [], redoStack: [], notes: [] });
});

describe("placing a piece at the size set in the library", () => {
  it("arrives at that size, in one step to undo", () => {
    const r = actions.placeItem("sofa", 3, 3, 0, { w: 2.4, d: 1.0, h: 0.8 });
    expect(r.ok).toBe(true);
    const it = store.getState().model.items.find((i) => i.id === r.id)!;
    expect(itemSize(it)).toMatchObject({ w: 2.4, d: 1.0, h: 0.8 });
    actions.undo();
    expect(store.getState().model.items).toHaveLength(0);
  });

  it("without a size, arrives at the catalogue's size", () => {
    const r = actions.placeItem("sofa", 3, 3);
    const it = store.getState().model.items.find((i) => i.id === r.id)!;
    expect(it.w).toBeUndefined();
  });

  it("a garden tree can be set to its real height", () => {
    const r = actions.placeItem("tree", 10, 10, 0, { w: 7, d: 7, h: 11 });
    expect(r.ok).toBe(true);
  });
});

describe("the component list", () => {
  it("puts every piece of the library under exactly one group", () => {
    const groupOf = (c: (typeof CATALOG)[number]) => (c.stair ? "stairs" : c.category);
    for (const c of CATALOG) expect(isGroupId(groupOf(c)), c.kind).toBe(true);
    expect(GROUP_IDS).toContain("walls");
    expect(GROUP_IDS).toContain("doors");
  });
});
