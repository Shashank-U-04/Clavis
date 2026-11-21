import { describe, it, expect } from "vitest";
import { applyBatch } from "../src/model/operations";
import { emptyModel, type PlanModel } from "../src/model/types";
import { itemBox } from "../src/model/issues";
import { itemSize } from "../src/model/catalog";
import { parseDocument, serializeDocument, toDocument } from "../src/model/document";

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_${n++}`;
};

const withDesk = (): PlanModel => ({ ...emptyModel(), items: [{ id: "desk", kind: "desk", x: 2, y: 2, rotation: 0 }] });

describe("resizing a piece of furniture", () => {
  it("starts at the catalog size", () => {
    expect(itemSize(withDesk().items[0])).toEqual({ w: 1.3, d: 0.65, h: 0.75 });
  });

  it("changes width, depth and height on its own, and its footprint follows", () => {
    const out = applyBatch(withDesk(), [{ op: "resize_item", id: "desk", w: 1.8, d: 0.8 }], ids());
    expect(out.ok).toBe(true);
    const it = out.model.items[0];
    expect(itemSize(it)).toEqual({ w: 1.8, d: 0.8, h: 0.75 });
    expect(it.h).toBeUndefined(); // only what changed is stored
    expect(itemBox(it)).toMatchObject({ halfW: 0.9, halfD: 0.4 });
  });

  it("keeps its size when moved, and resets to the catalog size", () => {
    let out = applyBatch(withDesk(), [{ op: "resize_item", id: "desk", h: 1.1 }, { op: "move_item", id: "desk", x: 3 }], ids());
    expect(itemSize(out.model.items[0])?.h).toBe(1.1);
    out = applyBatch(out.model, [{ op: "resize_item", id: "desk", reset: true }], ids());
    expect(out.model.items[0]).toEqual({ id: "desk", kind: "desk", x: 3, y: 2, rotation: 0 });
  });

  it("refuses sizes outside the limits", () => {
    for (const bad of [{ w: 0 }, { d: -1 }, { w: 40 }, { h: 9 }]) {
      const out = applyBatch(withDesk(), [{ op: "resize_item", id: "desk", ...bad }], ids());
      expect(out.ok).toBe(false);
    }
  });

  it("survives saving and opening the design file", () => {
    const out = applyBatch(withDesk(), [{ op: "resize_item", id: "desk", w: 1.5 }], ids());
    const back = parseDocument(serializeDocument(toDocument(out.model, [], "2026-11-20T00:00:00Z")));
    expect(back.ok && back.doc.model.items[0].w).toBe(1.5);
  });
});
