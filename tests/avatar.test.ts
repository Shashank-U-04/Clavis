import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Avatar, EYE_HEIGHT, STATURE } from "../src/three/avatar";

const box = (a: Avatar) => new THREE.Box3().setFromObject(a.root);

describe("the walker is an adult at real size", () => {
  it("stands 1.75 m tall, feet on the floor, with the eyes at 1.63 m", () => {
    const a = new Avatar();
    const b = box(a);
    expect(b.min.y).toBeGreaterThan(-0.02);
    expect(b.min.y).toBeLessThan(0.02);
    expect(b.max.y).toBeGreaterThan(STATURE - 0.03);
    expect(b.max.y).toBeLessThan(STATURE + 0.03);
    expect(EYE_HEIGHT).toBeCloseTo(1.63, 2);
    expect(EYE_HEIGHT).toBeLessThan(STATURE - 0.08); // the eyes sit below the crown of the head
  });

  it("is about as broad as a person at the shoulders, and fits a 0.8 m doorway", () => {
    const size = box(new Avatar()).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.4);
    expect(size.x).toBeLessThan(0.6);
    expect(size.z).toBeLessThan(0.45);
  });

  it("swings its legs as it walks, and stands still when it stops", () => {
    const a = new Avatar();
    const legs = () => a.root.children[0].children.filter((c) => c.children.length > 0 && c.position.x !== 0).map((c) => c.rotation.x);
    for (let i = 0; i < 20; i++) a.update(1 / 60, 1.4 / 60, 1.4, false);
    const walking = legs();
    expect(Math.abs(walking[0] - walking[1])).toBeGreaterThan(0.05);
    for (let i = 0; i < 200; i++) a.update(1 / 60, 0, 0, false);
    const still = legs();
    expect(Math.abs(still[0] - still[1])).toBeLessThan(0.02);
  });
});
