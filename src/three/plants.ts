/**
 * Real plants for the 3D views, in place of the drawn shapes once they have loaded:
 *
 *   tree    — a grown oak, ash or aspen (8.5–10 m, see scripts/plants.mts), with bark and leaves
 *   hedge   — grown bushes packed along its length and clipped to its depth
 *   planter — the box, planted with scanned shrubs at their real size
 *   plant   — a scanned plant in a terracotta pot
 *
 * `loadPlants()` fetches them once (only a 3D view asks); until it has, and wherever loading
 * fails, `realPlant()` returns null and the drawn shapes stand in. Geometry and materials are
 * shared by every copy and marked so, which keeps a rebuild of the scene from freeing them.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { CatalogEntry } from "../model/catalog";

const BASE = "/models/plants/";
/** Bumped whenever the files change, so a browser's cached copies are never mixed with new ones. */
const V = "?v=2";

interface Part {
  vertices: number;
  indices: number;
  offsets: { position: number; normal: number; uv: number; index: number };
}
interface PlantFile {
  name: string;
  /** 2: normals as bytes and 16-bit indices (scripts/compact-models.mts); absent: all 32-bit */
  format?: number;
  height: number;
  spread: number;
  bark: { type: string; tint: number; repeat: [number, number] };
  leaves: { type: string; tint: number; alphaTest: number };
  branches: Part;
  foliage: Part;
}

/** A grown plant: its two meshes, ready to copy, at its real size. */
interface Grown {
  height: number;
  spread: number;
  branches: THREE.Mesh;
  foliage: THREE.Mesh;
}

interface Library {
  grown: Map<string, Grown>;
  /** scanned plants by name: the potted plant whole, the shrubs one by one */
  scans: Map<string, THREE.Object3D>;
}

let library: Library | null = null;
let loading: Promise<boolean> | null = null;

const share = <T extends THREE.Material | THREE.BufferGeometry>(x: T): T => ((x.userData.shared = true), x);

function geometryOf(bin: ArrayBuffer, p: Part, format = 1): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const compact = format >= 2;
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bin, p.offsets.position, p.vertices * 3), 3));
  g.setAttribute("normal", compact ? new THREE.BufferAttribute(new Int8Array(bin, p.offsets.normal, p.vertices * 3), 3, true) : new THREE.BufferAttribute(new Float32Array(bin, p.offsets.normal, p.vertices * 3), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(bin, p.offsets.uv, p.vertices * 2), 2));
  g.setIndex(new THREE.BufferAttribute(compact ? new Uint16Array(bin, p.offsets.index, p.indices) : new Uint32Array(bin, p.offsets.index, p.indices), 1));
  g.computeBoundingSphere();
  return share(g);
}

async function texture(loader: THREE.TextureLoader, url: string, colour: boolean, repeat?: [number, number]) {
  const t = await loader.loadAsync(url);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  return t;
}

async function load(): Promise<Library> {
  const manifest = (await (await fetch(`${BASE}plants.json${V}`)).json()) as PlantFile[];
  const loader = new THREE.TextureLoader();
  const barks = new Map<string, Promise<THREE.MeshStandardMaterial>>();
  const leaves = new Map<string, Promise<THREE.Texture>>();
  const grown = new Map<string, Grown>();
  await Promise.allSettled(
    manifest.map(async (p) => {
      const barkKey = `${p.bark.type}:${p.bark.tint}:${p.bark.repeat.join(",")}`;
      if (!barks.has(barkKey))
        barks.set(
          barkKey,
          Promise.all([texture(loader, `${BASE}bark_${p.bark.type}_color.jpg${V}`, true, p.bark.repeat), texture(loader, `${BASE}bark_${p.bark.type}_normal.jpg${V}`, false, p.bark.repeat)]).then(([map, normalMap]) =>
            share(new THREE.MeshStandardMaterial({ map, normalMap, color: p.bark.tint, roughness: 0.92 })),
          ),
        );
      if (!leaves.has(p.leaves.type)) leaves.set(p.leaves.type, texture(loader, `${BASE}leaf_${p.leaves.type}.png${V}`, true));
      const [bin, bark, leaf] = await Promise.all([fetch(`${BASE}${p.name}.bin${V}`).then((r) => r.arrayBuffer()), barks.get(barkKey)!, leaves.get(p.leaves.type)!]);
      const leafMaterial = share(new THREE.MeshStandardMaterial({ map: leaf, color: p.leaves.tint, alphaTest: p.leaves.alphaTest, side: THREE.DoubleSide, roughness: 0.78 }));
      const branches = new THREE.Mesh(geometryOf(bin, p.branches, p.format), bark);
      const foliage = new THREE.Mesh(geometryOf(bin, p.foliage, p.format), leafMaterial);
      for (const m of [branches, foliage]) m.castShadow = m.receiveShadow = true;
      grown.set(p.name, { height: p.height, spread: p.spread, branches, foliage });
    }),
  );

  // the scans: each shrub on its own, standing at its own origin; the potted plant as a whole
  const gltf = new GLTFLoader();
  const scans = new Map<string, THREE.Object3D>();
  // one scan that fails to load leaves the drawn stand-in for that kind only
  await Promise.allSettled(
    ["shrub_03", "shrub_04", "potted_plant_02"].map(async (name) => {
      const scene = (await gltf.loadAsync(`${BASE}scans/${name}/${name}.gltf${V}`)).scene;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = m.receiveShadow = true;
        share(m.geometry);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) share(mat);
      });
      if (name === "potted_plant_02") return void scans.set(name, scene);
      for (const child of scene.children) {
        child.position.set(0, 0, 0);
        scans.set(child.name, child);
      }
    }),
  );
  if (!grown.size && !scans.size) throw new Error("no plant loaded");
  return { grown, scans };
}

/** Fetch the plants (once). Resolves true when they are ready, false if they could not load. */
export function loadPlants(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  loading ??= load()
    .then((lib) => ((library = lib), true))
    .catch((err) => {
      console.warn("[clavis] real plants could not load; drawn ones stand in", err);
      return false;
    });
  return loading;
}

export const plantsReady = () => library !== null;

/** A small, steady number from a seed: the same plant always looks the same. */
const pick = (seed: number, salt: number) => {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function copyGrown(p: Grown): THREE.Group {
  const g = new THREE.Group();
  g.add(p.branches.clone(), p.foliage.clone());
  return g;
}

/** The real model for a plant kind, at the catalog's size, or null when there is none (yet). */
export function realPlant(kind: string, c: CatalogEntry, seed: number): THREE.Group | null {
  const lib = library;
  if (!lib) return null;
  const out = new THREE.Group();

  if (kind === "tree") {
    const names = ["oak", "ash", "aspen"].filter((n) => lib.grown.has(n));
    if (!names.length) return null;
    const p = lib.grown.get(names[Math.floor(pick(seed, 1) * names.length)])!;
    const tree = copyGrown(p);
    tree.scale.setScalar(c.h / p.height);
    tree.rotation.y = pick(seed, 2) * Math.PI * 2;
    out.add(tree);
    return out;
  }

  if (kind === "hedge") {
    const bushes = ["bush", "bush2"].map((n) => lib.grown.get(n)).filter((b): b is Grown => !!b);
    if (!bushes.length) return null;
    // bushes about 0.7 m apart along the hedge, each as tall as the hedge, squeezed to its depth
    const n = Math.max(2, Math.ceil(c.w / 0.7));
    for (let i = 0; i < n; i++) {
      const b = bushes[(i + Math.floor(pick(seed, 3) * 2)) % bushes.length];
      const bush = copyGrown(b);
      const k = (c.h / b.height) * (0.92 + pick(seed, 10 + i) * 0.16);
      bush.scale.set(Math.min(k, ((c.w / n) * 1.9) / b.spread), k, Math.min(k, (c.d * 1.25) / b.spread));
      bush.position.x = -c.w / 2 + ((i + 0.5) * c.w) / n;
      bush.rotation.y = pick(seed, 20 + i) < 0.5 ? 0 : Math.PI;
      out.add(bush);
    }
    return out;
  }

  if (kind === "plant") {
    const scan = lib.scans.get("potted_plant_02");
    if (!scan) return null;
    const pot = scan.clone();
    pot.scale.setScalar(c.h / 0.84); // the scan stands 0.84 m to the top of its leaves
    pot.rotation.y = pick(seed, 4) * Math.PI * 2;
    out.add(pot);
    return out;
  }

  if (kind === "planter") {
    const shrubs = ["shrub_03_a", "shrub_03_b", "shrub_03_c", "shrub_03_d", "shrub_04"].map((n) => lib.scans.get(n)).filter((s): s is THREE.Object3D => !!s);
    if (!shrubs.length) return null;
    const boxH = c.h * 0.7;
    const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, boxH, c.d).translate(0, boxH / 2, 0), new THREE.MeshStandardMaterial({ color: "#3b3d40", roughness: 0.9 }));
    box.castShadow = box.receiveShadow = true;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(c.w - 0.08, 0.02, c.d - 0.08).translate(0, boxH - 0.03, 0), new THREE.MeshStandardMaterial({ color: "#3a2c22", roughness: 1 }));
    out.add(box, soil);
    // shrubs at their real size, a little larger or smaller each, along the box
    const n = Math.max(2, Math.round(c.w / 0.28));
    for (let i = 0; i < n; i++) {
      const s = shrubs[Math.floor(pick(seed, 30 + i) * shrubs.length)].clone();
      s.scale.setScalar(1.1 + pick(seed, 50 + i) * 0.5);
      s.position.set(-c.w / 2 + 0.12 + ((i + 0.5) * (c.w - 0.24)) / n, boxH - 0.03, (pick(seed, 70 + i) - 0.5) * (c.d - 0.2));
      s.rotation.y = pick(seed, 90 + i) * Math.PI * 2;
      out.add(s);
    }
    return out;
  }
  return null;
}
