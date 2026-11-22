import { describe, it, expect } from "vitest";
import { TEMPLATES, findTemplate } from "../src/lib/catalogue";
import { buildTemplate, templateFacts } from "../src/lib/buildTemplate";
import { checkModel } from "../src/model/issues";
import { blockedRooms } from "../src/model/walkable";
import { localProposal } from "../src/ai/local/engine";
import { applyBatch } from "../src/model/operations";
import { emptyModel, type PlanModel } from "../src/model/types";
import { solidsOf, step } from "../src/three/walkCollision";
import { levelsOf, onLevel } from "../src/model/levels";
import { openingCenter } from "../src/model/issues";

/** Door sides where a person cannot walk 1.2 m straight in: something stands in the doorway's line. */
function crowdedDoors(m: PlanModel): string[] {
  const bad: string[] = [];
  for (const level of levelsOf(m)) {
    const f = onLevel(m, level.id);
    const s = solidsOf(f);
    for (const o of f.openings.filter((x) => x.kind === "door")) {
      const w = f.walls.find((x) => x.id === o.wallId)!;
      const c = openingCenter(w, o);
      const len = Math.hypot(w.bx - w.ax, w.by - w.ay);
      const n = { x: -(w.by - w.ay) / len, y: (w.bx - w.ax) / len };
      for (const d of [1, -1]) {
        const to = { x: c.x + n.x * 1.2 * d, y: c.y + n.y * 1.2 * d };
        let p = { x: c.x, y: c.y };
        for (let i = 0; i < 40; i++) p = step(p.x, p.y, (to.x - c.x) / 40, (to.y - c.y) / 40, s, () => true);
        if (Math.hypot(p.x - to.x, p.y - to.y) > 0.05) bad.push(`${level.name}: door ${o.id}`);
      }
    }
  }
  return bad;
}

describe("template catalogue", () => {
  it("offers a few homes, each a different kind, with unique slugs", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(4);
    expect(TEMPLATES.length).toBeLessThanOrEqual(6);
    expect(new Set(TEMPLATES.map((t) => t.slug)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(t.maker === "hand" || !!t.brief, t.slug).toBe(true);
  });

  for (const t of TEMPLATES) {
    it(`${t.slug} builds under its own name with no errors or warnings`, () => {
      const m = buildTemplate(t.slug);
      expect(m.name).toBe(t.name);
      expect(checkModel(m).filter((i) => i.severity !== "info")).toEqual([]);
      const f = templateFacts(m);
      expect(f.area).toBeGreaterThan(30);
      expect(f.items).toBeGreaterThan(5);
    });

    it(`${t.slug}: a person can walk from every door of every room to every other, with 0.6 m to spare`, () => {
      expect(blockedRooms(buildTemplate(t.slug), 0.3)).toEqual([]);
    });

    it(`${t.slug}: every door opens onto 1.2 m of clear floor on both sides`, () => {
      expect(crowdedDoors(buildTemplate(t.slug))).toEqual([]);
    });
  }

  it("is deterministic", () => {
    expect(buildTemplate("linden-heights")).toEqual(buildTemplate("linden-heights"));
    expect(findTemplate("nope")).toBeUndefined();
    expect(buildTemplate("nope").rooms.length).toBeGreaterThan(0);
  });
});

describe("homes laid out from a brief by Clavis Local", () => {
  const fromBrief = (brief: string) => {
    let n = 0;
    const out = applyBatch(emptyModel(), localProposal({ mode: "design", instruction: brief, context: { design: {} } }, emptyModel()).operations, (p) => `${p}_${n++}`);
    return out.model;
  };
  it.each([
    ["studio apartment, 38 m2", 0],
    ["one bedroom flat with an open kitchen, 52 m2", 1],
    ["3 bedroom house with 2 bathrooms and a study, 120 m2", 3],
    ["4 bedroom home with separate kitchen and laundry, 150 m2", 4],
    ["5 bedroom villa 250 sqm", 5],
  ])("“%s” has %i bedrooms and no errors", (brief, beds) => {
    const m = fromBrief(brief);
    expect(templateFacts(m).bedrooms).toBe(beds);
    expect(checkModel(m).filter((i) => i.severity === "error")).toEqual([]);
  });
});
