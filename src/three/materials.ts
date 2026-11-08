/**
 * One palette of materials shared by every rebuild of the 3D view. They are flagged
 * `userData.shared` so disposing a replaced scene never frees them.
 */

import * as THREE from "three";

function shared<M extends THREE.Material>(m: M): M {
  m.userData.shared = true;
  return m;
}

const standard = (color: string, roughness = 0.75, metalness = 0) => shared(new THREE.MeshStandardMaterial({ color, roughness, metalness }));

// ---- architecture ----
export const wallMaterial = standard("#efe9df", 0.92);
export const wallCapMaterial = standard("#d9d1c4", 0.9);
export const frameMaterial = standard("#5d544b", 0.55);
export const doorMaterial = standard("#e8e0d2", 0.5);
export const doorPanelMaterial = standard("#d3c7b4", 0.55);
export const handleMaterial = standard("#b8a46c", 0.3, 0.85);
export const sillMaterial = standard("#e6e1d8", 0.65);
export const glassMaterial = shared(
  new THREE.MeshPhysicalMaterial({ color: "#bcd6e6", roughness: 0.04, transmission: 0.85, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
);
export const groundMaterial = standard("#3f4540", 1);
export const lampShadeMaterial = shared(new THREE.MeshStandardMaterial({ color: "#f6efe0", emissive: "#ffe6b8", emissiveIntensity: 0.6, roughness: 0.8, side: THREE.DoubleSide }));
export const cordMaterial = standard("#2b2826", 0.7);

const FLOORS: Record<string, THREE.MeshStandardMaterial> = {
  oak: standard("#c49a68", 0.62),
  tile: standard("#d8d6d0", 0.35),
  carpet: standard("#8f9a86", 1),
  concrete: standard("#a8a7a2", 0.85),
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
