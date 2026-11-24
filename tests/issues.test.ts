import { describe, it, expect } from "vitest";
import { checkModel, clampOpeningT, diffIssues } from "../src/model/issues";
import { applyBatch } from "../src/model/operations";
import { emptyModel, type Opening, type PlanModel, type Wall } from "../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";

const wall = (id: string, ax: number, ay: number, bx: number, by: number, thickness = 0.15): Wall => ({ id, ax, ay, bx, by, thickness, height: 2.7 });
const codes = (m: PlanModel) => checkModel(m).map((i) => i.code);
const plan = (p: Partial<PlanModel>): PlanModel => ({ ...emptyModel(), ...p });

/** A closed 5 × 4 m box of walls with one room inside and a door on the south wall. */
function boxRoom(): PlanModel {
  return plan({
    walls: [wall("n", 0, 0, 5, 0), wall("e", 5, 0, 5, 4), wall("s", 5, 4, 0, 4), wall("w", 0, 4, 0, 0)],
    rooms: [{ id: "r", x: 0.075, y: 0.075, w: 4.85, h: 3.85, label: "Store", floor: "oak" }],
    openings: [{ id: "d", kind: "door", wallId: "s", t: 0.5, width: 0.9, sill: 0, height: 2.1 }],
  });
}

describe("a clean design", () => {
  it("the template has no errors or warnings", () => {
    let n = 0;
    const m = applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, (p) => `${p}_${n++}`).model;
    expect(checkModel(m).filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("a closed box with a door is clean", () => {
    expect(codes(boxRoom())).toEqual([]);
  });
});

describe("walls", () => {
  it("reports a wall shorter than 20 cm", () => {
    expect(codes(plan({ walls: [wall("a", 0, 0, 0.12, 0)] }))).toContain("wall_too_short");
  });

  it("reports walls stacked on one line and walls that cut through each other", () => {
    expect(codes(plan({ walls: [wall("a", 0, 0, 5, 0), wall("b", 3, 0, 8, 0)] }))).toContain("walls_overlap_collinear");
    expect(codes(plan({ walls: [wall("a", 0, 0, 5, 0), wall("b", 2.5, -1, 2.5, 1)] }))).toContain("walls_cross");
  });

  it("treats L and T junctions as joined, and reports a dangling end", () => {
    const tee = plan({ walls: [wall("a", 0, 0, 5, 0), wall("b", 2.5, 0, 2.5, 3)] });
    const loose = checkModel(tee).filter((i) => i.code === "wall_loose_end");
    // only the far ends dangle: both ends of a, and the free end of b
    expect(loose.map((i) => i.measurements)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 2.5, y: 3 },
    ]);
  });
});

describe("doors and windows", () => {
  const withOpening = (o: Partial<Opening>) => {
    const m = boxRoom();
    m.openings.push({ id: "x", kind: "window", wallId: "n", t: 0.5, width: 1.2, sill: 0.9, height: 1.2, ...o });
    return m;
  };

  it("reports a missing host wall, an opening past the wall end, and one taller than the wall", () => {
    expect(codes(withOpening({ wallId: "ghost" }))).toContain("opening_orphan");
    expect(codes(withOpening({ t: 0.98 }))).toContain("opening_overflow");
    expect(codes(withOpening({ height: 2 }))).toContain("opening_too_tall");
  });

  it("warns about narrow doors and reports overlapping openings", () => {
    expect(codes(withOpening({ kind: "door", sill: 0, height: 2.1, width: 0.6 }))).toContain("door_narrow");
    const m = withOpening({});
    m.openings.push({ id: "y", kind: "window", wallId: "n", t: 0.55, width: 1.2, sill: 0.9, height: 1.2 });
    expect(codes(m)).toContain("openings_overlap");
  });

  it("reports a wall that ends inside an opening", () => {
    const m = withOpening({});
    m.walls.push(wall("inner", 2.5, 0, 2.5, 2));
    expect(codes(m)).toContain("wall_ends_in_opening");
  });

  it("fits openings inside their wall", () => {
    const w = wall("w", 0, 0, 4, 0);
    expect(clampOpeningT(w, 1, 0)).toBeCloseTo(0.125);
    expect(clampOpeningT(w, 1, 0.6)).toBeCloseTo(0.6);
    expect(clampOpeningT(w, 4.5, 0.5)).toBeNull();
  });
});

describe("rooms", () => {
  it("reports overlapping, tiny, door-less and wall-less rooms", () => {
    const m = boxRoom();
    m.rooms.push({ id: "r2", x: 4, y: 3, w: 3, h: 3, label: "Annex", floor: "oak" });
    m.rooms.push({ id: "r3", x: 1, y: 1, w: 0.3, h: 0.3, label: "Nook", floor: "oak" });
    m.rooms.push({ id: "r4", x: 20, y: 20, w: 3, h: 3, label: "Shed", floor: "oak" });
    const c = codes(m);
    for (const code of ["rooms_overlap", "room_too_small", "room_floating", "room_no_door"]) expect(c).toContain(code);
  });

  it("asks for a window only in habitable rooms", () => {
    const store = boxRoom();
    expect(codes(store)).not.toContain("room_no_window");
    store.rooms[0].label = "Bedroom";
    expect(codes(store)).toContain("room_no_window");
  });
});

describe("furniture", () => {
  const furnished = (...items: PlanModel["items"]) => ({ ...boxRoom(), items });

  it("lets a piece lean on a wall but not pass through it", () => {
    // wardrobe 0.6 deep, back against the inside face of the north wall (y = 0.075)
    expect(codes(furnished({ id: "a", kind: "wardrobe", x: 2.5, y: 0.075 + 0.3, rotation: 0 }))).toEqual([]);
    expect(codes(furnished({ id: "a", kind: "wardrobe", x: 2.5, y: 0.1, rotation: 0 }))).toContain("item_through_wall");
  });

  it("reports a room a person cannot walk through, and not one with a 0.6 m way past", () => {
    // two sofas across the room, 0.45 m apart: the far half cannot be reached from the door
    const cut = checkModel(furnished({ id: "a", kind: "sofa", x: 1.2, y: 2, rotation: 0 }, { id: "b", kind: "sofa", x: 3.75, y: 2, rotation: 0 }));
    const found = cut.find((i) => i.code === "room_not_walkable");
    expect(found).toMatchObject({ severity: "warning", refs: ["r"] });
    expect(found!.measurements!.reach).toBeLessThan(0.6);
    expect(found!.message).toMatch(/only \d+% of its free floor/);
    // the same sofas 0.7 m apart leave a way through
    expect(codes(furnished({ id: "a", kind: "sofa", x: 1.1, y: 2, rotation: 0 }, { id: "b", kind: "sofa", x: 3.9, y: 2, rotation: 0 }))).not.toContain("room_not_walkable");
    // rugs are walked over
    expect(codes(furnished({ id: "a", kind: "rug", x: 2.5, y: 2, rotation: 0 }))).not.toContain("room_not_walkable");
  });

  it("keeps doors clear, and windows clear of anything taller than the sill", () => {
    expect(codes(furnished({ id: "a", kind: "armchair", x: 2.5, y: 3.4, rotation: 180 }))).toContain("item_blocks_door");
    const m = furnished({ id: "a", kind: "bookshelf", x: 2.5, y: 0.25, rotation: 0 });
    m.openings.push({ id: "win", kind: "window", wallId: "n", t: 0.5, width: 1.2, sill: 0.9, height: 1.2 });
    expect(codes(m)).toContain("item_blocks_window");
    m.items = [{ id: "a", kind: "side_table", x: 2.5, y: 0.35, rotation: 0 }]; // 0.5 m: below the sill
    expect(codes(m)).not.toContain("item_blocks_window");
  });

  it("reports overlapping pieces, except rugs", () => {
    expect(codes(furnished({ id: "a", kind: "sofa", x: 2, y: 2, rotation: 0 }, { id: "b", kind: "coffee_table", x: 2.3, y: 2.1, rotation: 0 }))).toContain("items_overlap");
    expect(codes(furnished({ id: "a", kind: "rug", x: 2, y: 2, rotation: 0 }, { id: "b", kind: "coffee_table", x: 2, y: 2, rotation: 0 }))).not.toContain("items_overlap");
  });

  it("reports pieces outside every room or sticking out of theirs", () => {
    expect(codes(furnished({ id: "a", kind: "plant", x: 9, y: 9, rotation: 0 }))).toContain("item_outside_rooms");
    expect(codes(furnished({ id: "a", kind: "desk", x: 4.6, y: 2, rotation: 0 }))).toContain("item_outside_room");
  });

  it("reports unknown catalog kinds", () => {
    expect(codes(furnished({ id: "a", kind: "hot_tub", x: 2, y: 2, rotation: 0 }))).toContain("item_unknown");
  });
});

describe("ids", () => {
  it("are stable across runs and let changes be compared", () => {
    const m = boxRoom();
    m.items.push({ id: "a", kind: "armchair", x: 2.5, y: 3.4, rotation: 180 });
    const before = checkModel(m);
    expect(checkModel(m)).toEqual(before);
    expect(before.find((i) => i.code === "item_blocks_door")?.id).toBe("item_blocks_door:a+d");
    const moved = { ...m, items: [{ ...m.items[0], y: 1.5 }] };
    const d = diffIssues(before, checkModel(moved));
    // an armchair in the doorway also leaves no way into the room; moving it clears both
    expect(d.resolved.map((i) => i.code).sort()).toEqual(["item_blocks_door", "room_not_walkable"]);
    expect(d.introduced).toEqual([]);
  });

  it("refuse to measure a design with impossible numbers", () => {
    const m = boxRoom();
    m.walls[0] = { ...m.walls[0], thickness: -1 };
    expect(codes(m)).toEqual(["invalid_dimension"]);
  });
});

describe("the published check list", () => {
  it("matches exactly the codes the engine can emit", async () => {
    const { readFileSync } = await import("node:fs");
    const { CHECK_CODES } = await import("../src/model/checks");
    const source = ["src/model/issues.ts", "src/model/analysis.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
    const emitted = new Set([...source.matchAll(/code: "([a-z_]+)"/g)].map((m) => m[1]));
    expect([...emitted].sort()).toEqual([...CHECK_CODES].sort());
  });
});
