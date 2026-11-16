import { describe, it, expect } from "vitest";
import { ALL_VIEWS, featureOn, readTheme, readViews, soloFeature, soloView, toggleFeature, toggleView, type Screen, type Views } from "../src/studio/views";

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

  describe("the four features: plan, 3D model, walk, chat", () => {
    const all: Screen = { views: ALL_VIEWS, walk: false };
    const on = (s: Screen) => (["plan", "model", "walk", "chat"] as const).filter((f) => featureOn(s, f));

    it("shows the 3D model and the walk as two uses of the one 3D view", () => {
      expect(on(all)).toEqual(["plan", "model", "chat"]);
      const walking = toggleFeature(all, "walk");
      expect(walking).toEqual({ views: ALL_VIEWS, walk: true });
      expect(on(walking)).toEqual(["plan", "walk", "chat"]);
      expect(on(toggleFeature(walking, "model"))).toEqual(["plan", "model", "chat"]);
    });

    it("turning the model or the walk off hides the 3D view", () => {
      expect(toggleFeature(all, "model")).toEqual({ views: v(true, false, true), walk: false });
      const walking: Screen = { views: ALL_VIEWS, walk: true };
      expect(toggleFeature(walking, "walk")).toEqual({ views: v(true, false, true), walk: false });
    });

    it("never hides the last view, walk included", () => {
      const onlyWalk: Screen = { views: v(false, true, false), walk: true };
      expect(toggleFeature(onlyWalk, "walk")).toBe(onlyWalk);
      const onlyChat: Screen = { views: v(false, false, true), walk: false };
      expect(toggleFeature(onlyChat, "chat")).toBe(onlyChat);
    });

    it("shows one feature alone, and everything again from there", () => {
      const walkAlone = soloFeature(all, "walk");
      expect(walkAlone).toEqual({ views: v(false, true, false), walk: true });
      expect(soloFeature(walkAlone, "walk")).toEqual(all);
      expect(soloFeature(walkAlone, "model")).toEqual({ views: v(false, true, false), walk: false });
      expect(soloFeature(all, "chat")).toEqual({ views: v(false, false, true), walk: false });
    });
  });
});
