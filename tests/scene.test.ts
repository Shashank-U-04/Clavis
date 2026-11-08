import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildContent, disposeGroup } from "../src/three/content";
import { wallMaterial } from "../src/three/materials";
import { applyBatch } from "../src/model/operations";
import { emptyModel, type PlanModel } from "../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";

const design = (): PlanModel => {
  let n = 0;
  return applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, (p) => `${p}_${n++}`).model;
};

const tagged = (root: THREE.Object3D) => {
  const ids: string[] = [];
  root.traverse((o) => {
    if (typeof o.userData.entityId === "string") ids.push(o.userData.entityId);
  });
  return ids;
};

describe("3D content derives from the canonical model", () => {
  it("contains every wall, room and item exactly once", () => {
    const m = design();
    const ids = tagged(buildContent(m).group).sort();
    const expected = [...m.walls, ...m.rooms, ...m.items].map((e) => e.id).sort();
    expect(ids).toEqual(expected);
  });

  it("places furniture at the model's metric position and rotation (plan y → scene z)", () => {
    const m = design();
    const { group } = buildContent(m);
    for (const it of m.items) {
      const o = group.children.find((c) => c.userData.entityId === it.id)!;
      expect(o.position.x).toBeCloseTo(it.x, 6);
      expect(o.position.z).toBeCloseTo(it.y, 6);
      expect(o.rotation.y).toBeCloseTo((it.rotation * Math.PI) / 180, 6);
    }
  });

  it("matches the plan's extent in metres", () => {
    const m = design();
    const { bounds } = buildContent(m);
    // Wall centrelines span 0..9.6 x 0..9 and exterior walls are 0.2 m thick, so the outer wall
    // faces are at -0.1 / 9.7 / -0.1 / 9.1. Window sills and frames may project up to 0.2 m beyond.
    const outside = (v: number, face: number, dir: 1 | -1) => (v - face) * dir;
    for (const [v, face, dir] of [
      [bounds.min.x, -0.1, -1],
      [bounds.max.x, 9.7, 1],
      [bounds.min.z, -0.1, -1],
      [bounds.max.z, 9.1, 1],
    ] as const) {
      expect(outside(v, face, dir)).toBeGreaterThanOrEqual(-1e-6);
      expect(outside(v, face, dir)).toBeLessThanOrEqual(0.2);
    }
  });

  it("a wall edit changes the corresponding 3D wall", () => {
    const m = design();
    const wall = m.walls.find((w) => w.ay === 0 && w.by === 0)!;
    const longer = { ...m, walls: m.walls.map((w) => (w.id === wall.id ? { ...w, height: 3.2 } : w)) };
    const h = (pm: PlanModel) => {
      const o = buildContent(pm).group.children.find((c) => c.userData.entityId === wall.id)!;
      return new THREE.Box3().setFromObject(o).max.y;
    };
    expect(h(longer)).toBeGreaterThan(h(m) + 0.4);
  });
});

describe("disposal on rebuild", () => {
  it("disposes every per-build geometry and material, but never the shared ones", () => {
    const { group } = buildContent(design());
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((x) => materials.add(x));
    });
    const disposed = new Set<unknown>();
    for (const g of geometries) g.addEventListener("dispose", () => disposed.add(g));
    for (const m of materials) m.addEventListener("dispose", () => disposed.add(m));

    disposeGroup(group);

    for (const g of geometries) expect(disposed.has(g)).toBe(true);
    for (const m of materials) expect(disposed.has(m)).toBe(!m.userData.shared);
    expect(materials.has(wallMaterial)).toBe(true);
    expect(disposed.has(wallMaterial)).toBe(false);
  });
});
