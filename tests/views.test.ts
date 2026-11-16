import { describe, it, expect } from "vitest";
import { ALL_VIEWS, readTheme, readViews, soloView, toggleView, type Views } from "../src/studio/views";

const v = (plan: boolean, scene: boolean, side: boolean): Views => ({ plan, scene, side });

describe("studio views", () => {
  it("toggles one view on and off", () => {
    expect(toggleView(ALL_VIEWS, "scene")).toEqual(v(true, false, true));
    expect(toggleView(v(true, false, true), "scene")).toEqual(ALL_VIEWS);
  });

  it("never turns off the last view on screen", () => {
    const chatOnly = v(false, false, true);
    expect(toggleView(chatOnly, "side")).toEqual(chatOnly);
  });

  it("shows one view alone, and everything again when it already is", () => {
    expect(soloView(ALL_VIEWS, "plan")).toEqual(v(true, false, false));
    expect(soloView(v(true, false, false), "plan")).toEqual(ALL_VIEWS);
    expect(soloView(v(true, false, false), "side")).toEqual(v(false, false, true));
  });

  it("reads saved views, and the layouts older studios saved", () => {
    expect(readViews({ plan: false, scene: true, side: false }, undefined)).toEqual(v(false, true, false));
    expect(readViews({ plan: false, scene: false, side: false }, undefined)).toBeUndefined();
    expect(readViews(undefined, "plan")).toEqual(v(true, false, true));
    expect(readViews(undefined, "3d")).toEqual(v(false, true, true));
    expect(readViews(undefined, "split")).toEqual(ALL_VIEWS);
    expect(readViews(undefined, "nonsense")).toBeUndefined();
  });

  it("accepts only known themes", () => {
    expect(readTheme("dark")).toBe("dark");
    expect(readTheme("system")).toBe("system");
    expect(readTheme("sepia")).toBeUndefined();
  });
});
