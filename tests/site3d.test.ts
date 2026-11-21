import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildSite } from "../src/three/site";
import { VILLA_SITE } from "../src/components/figures/villaSite";

describe("the grounds in 3D", () => {
  const site = buildSite(VILLA_SITE);
  const meshes: THREE.Mesh[] = [];
  site.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  it("builds every piece but the lawn, which is the ground every scene already has", () => {
    expect(meshes.length).toBeGreaterThan(VILLA_SITE.length - 1);
    const box = new THREE.Box3().setFromObject(site);
    const lawn = VILLA_SITE.find((p) => p.kind === "lawn")!;
    // nothing reaches out as far as the lawn's edge, so it was not built
    expect(box.min.x).toBeGreaterThan(lawn.x0);
  });

  it("puts the pool's water just below the terrace around it", () => {
    const pool = VILLA_SITE.find((p) => p.kind === "water")!;
    const deck = VILLA_SITE.find((p) => p.kind === "deck")!;
    const water = meshes.filter((m) => {
      const b = new THREE.Box3().setFromObject(m);
      return Math.abs(b.getCenter(new THREE.Vector3()).x - (pool.x0 + pool.x1) / 2) < 0.01 && b.max.y < deck.z1;
    });
    expect(water.length).toBeGreaterThan(0);
  });

  it("marks the trees that grow in and the terraces that belong in the picture", () => {
    expect(meshes.filter((m) => m.userData.grows).length).toBe(VILLA_SITE.filter((p) => p.kind === "tree" || p.id.endsWith(":trunk")).length);
    expect(meshes.filter((m) => m.userData.frames).length).toBe(VILLA_SITE.filter((p) => p.kind === "deck").length);
  });
});
