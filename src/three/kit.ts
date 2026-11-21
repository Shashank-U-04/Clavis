/**
 * Small building blocks for procedural models. Every helper takes sizes in metres and places
 * the shape by the centre of its BOTTOM face, which keeps furniture code readable:
 * `slab(w, h, d, m).at(x, y, z)` puts a block on the surface at height y.
 */

import * as THREE from "three";
import { worldUV } from "./textures";

export class Part extends THREE.Mesh {
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) {
    super(geometry, material);
    this.castShadow = shadows;
    this.receiveShadow = true;
  }

  /** Move the part so its bottom-centre is at (x, y, z). */
  at(x: number, y: number, z: number): this {
    this.position.set(x, y, z);
    return this;
  }

  turn(radians: number, axis: "x" | "y" | "z" = "y"): this {
    this.rotation[axis] = radians;
    return this;
  }
}

/** A rectangular block, `w` along x, `h` tall, `d` along z. */
export function slab(w: number, h: number, d: number, material: THREE.Material, shadows = true): Part {
  const g = new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  g.translate(0, h / 2, 0);
  // a textured material repeats at its real size
  const tile = material.userData.tile as number | undefined;
  if (tile) worldUV(g, tile);
  return new Part(g, material, shadows);
}

/** An upright cylinder (or cone when the radii differ). */
export function post(radiusTop: number, height: number, material: THREE.Material, radiusBottom = radiusTop, segments = 16): Part {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  g.translate(0, height / 2, 0);
  return new Part(g, material);
}

/** An ellipsoid resting on its lowest point. */
export function blob(rx: number, ry: number, rz: number, material: THREE.Material): Part {
  const g = new THREE.SphereGeometry(1, 18, 12);
  g.scale(rx, ry, rz);
  g.translate(0, ry, 0);
  return new Part(g, material);
}

/** A block with softened vertical edges, for cushions and mattresses. */
export function pillow(w: number, h: number, d: number, material: THREE.Material): Part {
  const r = Math.min(w, d, h) * 0.35;
  const shape = new THREE.Shape();
  const x = w / 2 - r;
  const z = d / 2 - r;
  shape.moveTo(-x, -d / 2);
  shape.lineTo(x, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -z);
  shape.lineTo(w / 2, z);
  shape.quadraticCurveTo(w / 2, d / 2, x, d / 2);
  shape.lineTo(-x, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, z);
  shape.lineTo(-w / 2, -z);
  shape.quadraticCurveTo(-w / 2, -d / 2, -x, -d / 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: Math.min(0.02, h / 4), bevelThickness: Math.min(0.02, h / 4), bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); // extrusion now points up (+y); the shape lies in x/z
  g.translate(0, Math.min(0.02, h / 4), 0);
  return new Part(g, material);
}

/** Four legs under a w × d footprint, inset from the edges. */
export function legs(w: number, d: number, height: number, material: THREE.Material, inset = 0.05, radius = 0.02): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(post(radius, height, material).at(sx * (w / 2 - inset), 0, sz * (d / 2 - inset)));
  return g;
}

/** A group from parts, for builders that return several pieces. */
export function assemble(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts) g.add(p);
  return g;
}
