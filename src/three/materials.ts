/**
 * One palette of materials shared by every rebuild of the 3D view. They are flagged
 * `userData.shared` so disposing a replaced scene never frees them.
 */

import * as THREE from "three";
import { carpet, concrete, grass, oak, paving, plaster, tile, type Surface } from "./textures";

function shared<M extends THREE.Material>(m: M): M {
  m.userData.shared = true;
  return m;
}

const standard = (color: string, roughness = 0.75, metalness = 0) => shared(new THREE.MeshStandardMaterial({ color, roughness, metalness }));

/**
 * A material with a drawn texture at its real size (geometry gets world-sized UVs from
 * `userData.tile`, see kit.ts), or the plain `fallback` colour where nothing can be drawn.
 */
function textured(fallback: string, surface: Surface | null, roughness: number, tint = "#ffffff"): THREE.MeshStandardMaterial {
  const m = standard(surface ? tint : fallback, roughness);
  if (surface) {
    m.map = surface.map;
    m.userData.tile = surface.tile;
  }
  return m;
}

// ---- architecture ----
// smooth white render outside and in; slim dark metal frames, as modern houses have
export const wallMaterial = textured("#f1eee8", plaster(), 0.9, "#fbfaf7");
export const wallCapMaterial = standard("#e2ded6", 0.85);
export const frameMaterial = standard("#2a2d31", 0.45, 0.55);
export const doorMaterial = standard("#e8e0d2", 0.5);
export const doorPanelMaterial = standard("#d3c7b4", 0.55);
export const handleMaterial = standard("#b8a46c", 0.3, 0.85);
export const sillMaterial = standard("#e9e5dc", 0.55);
/** Clear glass that mostly shows what is behind it and reflects the sky at a glance. */
export const glassMaterial = shared(
  new THREE.MeshPhysicalMaterial({ color: "#d6e7ef", roughness: 0.03, metalness: 0, transparent: true, opacity: 0.26, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false }),
);
/** The lawn the building stands on (tinted per studio theme in the viewer). */
export const groundMaterial = textured("#6d8a58", grass(), 1);
/** Stone paving, for terraces and pool surrounds. */
export const pavingMaterial = textured("#ddd7cb", paving(), 0.8);
export const lampShadeMaterial = shared(new THREE.MeshStandardMaterial({ color: "#f6efe0", emissive: "#ffe6b8", emissiveIntensity: 0.6, roughness: 0.8, side: THREE.DoubleSide }));
export const cordMaterial = standard("#2b2826", 0.7);

const FLOORS: Record<string, THREE.MeshStandardMaterial> = {
  oak: textured("#c49a68", oak(), 0.55),
  tile: textured("#d8d6d0", tile(), 0.3),
  carpet: textured("#8f9a86", carpet(), 1),
  concrete: textured("#a8a7a2", concrete(), 0.8),
};
export const floorMaterial = (finish: string) => FLOORS[finish] ?? FLOORS.oak;

// ---- furniture ----
const cache = new Map<string, THREE.MeshStandardMaterial>();
/** A shared material for a colour and surface kind, created on first use. */
export function surface(color: string, kind: "fabric" | "wood" | "metal" | "gloss" | "matte" = "matte"): THREE.MeshStandardMaterial {
  const key = `${kind}:${color}`;
  let m = cache.get(key);
  if (!m) {
    const [roughness, metalness] = { fabric: [0.95, 0], wood: [0.6, 0], metal: [0.32, 0.8], gloss: [0.15, 0.05], matte: [0.8, 0] }[kind];
    m = standard(color, roughness, metalness);
    cache.set(key, m);
  }
  return m;
}

export const waterMaterial = shared(new THREE.MeshStandardMaterial({ color: "#a8cfe3", roughness: 0.05, transparent: true, opacity: 0.55 }));
export const screenMaterial = standard("#111417", 0.25, 0.3);
export const leafMaterial = standard("#4f7d48", 0.85);
