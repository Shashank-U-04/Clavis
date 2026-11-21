import { describe, it, expect } from "vitest";
import { REST, boxFaces, boxFacesAt, paintIndices, paintOrder, project, projector, type Box3 } from "../src/components/figures/iso";
import { buildSunsetFigure, CUT } from "../src/components/figures/sunsetFigure";
import { analyzeModel } from "../src/model/analysis";
import { cedarVillaModel, sunsetLoftModel } from "../src/model/templates";
import { VILLA_SITE } from "../src/components/figures/villaSite";
import { checkModel, summarizeIssues } from "../src/model/issues";

const box = (x0: number, y0: number, x1: number, y1: number, z0 = 0, z1 = 1): Box3 => ({ x0, y0, z0, x1, y1, z1 });

describe("plan-oblique projection", () => {
  it("puts nearer points lower on the page and height straight up", () => {
    expect(project(1, 1, 0).y).toBeGreaterThan(project(0, 0, 0).y);
    expect(project(0, 0, 1).y).toBeCloseTo(project(0, 0, 0).y - 1);
    expect(project(0, 0, 1).x).toBeCloseTo(project(0, 0, 0).x);
  });

  it("keeps the plan true: every floor length at one scale, right angles square", () => {
    const len = (x: number, y: number) => Math.hypot(project(x, y, 0).x, project(x, y, 0).y);
    expect(len(12.2, 0)).toBeCloseTo(12.2);
    expect(len(0, 10.1)).toBeCloseTo(10.1);
    expect(len(3, 4)).toBeCloseTo(5);
    const ex = project(1, 0, 0);
    const ey = project(0, 1, 0);
    expect(ex.x * ey.x + ex.y * ey.y).toBeCloseTo(0);
  });

  it("draws a block as two sides and a top, a flat slab as a top only", () => {
    expect(boxFaces(box(0, 0, 1, 1), 10).map((f) => f.tone)).toEqual(["left", "right", "top"]);
    expect(boxFaces(box(0, 0, 1, 1, 0, 0), 10).map((f) => f.tone)).toEqual(["top"]);
  });
});

describe("painter's order", () => {
  const order = (...boxes: Box3[]) => paintOrder(boxes.map((b, i) => ({ box: b, i }))).map((x) => x.i);

  it("paints farther boxes first along either floor axis", () => {
    expect(order(box(2, 0, 3, 1), box(0, 0, 1, 1))).toEqual([1, 0]);
    expect(order(box(0, 2, 1, 3), box(0, 0, 1, 1))).toEqual([1, 0]);
  });

  it("paints a box resting on another after it", () => {
    expect(order(box(0, 0, 1, 1, 1, 2), box(0, 0, 1, 1, 0, 1))).toEqual([1, 0]);
  });

  it("handles a long wall behind a short piece that overlaps it on screen", () => {
    const wall = box(0, 0, 10, 0.2, 0, 1.2);
    const chair = box(4, 0.5, 4.5, 1, 0, 0.9);
    expect(order(chair, wall)).toEqual([1, 0]);
  });
});

describe("the Sunset Loft figure", () => {
  it("shows every room with readouts taken from the app's own analysis", () => {
    const data = buildSunsetFigure();
    const a = analyzeModel(sunsetLoftModel());
    expect(data.rooms).toHaveLength(a.rooms.length);
    for (const r of data.rooms) {
      const truth = a.rooms.find((x) => x.label === r.label)!;
      expect(r.area).toBeCloseTo(truth.area, 1);
      expect(r.daylight).toBe(Math.round(truth.daylightRatio * 100));
      expect(r.doorsFromEntrance).toBe(truth.depth);
    }
  });

  it("is cut like a section: nothing rises above the cut height", () => {
    const data = buildSunsetFigure();
    expect(data.solids.length).toBeGreaterThan(100);
    expect(CUT).toBe(1.2);
    expect(data.arcs.length).toBeGreaterThanOrEqual(7); // one swing per door leaf
  });
});

describe("the live build figure's data", () => {
  const model = sunsetLoftModel();
  const data = buildSunsetFigure(model);

  it("gives the overall outside dimensions: the wall centrelines plus one wall thickness", () => {
    const xs = model.walls.flatMap((w) => [w.ax, w.bx]);
    const ys = model.walls.flatMap((w) => [w.ay, w.by]);
    const t = Math.max(...model.walls.map((w) => w.thickness));
    const span = (v: number[]) => `${(Math.max(...v) - Math.min(...v) + t).toFixed(2)} m`;
    expect(data.dims.map((d) => d.text).sort()).toEqual([span(xs), span(ys)].sort());
    for (const d of data.dims) expect(d.ext).toHaveLength(2);
  });

  it("labels every room with its measured area", () => {
    const a = analyzeModel(model);
    expect(data.labels.map((l) => l.id)).toEqual(model.rooms.map((r) => r.id));
    for (const l of data.labels) expect(l.area).toBeCloseTo(a.rooms.find((r) => r.id === l.id)!.area, 1);
  });

  it("keeps each solid's box and the group it is built with", () => {
    for (const s of data.solids) {
      expect(s.box.z1).toBeGreaterThanOrEqual(s.box.z0);
      expect(s.id.startsWith(s.group)).toBe(true);
    }
    const items = new Set(data.solids.filter((s) => s.kind === "item" || s.kind === "rug").map((s) => s.group));
    expect(items.size).toBe(model.items.filter((i) => i.kind).length);
  });
});

describe("the villa figure on the landing page", () => {
  const model = cedarVillaModel();
  const data = buildSunsetFigure(model, VILLA_SITE);

  it("is a valid design: no errors or warnings from the validator", () => {
    const counts = summarizeIssues(checkModel(model));
    expect(counts.error).toBe(0);
    expect(counts.warning).toBe(0);
  });

  it("draws the lawn as ground, and the terrace, pool and trees as solids with their own groups", () => {
    expect(data.ground.map((g) => g.id)).toEqual(["lawn"]);
    expect(data.solids.some((s) => s.kind === "lawn")).toBe(false);
    for (const kind of ["deck", "water", "hedge", "tree"] as const) expect(data.solids.some((s) => s.kind === kind)).toBe(true);
    expect(data.labels.map((l) => l.label)).toEqual(expect.arrayContaining(["Pool", "Terrace"]));
    expect(new Set(data.solids.map((s) => s.id)).size).toBe(data.solids.length); // React keys
  });

  it("still measures the house, not the grounds, and sets its text larger than the small drawings'", () => {
    expect(data.dims.map((d) => d.text).sort()).toEqual(["14.60 m", "24.20 m"]);
    expect(data.textScale).toBeGreaterThan(1.5);
    expect(buildSunsetFigure().textScale).toBeCloseTo(1, 1);
  });
});

describe("turning a figure", () => {
  it("projects exactly as the published drawing at rest, wherever it turns about", () => {
    for (const pivot of [{ x: 0, y: 0 }, { x: 7, y: -3 }]) {
      const P = projector(REST, pivot);
      for (const [x, y, z] of [[1, 2, 0], [-4, 3, 1.2], [10, 0.5, 3]]) {
        expect(P(x, y, z).x).toBeCloseTo(project(x, y, z).x, 9);
        expect(P(x, y, z).y).toBeCloseTo(project(x, y, z).y, 9);
      }
    }
    const b = box(0, 0, 2, 1, 0, 1);
    expect(boxFacesAt(b, 10, project, REST.turn)).toEqual(boxFaces(b, 10));
  });

  it("shows the faces towards the viewer from every side, lit from the right", () => {
    const b = box(0, 0, 2, 1, 0, 1);
    for (const deg of [10, 100, 190, 280]) {
      const turn = (deg * Math.PI) / 180;
      const faces = boxFacesAt(b, 10, projector({ ...REST, turn }), turn);
      expect(faces.map((f) => f.tone).sort()).toEqual(["left", "right", "top"]);
    }
  });

  it("paints the far box first, and swaps when the drawing is turned round", () => {
    const far = box(0, 0, 1, 1);
    const near = box(3, 0, 4, 1);
    const at = (deg: number) => paintIndices([near, far], projector({ ...REST, turn: (deg * Math.PI) / 180 }), (deg * Math.PI) / 180);
    expect(at(30)).toEqual([1, 0]);
    expect(at(210)).toEqual([0, 1]);
  });

  it("carries the world data a turnable figure needs, and frames every turn", () => {
    const data = buildSunsetFigure(cedarVillaModel(), VILLA_SITE, { turnable: true });
    const w = data.world!;
    expect(w.rooms).toHaveLength(data.rooms.length);
    expect(w.arcs).toHaveLength(data.arcs.length);
    expect(w.labels).toHaveLength(data.labels.length);
    expect(w.ground).toHaveLength(data.ground.length);
    expect(buildSunsetFigure(cedarVillaModel(), VILLA_SITE).world).toBeUndefined();
    // the frame holds the drawing turned half round
    const [vx, vy, vw, vh] = data.viewBox.split(" ").map(Number);
    const P = projector({ ...REST, turn: REST.turn + Math.PI }, w.pivot);
    for (const s of data.solids)
      for (const [x, y] of [[s.box.x0, s.box.y0], [s.box.x1, s.box.y1]]) {
        const q = P(x, y, s.box.z1);
        expect(q.x * data.scale).toBeGreaterThanOrEqual(vx);
        expect(q.x * data.scale).toBeLessThanOrEqual(vx + vw);
        expect(q.y * data.scale).toBeGreaterThanOrEqual(vy);
        expect(q.y * data.scale).toBeLessThanOrEqual(vy + vh);
      }
  });
});
