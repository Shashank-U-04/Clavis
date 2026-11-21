import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { grass, oak, worldUV } from "../src/three/textures";
import { floorMaterial, wallMaterial } from "../src/three/materials";

describe("surface textures", () => {
  it("are not drawn where there is no canvas, and the materials keep their plain colours", () => {
    expect(oak()).toBeNull();
    expect(grass()).toBeNull();
    expect(floorMaterial("oak").map).toBeNull();
    expect(wallMaterial.map).toBeNull();
  });

  it("repeat at their real size: UVs are metres over the tile size, on every face", () => {
    const g = worldUV(new THREE.BoxGeometry(4, 2, 6), 2);
    const pos = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const across = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))];
      const want = across[0] > 0.5 ? [z, y] : across[1] > 0.5 ? [x, z] : [x, y];
      expect(uv.getX(i)).toBeCloseTo(want[0] / 2, 9);
      expect(uv.getY(i)).toBeCloseTo(want[1] / 2, 9);
    }
  });
});
