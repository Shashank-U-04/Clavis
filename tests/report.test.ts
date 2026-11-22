import { describe, it, expect } from "vitest";
import { reportData, ROOM_HEAD, OPENING_HEAD, FURNITURE_HEAD } from "../src/export/reportData";
import { lindenHeightsModel } from "../src/model/templates";
import { levelsOf } from "../src/model/levels";

const model = lindenHeightsModel();
const data = reportData(model);

describe("a design's report", () => {
  it("has a page of numbers for every floor, in order from the ground", () => {
    expect(data.name).toBe("Linden Heights");
    expect(data.floors.map((f) => f.name)).toEqual(levelsOf(model).map((l) => l.name));
  });

  it("lists every room with its size, area and ceiling", () => {
    const rows = data.floors.flatMap((f) => f.rooms);
    expect(rows).toHaveLength(model.rooms.length);
    for (const r of rows) expect(r).toHaveLength(ROOM_HEAD.length);
    const hall = data.floors[0].rooms.find((r) => r[0] === "Entrance hall")!;
    expect(hall[1]).toMatch(/^\d+\.\d\d × \d+\.\d\d m$/);
    expect(hall[3]).toBe("3.00 m");
  });

  it("lists every door and window with the rooms either side and its sizes", () => {
    const rows = data.floors.flatMap((f) => f.openings);
    expect(rows).toHaveLength(model.openings.length);
    for (const r of rows) expect(r).toHaveLength(OPENING_HEAD.length);
    expect(rows.some((r) => r[0] === "Door" && r[1] === "Entrance hall · Outside")).toBe(true);
  });

  it("names every piece of furniture with its size, counting identical pieces together", () => {
    const rows = data.floors.flatMap((f) => f.furniture);
    for (const r of rows) expect(r).toHaveLength(FURNITURE_HEAD.length);
    expect(rows.reduce((n, r) => n + Number(r[3]), 0)).toBe(model.items.length);
    const chairs = rows.find((r) => r[0] === "Dining" && r[1] === "Dining chair")!;
    expect(chairs[2]).toMatch(/× .* × .* m$/);
    expect(Number(chairs[3])).toBe(6);
  });

  it("opens with a summary of the whole design", () => {
    const s = Object.fromEntries(data.summary);
    expect(s.Floors).toBe("3");
    expect(s.Rooms).toBe(String(model.rooms.length));
    expect(s.Checks).toBe("0 errors · 0 warnings");
  });
});

describe("the report as a PDF", () => {
  it("lays out a cover, a plan per floor, the 3D views and the measurements", async () => {
    const { layoutReport } = await import("../src/export/report");
    // a 1 × 1 white PNG stands in for every picture
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const plans = data.floors.map((f) => ({ name: f.name, png, w: 1600, h: 1000 }));
    const views = ["NW", "NE", "SE", "SW", "Front"].map((label) => ({ label, png }));
    const blob = await layoutReport(data, plans, views, "22 November 2026");
    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    // cover + 3 plans + 2 view pages + at least one page of measurements per floor
    expect(pages).toBeGreaterThanOrEqual(1 + 3 + 2 + 3);
    expect(text).toContain("Linden Heights");
  });
});
