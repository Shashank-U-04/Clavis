import { describe, it, expect } from "vitest";
import { TEMPLATES, findTemplate } from "../src/lib/catalogue";
import { buildTemplate, templateFacts } from "../src/lib/buildTemplate";
import { checkModel } from "../src/model/issues";

describe("template catalogue", () => {
  it("has unique slugs and a brief for every generated template", () => {
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
  }

  it("is deterministic", () => {
    expect(buildTemplate("family-house")).toEqual(buildTemplate("family-house"));
  });

  it("matches what each blurb promises", () => {
    const beds = (slug: string) => templateFacts(buildTemplate(slug)).bedrooms;
    expect(beds("studio-apartment")).toBe(0);
    expect(beds("one-bedroom-flat")).toBe(1);
    expect(beds("family-house")).toBe(3);
    expect(beds("four-bedroom-home")).toBe(4);
    expect(beds("five-bedroom-villa")).toBe(5);
    expect(findTemplate("nope")).toBeUndefined();
    expect(buildTemplate("nope").rooms.length).toBeGreaterThan(0);
  });
});
