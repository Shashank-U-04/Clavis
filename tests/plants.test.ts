import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkModel } from "../src/model/issues";
import { emptyModel, type Item, type PlanModel, type Wall } from "../src/model/types";
import { buildFurniture } from "../src/three/furniture";

const DIR = path.resolve("public/models/plants");
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, "plants.json"), "utf8")) as {
  name: string;
  format?: number;
  height: number;
  spread: number;
  bark: { type: string };
  leaves: { type: string };
  branches: { vertices: number; indices: number; offsets: Record<string, number> };
  foliage: { vertices: number; indices: number; offsets: Record<string, number> };
}[];

describe("the grown trees and bushes", () => {
  it("are real sizes: garden trees 8-10 m tall, bushes about 1.2 m", () => {
    const tall = (n: string) => manifest.find((p) => p.name === n)!.height;
    for (const t of ["oak", "ash", "aspen"]) {
      expect(tall(t)).toBeGreaterThanOrEqual(8);
      expect(tall(t)).toBeLessThanOrEqual(10);
    }
    for (const b of ["bush", "bush2"]) expect(tall(b)).toBeCloseTo(1.25, 0);
  });

  it("have every file they name, and their geometry fits inside its file", () => {
    for (const p of manifest) {
      // compact: normals as bytes, 16-bit indices (scripts/compact-models.mts)
      expect(p.format).toBe(2);
      const file = fs.readFileSync(path.join(DIR, `${p.name}.bin`));
      const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      for (const part of [p.branches, p.foliage]) {
        expect(part.offsets.index + part.indices * 2).toBeLessThanOrEqual(buf.byteLength);
        expect(part.offsets.uv + part.vertices * 8).toBeLessThanOrEqual(part.offsets.index);
        expect(part.indices % 3).toBe(0);
        for (const k of ["position", "normal", "uv", "index"]) expect(part.offsets[k] % 4, k).toBe(0);
        // every index points at a vertex, and the normals are unit length
        const index = new Uint16Array(buf, part.offsets.index, part.indices);
        expect(Math.max(...index)).toBeLessThan(part.vertices);
        const n = new Int8Array(buf, part.offsets.normal, 3);
        expect(Math.hypot(n[0], n[1], n[2]) / 127).toBeCloseTo(1, 1);
      }
      expect(fs.existsSync(path.join(DIR, `bark_${p.bark.type}_color.jpg`))).toBe(true);
      expect(fs.existsSync(path.join(DIR, `leaf_${p.leaves.type}.png`))).toBe(true);
    }
    for (const scan of ["shrub_03", "shrub_04", "potted_plant_02"]) {
      const gltf = JSON.parse(fs.readFileSync(path.join(DIR, "scans", scan, `${scan}.gltf`), "utf8")) as { images: { uri: string }[]; buffers: { uri: string }[] };
      for (const { uri } of [...gltf.images, ...gltf.buffers]) expect(fs.existsSync(path.join(DIR, "scans", scan, uri)), uri).toBe(true);
    }
  });

  it("stand in as drawn shapes until the real ones have loaded", () => {
    for (const kind of ["tree", "hedge", "planter", "plant"]) expect(buildFurniture(kind, 1)?.children.length).toBeGreaterThan(0);
  });
});

describe("a tree's crown spreads over things; only its trunk takes ground", () => {
  const wall: Wall = { id: "w", ax: 0, ay: 0, bx: 10, by: 0, thickness: 0.2, height: 2.85 };
  const tree = (id: string, x: number, y: number): Item => ({ id, kind: "tree", x, y, rotation: 0 });
  const design = (items: Item[]): PlanModel => ({ ...emptyModel(), walls: [wall], items });
  const codes = (m: PlanModel) => checkModel(m).filter((i) => i.severity !== "info").map((i) => i.code);

  it("two trees 3 m apart, crowns touching, and one 2 m from a wall are fine", () => {
    expect(codes(design([tree("a", 3, 2), tree("b", 6, 2)]))).toEqual([]);
  });

  it("a trunk in a wall, or two trunks in one place, are still wrong", () => {
    expect(codes(design([tree("a", 3, 0.2)]))).toContain("item_through_wall");
    expect(codes(design([tree("a", 3, 3), tree("b", 3.3, 3)]))).toContain("items_overlap");
  });
});
