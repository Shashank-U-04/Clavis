import { describe, it, expect } from "vitest";
import { analyzeModel, reviewFindings, roomTypes } from "../src/model/analysis";
import { applyBatch } from "../src/model/operations";
import { emptyModel, type PlanModel } from "../src/model/types";
import { checkModel } from "../src/model/issues";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";
import { sunsetLoftModel, templateModel } from "../src/model/templates";
import type { LayoutSpec } from "../src/model/layout";

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_${n++}`;
};

function layout(spec: LayoutSpec): PlanModel {
  const out = applyBatch(emptyModel(), [{ op: "build_layout", ...spec }], ids());
  if (!out.ok) throw new Error(out.error?.message);
  return out.model;
}

const template = () => {
  const out = applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, ids());
  if (!out.ok) throw new Error(out.error?.message);
  return out.model;
};

describe("room types", () => {
  it("reads every type a label suggests", () => {
    expect(roomTypes("Living & Kitchen")).toEqual(["living", "kitchen"]);
    expect(roomTypes("Master bath")).toEqual(["bath", "bedroom"]);
    expect(roomTypes("Bedroom 2")).toEqual(["bedroom"]);
    expect(roomTypes("Hall")).toEqual(["hall"]);
    expect(roomTypes("Mystery")).toEqual(["other"]);
  });
});

describe("circulation", () => {
  it("routes the template from its entrance to every room", () => {
    const m = template();
    const a = analyzeModel(m);
    expect(a.entrances).toHaveLength(1);
    for (const r of a.rooms) expect(r.depth, r.label).not.toBeNull();
    const hall = a.rooms.find((r) => r.label === "Hall")!;
    const bath = a.rooms.find((r) => r.label === "Bathroom")!;
    expect(hall.depth).toBe(1);
    expect(bath.route).toEqual([hall.id, bath.id]);
    expect(bath.routeDoors).toHaveLength(2);
  });

  it("flags a room whose door does not connect back to the entrance", () => {
    const m = layout({
      rooms: [
        { as: "a", label: "Living", x: 0, y: 0, w: 4, h: 4 },
        { as: "b", label: "Study", x: 4, y: 0, w: 3, h: 4 },
        { as: "c", label: "Store", x: 7, y: 0, w: 2, h: 4 },
      ],
      doors: [
        { from: "a", to: "exterior", side: "south" },
        { from: "c", to: "b" },
      ],
      windows: [
        { room: "a", side: "north" },
        { room: "b", side: "north" },
      ],
    });
    const codes = reviewFindings(m).map((f) => f.code);
    expect(codes.filter((c) => c === "room_unreachable")).toHaveLength(2);
  });

  it("warns when no door leads outside", () => {
    const m = layout({
      rooms: [
        { as: "a", label: "Living", x: 0, y: 0, w: 4, h: 4 },
        { as: "b", label: "Study", x: 4, y: 0, w: 3, h: 4 },
      ],
      doors: [{ from: "a", to: "b" }],
      windows: [
        { room: "a", side: "north", width: 2 },
        { room: "b", side: "north", width: 2 },
      ],
    });
    expect(reviewFindings(m).map((f) => f.code)).toContain("no_entrance");
  });

  it("notes a room reached only through a bedroom", () => {
    const m = layout({
      rooms: [
        { as: "hall", label: "Hall", x: 0, y: 0, w: 2, h: 4 },
        { as: "bed", label: "Bedroom", x: 2, y: 0, w: 3.5, h: 4 },
        { as: "bath", label: "En-suite", x: 5.5, y: 0, w: 2, h: 4 },
      ],
      doors: [
        { from: "hall", to: "exterior", side: "west" },
        { from: "bed", to: "hall" },
        { from: "bath", to: "bed" },
      ],
      windows: [{ room: "bed", side: "north", width: 1.6 }],
    });
    const f = reviewFindings(m).find((x) => x.code === "route_through_private");
    expect(f?.severity).toBe("info");
  });
});

describe("habitability", () => {
  it("reports low daylight, a missing escape window and an undersized bedroom", () => {
    const m = layout({
      rooms: [{ as: "bed", label: "Bedroom", x: 0, y: 0, w: 2.2, h: 2.6 }],
      doors: [{ from: "bed", to: "exterior", side: "south" }],
      windows: [{ room: "bed", side: "north", width: 0.4, sill: 1.5, height: 0.4 }],
    });
    const codes = reviewFindings(m).map((f) => f.code);
    expect(codes).toContain("room_low_daylight");
    expect(codes).toContain("bedroom_no_escape_window");
    expect(codes).toContain("room_undersized");
  });

  it("asks for extract ventilation in a windowless bathroom (info only)", () => {
    const m = layout({
      rooms: [
        { as: "hall", label: "Hall", x: 0, y: 0, w: 3, h: 2 },
        { as: "wc", label: "WC", x: 3, y: 0, w: 1.6, h: 2 },
      ],
      doors: [
        { from: "hall", to: "exterior", side: "west" },
        { from: "wc", to: "hall" },
      ],
    });
    const f = reviewFindings(m).find((x) => x.code === "bath_needs_extract");
    expect(f?.severity).toBe("info");
  });
});

describe("metrics and regressions", () => {
  it("measures carpet and envelope areas", () => {
    const a = analyzeModel(template());
    expect(a.metrics.bedrooms).toBe(2);
    expect(a.metrics.bathrooms).toBe(1);
    expect(a.metrics.envelope).toMatchObject({ x: -0.1, y: -0.1, w: 9.8, h: 9.6 });
    expect(a.metrics.efficiency).toBeGreaterThan(0.75);
    expect(a.metrics.efficiency).toBeLessThan(1);
  });

  it("keeps the template and the Sunset Loft free of warnings and errors", () => {
    for (const m of [templateModel(), sunsetLoftModel()]) {
      expect(checkModel(m).filter((i) => i.severity !== "info")).toEqual([]);
    }
  });

  it("the Sunset Loft is a generous, fully reachable home", () => {
    const a = analyzeModel(sunsetLoftModel());
    expect(a.metrics.carpetArea).toBeGreaterThan(100);
    expect(a.metrics.bedrooms).toBe(2);
    expect(a.rooms.every((r) => r.depth !== null)).toBe(true);
    const living = a.rooms.find((r) => r.label === "Living & Kitchen")!;
    expect(living.area).toBeGreaterThan(35);
    expect(living.daylightRatio).toBeGreaterThan(0.2);
  });
});
