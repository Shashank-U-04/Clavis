import { describe, it, expect } from "vitest";
import { buildLayout, type LayoutSpec } from "../src/model/layout";
import { applyBatch } from "../src/model/operations";
import { emptyModel } from "../src/model/types";
import { checkModel } from "../src/model/issues";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_${n++}`;
};

const build = (spec: LayoutSpec) => buildLayout(spec, ids());

describe("buildLayout", () => {
  it("turns two adjacent rooms into one shared interior wall and six exterior walls", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 4, h: 3 },
        { as: "b", label: "B", x: 4, y: 0, w: 3, h: 3 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const interior = r.walls.filter((w) => w.thickness === 0.1);
    expect(interior).toHaveLength(1);
    expect(interior[0]).toMatchObject({ ax: 4, ay: 0, bx: 4, by: 3 });
    // north and south lines each merge into a single 7 m exterior wall
    expect(r.walls.filter((w) => w.ay === 0 && w.by === 0)).toHaveLength(1);
    expect(r.walls).toHaveLength(5);
  });

  it("stores rooms as the clear floor inside the wall faces", () => {
    const r = build({ rooms: [{ as: "a", label: "A", x: 0, y: 0, w: 4, h: 3 }], exteriorThickness: 0.2 });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.rooms[0]).toMatchObject({ x: 0.1, y: 0.1, w: 3.8, h: 2.8 });
  });

  it("splits walls at X-junctions so no two walls cross mid-span", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 3, h: 3 },
        { as: "b", label: "B", x: 3, y: 0, w: 3, h: 3 },
        { as: "c", label: "C", x: 0, y: 3, w: 3, h: 3 },
        { as: "d", label: "D", x: 3, y: 3, w: 3, h: 3 },
      ],
    });
    if (!r.ok) throw new Error(r.error.message);
    const m = { ...emptyModel(), walls: r.walls, rooms: r.rooms };
    expect(checkModel(m).filter((i) => i.code === "walls_cross")).toEqual([]);
  });

  it("rejects overlapping rooms with the overlap size", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 4, h: 3 },
        { as: "b", label: "B", x: 3, y: 1, w: 3, h: 3 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("rooms_overlap");
  });

  it("rejects a sliver gap between rooms that would double the walls", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 4, h: 3 },
        { as: "b", label: "B", x: 4.1, y: 0, w: 3, h: 3 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("rooms_near_miss");
  });

  it("refuses a door between rooms that share no wall", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 3, h: 3 },
        { as: "b", label: "B", x: 5, y: 0, w: 3, h: 3 },
      ],
      doors: [{ from: "a", to: "b" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("no_shared_wall");
  });

  it("refuses a window on a side that is not exterior", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 3, h: 3 },
        { as: "b", label: "B", x: 3, y: 0, w: 3, h: 3 },
      ],
      windows: [{ room: "a", side: "east" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_exterior");
  });

  it("places a shared door inside its host wall, between the two rooms", () => {
    const r = build({
      rooms: [
        { as: "a", label: "A", x: 0, y: 0, w: 4, h: 3 },
        { as: "b", label: "B", x: 4, y: 0, w: 3, h: 3 },
      ],
      doors: [{ from: "a", to: "b" }],
    });
    if (!r.ok) throw new Error(r.error.message);
    const door = r.openings[0];
    const host = r.walls.find((w) => w.id === door.wallId)!;
    expect(host).toMatchObject({ ax: 4, bx: 4 });
    expect(door.t).toBeCloseTo(0.5, 5);
  });

  it("is deterministic", () => {
    const spec = (COMPACT_TWO_BEDROOM[0] as { op: string } & LayoutSpec);
    const { op: _op, ...s } = spec;
    expect(build(s)).toEqual(build(s));
  });
});

describe("compact two-bedroom template", () => {
  it("builds and validates with zero issues", () => {
    const out = applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, ids());
    expect(out.error).toBeUndefined();
    expect(out.ok).toBe(true);
    expect(checkModel(out.model)).toEqual([]);
    expect(out.model.rooms.map((r) => r.label)).toEqual(["Living & Kitchen", "Bedroom 1", "Hall", "Bedroom 2", "Bathroom"]);
    expect(out.model.items).toHaveLength(12);
  });
});
