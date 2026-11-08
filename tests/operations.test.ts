import { describe, it, expect } from "vitest";
import { applyBatch, isDestructive, type DesignOperation } from "../src/model/operations";
import { emptyModel, type PlanModel } from "../src/model/types";
import { checkModel } from "../src/model/issues";
import { catalogByKind } from "../src/model/catalog";
import { boxesOverlap, wallBox } from "../src/model/geometry";
import { itemBox } from "../src/model/issues";

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_${n++}`;
};

const box = (): PlanModel => ({
  ...emptyModel(),
  walls: [
    { id: "n", ax: 0, ay: 0, bx: 5, by: 0, thickness: 0.2, height: 2.7 },
    { id: "e", ax: 5, ay: 0, bx: 5, by: 4, thickness: 0.2, height: 2.7 },
    { id: "s", ax: 5, ay: 4, bx: 0, by: 4, thickness: 0.2, height: 2.7 },
    { id: "w", ax: 0, ay: 4, bx: 0, by: 0, thickness: 0.2, height: 2.7 },
  ],
  rooms: [{ id: "r", x: 0.1, y: 0.1, w: 4.8, h: 3.8, label: "Room", floor: "oak" }],
});

describe("schema validation", () => {
  it("rejects unknown operations, extra keys and non-finite numbers without changing the model", () => {
    const m = box();
    for (const bad of [
      [{ op: "execute_code", code: "alert(1)" }],
      [{ op: "add_wall", ax: 0, ay: 0, bx: 1, by: 0, evil: true }],
      [{ op: "add_wall", ax: Number.NaN, ay: 0, bx: 1, by: 0 }],
      [{ op: "add_wall", ax: 0, ay: 0, bx: 1e9, by: 0 }],
      "not a list",
      [],
    ]) {
      const out = applyBatch(m, bad, ids());
      expect(out.ok).toBe(false);
      expect(out.error?.code).toBe("invalid_input");
      expect(out.model).toBe(m);
    }
  });

  it("rejects unknown furniture kinds at the schema", () => {
    const out = applyBatch(box(), [{ op: "place_item", kind: "hot_tub", x: 1, y: 1 }], ids());
    expect(out.ok).toBe(false);
  });
});

describe("entity references", () => {
  it("requires exact ids — no partial or label matching", () => {
    const out = applyBatch(box(), [{ op: "remove_room", id: "Room" }], ids());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe("not_found");
    expect(applyBatch(box(), [{ op: "remove_wall", id: "w_" }], ids()).ok).toBe(false);
  });

  it("resolves $aliases created earlier in the same batch", () => {
    const out = applyBatch(
      emptyModel(),
      [
        { op: "add_wall", as: "front", ax: 0, ay: 0, bx: 4, by: 0 },
        { op: "add_opening", kind: "door", wallId: "$front", offset: 1 },
      ],
      ids(),
    );
    expect(out.ok).toBe(true);
    expect(out.model.openings[0].wallId).toBe(out.created.front);
    expect(out.model.openings[0].t).toBeCloseTo(0.25, 4);
  });

  it("reports an alias that was never declared", () => {
    const out = applyBatch(box(), [{ op: "add_opening", kind: "door", wallId: "$ghost" }], ids());
    expect(out.error?.code).toBe("not_found");
  });
});

describe("atomic batches", () => {
  it("applies nothing when any operation fails", () => {
    const m = box();
    const out = applyBatch(
      m,
      [
        { op: "add_wall", ax: 1, ay: 1, bx: 3, by: 1 },
        { op: "remove_wall", id: "missing" },
      ],
      ids(),
    );
    expect(out.ok).toBe(false);
    expect(out.failedIndex).toBe(1);
    expect(out.model).toBe(m);
    expect(m.walls).toHaveLength(4);
  });
});

describe("openings stay inside their host wall", () => {
  it("rejects a door wider than its wall", () => {
    const out = applyBatch(box(), [{ op: "add_opening", kind: "door", wallId: "e", width: 4 }], ids());
    expect(out.ok).toBe(false);
    expect(out.error?.message).toMatch(/does not fit/);
  });

  it("clamps a door near the wall end so the whole vano fits, and says so", () => {
    const out = applyBatch(box(), [{ op: "add_opening", kind: "door", wallId: "n", t: 1 }], ids());
    expect(out.ok).toBe(true);
    const d = out.model.openings[0];
    expect(d.t).toBeCloseTo(1 - 0.45 / 5, 4);
    expect(out.steps[0].notes?.[0]).toMatch(/Shifted/);
    expect(checkModel(out.model).some((i) => i.code === "opening_overflow")).toBe(false);
  });

  it("rejects a window taller than its wall", () => {
    const out = applyBatch(box(), [{ op: "add_opening", kind: "window", wallId: "n", sill: 1.2, height: 2 }], ids());
    expect(out.ok).toBe(false);
  });

  it("refuses to shorten a wall below the openings it hosts", () => {
    const m = box();
    m.openings.push({ id: "d", kind: "door", wallId: "n", t: 0.5, width: 0.9, sill: 0, height: 2.1 });
    const out = applyBatch(m, [{ op: "update_wall", id: "n", bx: 0.6 }], ids());
    expect(out.ok).toBe(false);
    expect(out.error?.message).toMatch(/door d/);
  });

  it("removing a wall removes its openings and reports them as changed", () => {
    const m = box();
    m.openings.push({ id: "d", kind: "door", wallId: "n", t: 0.5, width: 0.9, sill: 0, height: 2.1 });
    const out = applyBatch(m, [{ op: "remove_wall", id: "n" }], ids());
    expect(out.model.openings).toEqual([]);
    expect(out.changed).toEqual(expect.arrayContaining(["n", "d"]));
  });
});

describe("place_item_in_room", () => {
  const cases: ["north" | "south" | "east" | "west", number][] = [
    ["north", 0],
    ["south", 180],
    ["west", 90],
    ["east", 270],
  ];
  for (const [side, rotation] of cases) {
    it(`puts a wardrobe flush against the ${side} wall without crossing it`, () => {
      const out = applyBatch(box(), [{ op: "place_item_in_room", kind: "wardrobe", roomId: "r", against: side }], ids());
      expect(out.ok).toBe(true);
      const it = out.model.items[0];
      expect(it.rotation).toBe(rotation);
      const footprint = itemBox(it)!;
      for (const w of out.model.walls) expect(boxesOverlap(footprint, wallBox(w), 0.02)).toBe(false);
      expect(checkModel(out.model)).toEqual([]);
    });
  }

  it("rejects an item longer than the wall it is placed against", () => {
    const m = box();
    m.rooms[0].w = 1;
    const out = applyBatch(m, [{ op: "place_item_in_room", kind: "sofa_3", roomId: "r", against: "north" }], ids());
    expect(out.ok).toBe(false);
  });
});

describe("destructive classification", () => {
  it("flags deletions and layout replacement of a non-empty plan", () => {
    const del: DesignOperation = { op: "remove_item", id: "x" };
    const add: DesignOperation = { op: "add_room", x: 0, y: 0, w: 2, h: 2, label: "Box" };
    const layout: DesignOperation = { op: "build_layout", rooms: [{ as: "a", label: "A", x: 0, y: 0, w: 3, h: 3 }] };
    expect(isDestructive(del)).toBe(true);
    expect(isDestructive(add)).toBe(false);
    expect(isDestructive(layout, emptyModel())).toBe(false);
    expect(isDestructive(layout, box())).toBe(true);
  });
});

describe("furniture collisions use catalog dimensions", () => {
  it("detects a bed overlapping a wardrobe and clears once moved", () => {
    const m = box();
    let out = applyBatch(
      m,
      [
        { op: "place_item", as: "bed", kind: "bed_double", x: 2.5, y: 2 },
        { op: "place_item", kind: "wardrobe", x: 2.5, y: 2.9 },
      ],
      ids(),
    );
    expect(checkModel(out.model).some((i) => i.code === "items_overlap")).toBe(true);
    out = applyBatch(out.model, [{ op: "move_item", id: out.created.bed, x: 1.2, y: 1.2 }], ids());
    expect(checkModel(out.model).some((i) => i.code === "items_overlap")).toBe(false);
  });
});
