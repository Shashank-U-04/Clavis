/**
 * Grows the garden's trees and bushes once, ahead of time, and saves them for the 3D views:
 * `npm run plants` writes public/models/plants/<name>.bin (the geometry) and plants.json (what
 * each one is), and copies the bark and leaf pictures they use. The site then loads those small
 * files; the generator itself never ships to visitors.
 *
 * Each plant is scaled to a real size: a garden tree 8-10 m tall, a bush 1.2 m.
 */

import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";

// growing a tree needs no pictures; give the texture loader something to hand its URLs to
(globalThis as unknown as { document: unknown }).document = {
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {}, set src(_: string) {} }),
};
const { Tree } = await import("@dgreenheck/ez-tree");

const OUT = path.resolve("public/models/plants");
const LIB = path.resolve("node_modules/@dgreenheck/ez-tree/src/lib/assets");

interface Variant {
  name: string;
  preset: string;
  seed: number;
  /** real height in metres */
  height: number;
  /** fewer leaf cards than the preset, to keep the file small (1 = as the preset) */
  leafShare?: number;
  /** leaf colour instead of the preset's */
  leafTint?: number;
}

const VARIANTS: Variant[] = [
  { name: "oak", preset: "Oak Medium", seed: 2741, height: 9 },
  { name: "ash", preset: "Ash Medium", seed: 913, height: 8.5 },
  // the preset's aspen is in its autumn gold; a garden in summer is green
  { name: "aspen", preset: "Aspen Medium", seed: 5120, height: 10, leafTint: 0xcfe8a8 },
  { name: "bush", preset: "Bush 1", seed: 77, height: 1.3 },
  { name: "bush2", preset: "Bush 2", seed: 401, height: 1.2 },
];

interface Part {
  vertices: number;
  indices: number;
  /** byte offsets in the .bin: position (3 × f32), normal (3 × f32), uv (2 × f32), index (u32) */
  offsets: { position: number; normal: number; uv: number; index: number };
}

interface PlantFile {
  name: string;
  height: number;
  /** footprint of the crown, metres across */
  spread: number;
  bark: { type: string; tint: number; repeat: [number, number] };
  leaves: { type: string; tint: number; alphaTest: number };
  branches: Part;
  foliage: Part;
}

function pack(geometry: THREE.BufferGeometry, scale: number, chunks: Buffer[], at: { n: number }): Part {
  const g = geometry.index ? geometry : geometry.setIndex([...Array(geometry.getAttribute("position").count).keys()]);
  g.scale(scale, scale, scale);
  const take = (name: string) => Float32Array.from((g.getAttribute(name) as THREE.BufferAttribute).array as ArrayLike<number>);
  const position = take("position");
  const normal = take("normal");
  const uv = take("uv");
  const index = Uint32Array.from(g.index!.array as ArrayLike<number>);
  const offsets = { position: 0, normal: 0, uv: 0, index: 0 };
  for (const [key, arr] of [
    ["position", position],
    ["normal", normal],
    ["uv", uv],
    ["index", index],
  ] as const) {
    offsets[key] = at.n;
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(buf);
    at.n += buf.byteLength;
  }
  return { vertices: position.length / 3, indices: index.length, offsets };
}

fs.mkdirSync(OUT, { recursive: true });
const manifest: PlantFile[] = [];
const barks = new Set<string>();
const leaves = new Set<string>();

for (const v of VARIANTS) {
  const tree = new Tree();
  tree.loadPreset(v.preset);
  tree.options.seed = v.seed;
  if (v.leafShare) tree.options.leaves.count = Math.max(1, Math.round(tree.options.leaves.count * v.leafShare));
  if (v.leafTint !== undefined) tree.options.leaves.tint = v.leafTint;
  tree.generate();
  const box = new THREE.Box3().setFromObject(tree);
  const size = box.getSize(new THREE.Vector3());
  const scale = v.height / size.y;
  const chunks: Buffer[] = [];
  const at = { n: 0 };
  const branches = pack(tree.branchesMesh.geometry.clone(), scale, chunks, at);
  const foliage = pack(tree.leavesMesh.geometry.clone(), scale, chunks, at);
  fs.writeFileSync(path.join(OUT, `${v.name}.bin`), Buffer.concat(chunks));
  const o = tree.options;
  manifest.push({
    name: v.name,
    height: v.height,
    spread: Math.round(Math.max(size.x, size.z) * scale * 100) / 100,
    bark: { type: o.bark.type, tint: o.bark.tint, repeat: [o.bark.textureScale.x, 1 / o.bark.textureScale.y] },
    leaves: { type: o.leaves.type, tint: o.leaves.tint, alphaTest: o.leaves.alphaTest },
    branches,
    foliage,
  });
  barks.add(o.bark.type);
  leaves.add(o.leaves.type);
  console.log(`${v.name.padEnd(6)} ${v.preset.padEnd(13)} ${v.height} m tall, ${manifest.at(-1)!.spread} m across, ${(branches.indices + foliage.indices) / 3} triangles, ${(at.n / 1024).toFixed(0)} KB`);
}

for (const b of barks) for (const kind of ["color", "normal"]) fs.copyFileSync(path.join(LIB, "bark", `${b}_${kind}_1k.jpg`), path.join(OUT, `bark_${b}_${kind}.jpg`));
for (const l of leaves) fs.copyFileSync(path.join(LIB, "leaves", `${l}_color.png`), path.join(OUT, `leaf_${l}.png`));
fs.writeFileSync(path.join(OUT, "plants.json"), JSON.stringify(manifest, null, 1));
console.log(`wrote ${manifest.length} plants, ${barks.size} barks and ${leaves.size} leaf pictures to ${path.relative(process.cwd(), OUT)}`);
