/**
 * The grounds around a house in 3D, from the same site pieces the landing drawing uses
 * (components/figures/villaSite.ts): stone terraces, a pool of water, loungers and an outdoor
 * table, clipped hedges and trees. Plan (x, y) maps to world (x, z); heights go up.
 */

import * as THREE from "three";
import type { SitePiece } from "../components/figures/sunsetFigure";
import { blob, post, slab } from "./kit";
import { pavingMaterial, surface, waterMaterial } from "./materials";

const hedgeMaterial = surface("#5f7f4c", "matte");
const canopyMaterial = surface("#5b8a4a", "matte");
const canopyDark = surface("#4b7740", "matte");
const trunkMaterial = surface("#6b5241", "wood");
const outdoorMaterial = surface("#f2f0ea", "matte");
const outdoorFrame = surface("#3b3d40", "metal");

/** A box spanning a site piece, standing on its z0. */
function box(p: SitePiece, material: THREE.Material, shadows = true) {
  const w = Math.abs(p.x1 - p.x0);
  const d = Math.abs(p.y1 - p.y0);
  return slab(w, p.z1 - (p.z0 ?? 0), d, material, shadows).at((p.x0 + p.x1) / 2, p.z0 ?? 0, (p.y0 + p.y1) / 2);
}

export function buildSite(pieces: readonly SitePiece[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "site";
  for (const p of pieces) {
    const part = p.id.split(":")[1];
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.y0 + p.y1) / 2;
    const w = Math.abs(p.x1 - p.x0);
    const d = Math.abs(p.y1 - p.y0);
    switch (p.kind) {
      case "lawn":
        break; // the lawn is the ground every scene already stands on
      case "deck": {
        const deck = box(p, pavingMaterial, false);
        deck.userData.frames = true; // terraces belong in the picture with the house
        group.add(deck);
        break;
      }
      case "water": {
        // the pool: a tiled basin under the water, set into the deck around it
        group.add(slab(w, 0.02, d, surface("#6fa9c4", "gloss"), false).at(cx, (p.z0 ?? 0) + 0.005, cz));
        const water = slab(w, 0.01, d, waterMaterial, false).at(cx, p.z1 + 0.02, cz);
        water.receiveShadow = true;
        group.add(water);
        break;
      }
      case "hedge":
        group.add(box(p, hedgeMaterial));
        break;
      case "tree": {
        // canopies as soft rounded masses, the lower one wide, the upper one smaller
        const r = Math.max(w, d) / 2;
        const h = p.z1 - (p.z0 ?? 0);
        const canopy = blob(r * 1.05, h * 0.9, r * 1.05, part === "high" ? canopyDark : canopyMaterial).at(cx, p.z0 ?? 0, cz);
        canopy.userData.grows = true;
        group.add(canopy);
        break;
      }
      case "item": {
        if (part === "trunk") {
          const trunk = post(Math.max(w, d) / 2, p.z1 - (p.z0 ?? 0), trunkMaterial).at(cx, p.z0 ?? 0, cz);
          trunk.userData.grows = true;
          group.add(trunk);
        }
        else if (part === "base") {
          // a lounger: a slim cushion on a dark frame
          group.add(slab(w, 0.06, d, outdoorFrame).at(cx, (p.z0 ?? 0) + 0.22, cz));
          group.add(slab(w * 0.94, 0.08, d * 0.96, outdoorMaterial).at(cx, (p.z0 ?? 0) + 0.28, cz));
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(post(0.02, 0.22, outdoorFrame).at(cx + sx * (w / 2 - 0.05), p.z0 ?? 0, cz + sz * (d / 2 - 0.08)));
        } else if (part === "back") {
          const back = slab(w * 0.94, 0.08, Math.abs(p.y1 - p.y0), outdoorMaterial).at(cx, (p.z0 ?? 0) + 0.06, cz);
          back.rotation.x = 0.55;
          group.add(back);
        } else if (part === "top") {
          // an outdoor table: a dark top on four legs
          const h = p.z1 - (p.z0 ?? 0);
          group.add(slab(w, 0.04, d, outdoorFrame).at(cx, (p.z0 ?? 0) + h - 0.04, cz));
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) group.add(post(0.025, h - 0.04, outdoorFrame).at(cx + sx * (w / 2 - 0.08), p.z0 ?? 0, cz + sz * (d / 2 - 0.08)));
        } else group.add(box(p, outdoorMaterial));
        break;
      }
    }
  }
  return group;
}
