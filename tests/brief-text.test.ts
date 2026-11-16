import { describe, it, expect } from "vitest";
import { briefFor, briefSentence, briefSummary, DEFAULT_CHOICE, type BriefChoice } from "../src/ai/local/briefText";
import { layoutFor, looksLikeBrief } from "../src/ai/local/program";

describe("briefs from choices", () => {
  it("reads every combination back exactly as it was chosen", () => {
    for (const bedrooms of [0, 1, 2, 3, 4, 5])
      for (const bathrooms of [1, 2, 3])
        for (const ensuite of [false, true])
          for (const kitchen of ["open", "separate"] as const)
            for (const flag of [false, true])
              for (const area of [null, 45, 120]) {
                const c: BriefChoice = { bedrooms, bathrooms, ensuite, kitchen, dining: flag, study: flag, utility: !flag, area };
                const s = briefSentence(c);
                const b = briefFor(c);
                expect(looksLikeBrief(s), s).toBe(true);
                expect(b.bedrooms, s).toBe(bedrooms);
                expect(b.bathrooms, s).toBe(bathrooms);
                expect(b.openKitchen, s).toBe(kitchen === "open");
                expect(b.study, s).toBe(c.study);
                expect(b.targetArea, s).toBe(area);
                // rooms the parser adds by itself may join, but nothing chosen is dropped
                if (c.dining) expect(b.dining, s).toBe(true);
                if (c.utility) expect(b.utility, s).toBe(true);
                if (c.ensuite) expect(b.ensuite, s).toBe(true);
                if (!c.ensuite && bathrooms >= 2 && bedrooms >= 2) expect(b.ensuite, s).toBe(false);
              }
  });

  it("words the default plainly and lays it out", () => {
    expect(briefSentence(DEFAULT_CHOICE)).toBe("Design a 2-bedroom home with 1 bathroom and an open kitchen, about 80 m².");
    expect(briefSummary(briefFor(DEFAULT_CHOICE))).toEqual(["2 bedrooms", "1 bathroom", "open kitchen", "about 80 m²"]);
    expect(layoutFor(briefFor(DEFAULT_CHOICE)).spec.rooms.length).toBeGreaterThan(3);
  });
});
