/**
 * Design → 3D content: the building plus every piece of furniture, each tagged with the id of
 * the entity it shows. Free of React so it can be tested without a browser.
 */

import * as THREE from "three";
import type { PlanModel } from "../model/types";
import { buildArchitecture } from "./architecture";
import { buildFurniture } from "./furniture";
import { catalogByKind, isResized, itemSize } from "../model/catalog";
import { elevationOf, levelAbove, levelOf } from "../model/levels";

/** Furniture stands on the floor slabs, not on the ground under them. */
const FLOOR_TOP = 0.04;

export function buildContent(model: PlanModel): { group: THREE.Group; bounds: THREE.Box3 } {
  const { group, bounds } = buildArchitecture(model);
  for (const item of model.items) {
    const piece = buildFurniture(item.kind);
    if (!piece) continue;
    const level = levelOf(item);
    piece.position.set(item.x, elevationOf(model, level) + FLOOR_TOP, item.y);
    piece.rotation.y = (item.rotation * Math.PI) / 180;
    // a resized piece is its catalog model stretched to the new size
    const cat = catalogByKind(item.kind);
    const size = itemSize(item);
    if (cat && size && isResized(item)) piece.scale.set(size.w / cat.w, size.h / cat.h, size.d / cat.d);
    // a stair climbs exactly to the floor above it
    const above = cat?.stair ? levelAbove(model, level) : undefined;
    if (cat && above) piece.scale.y = (above.elevation - elevationOf(model, level)) / cat.h;
    piece.userData.entityId = item.id;
    group.add(piece);
  }
  return { group, bounds };
}

const materialsOf = (o: THREE.Object3D): THREE.Material[] => {
  const m = (o as THREE.Mesh).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
};

/**
 * Release the GPU memory held by content that is being replaced: every geometry, and every
 * material that is not one of the shared palette materials.
 */
export function disposeGroup(root: THREE.Object3D): void {
  root.traverse((o) => {
    (o as THREE.Mesh).geometry?.dispose();
    for (const m of materialsOf(o)) {
      if (m.userData.shared) continue;
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
    const light = o as THREE.PointLight;
    if (light.isLight) light.shadow?.map?.dispose();
  });
}
