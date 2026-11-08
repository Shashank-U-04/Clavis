/**
 * The building in 3D: walls cut around their doors and windows, door leaves on hinges that
 * the scene can swing open, glazed windows, room floors, a pendant lamp per room and the
 * ground. Plan (x, y) maps to world (x, z); y is up.
 *
 * Each wall's group uses a local frame where +x runs from the wall's A end to its B end and
 * +z is the right-hand side of someone walking that way — the side a door with side "right"
 * swings to, matching the plan drawing (model/drawing.ts).
 */

import * as THREE from "three";
import type { Opening, PlanModel, Room, Wall } from "../model/types";
import { segLen } from "../model/geometry";
import { openingSpan } from "../model/issues";
import { post, slab } from "./kit";
import {
  cordMaterial,
  doorMaterial,
  doorPanelMaterial,
  floorMaterial,
  frameMaterial,
  glassMaterial,
  groundMaterial,
  handleMaterial,
  lampShadeMaterial,
  sillMaterial,
  wallCapMaterial,
  wallMaterial,
} from "./materials";

/** How far an open door turns (a little short of 90° so it does not sit flush on the wall). */
const OPEN_ANGLE = Math.PI * 0.47;
const FRAME = 0.05;
const FLOOR_THICKNESS = 0.04;

export interface DoorHinge {
  /** set on the hinge group: the door's opening id and the signed angle it turns when open */
  doorId: string;
  openAngle: number;
}

interface Hole {
  o: Opening;
  start: number;
  end: number;
}

/** The solid stretches of a wall between its holes, as [start, end] distances from A. */
function solidRuns(length: number, holes: Hole[]): [number, number][] {
  const runs: [number, number][] = [];
  let cursor = 0;
  for (const h of holes) {
    if (h.start > cursor + 1e-4) runs.push([cursor, h.start]);
    cursor = Math.max(cursor, h.end);
  }
  if (length > cursor + 1e-4) runs.push([cursor, length]);
  return runs;
}

/** A piece of wall from `from` to `to` along the wall, between heights y0 and y1. */
function wallPiece(from: number, to: number, y0: number, y1: number, thickness: number): THREE.Mesh {
  return slab(to - from, y1 - y0, thickness, wallMaterial).at((from + to) / 2, y0, 0);
}

function doorLeaf(o: Opening, hingeAt: number, towards: 1 | -1, width: number, swingLeft: boolean): THREE.Group {
  const hinge = new THREE.Group();
  hinge.position.x = hingeAt;
  // rotating the leaf (which extends along `towards`·x) about y; this sign sends it to +z (right) or -z (left)
  const data: DoorHinge = { doorId: o.id, openAngle: (swingLeft ? 1 : -1) * towards * OPEN_ANGLE };
  hinge.userData = { doorHinge: true, ...data };
  const height = o.height - 0.02;
  const leaf = slab(width, height, 0.04, doorMaterial).at((towards * width) / 2, 0.005, 0);
  const panelInset = slab(width - 0.16, height - 0.3, 0.046, doorPanelMaterial, false).at((towards * width) / 2, 0.15, 0);
  hinge.add(leaf, panelInset);
  for (const z of [0.03, -0.03]) hinge.add(slab(0.12, 0.02, 0.02, handleMaterial).at(towards * (width - 0.1), 1.0, z));
  return hinge;
}

function buildOpening(h: Hole, wall: Wall, group: THREE.Group) {
  const { o, start, end } = h;
  const t = wall.thickness;
  const top = Math.min(o.sill + o.height, wall.height);
  // the wall above the hole, and below it for windows
  if (wall.height - top > 1e-3) group.add(wallPiece(start, end, top, wall.height, t));
  if (o.sill > 1e-3) group.add(wallPiece(start, end, 0, o.sill, t));
  // frame: two jambs and a head
  group.add(slab(FRAME, top - o.sill, t + 0.02, frameMaterial).at(start + FRAME / 2, o.sill, 0));
  group.add(slab(FRAME, top - o.sill, t + 0.02, frameMaterial).at(end - FRAME / 2, o.sill, 0));
  group.add(slab(end - start, FRAME, t + 0.02, frameMaterial).at((start + end) / 2, top - FRAME, 0));

  if (o.kind === "window") {
    const inner = end - start - FRAME * 2;
    group.add(slab(inner, o.height - FRAME * 2, 0.012, glassMaterial, false).at((start + end) / 2, o.sill + FRAME, 0));
    group.add(slab(FRAME * 0.6, o.height - FRAME * 2, 0.03, frameMaterial).at((start + end) / 2, o.sill + FRAME, 0)); // mullion
    group.add(slab(end - start + 0.1, 0.03, t + 0.12, sillMaterial).at((start + end) / 2, o.sill - 0.03, 0));
    return;
  }
  const clear = end - start - FRAME * 2;
  const swingLeft = o.side === "left";
  if (clear > 1.15) {
    group.add(doorLeaf(o, start + FRAME, 1, clear / 2, swingLeft));
    group.add(doorLeaf(o, end - FRAME, -1, clear / 2, swingLeft));
  } else if (o.hinge === "b") {
    group.add(doorLeaf(o, end - FRAME, -1, clear, swingLeft));
  } else {
    group.add(doorLeaf(o, start + FRAME, 1, clear, swingLeft));
  }
}

function buildWall(wall: Wall, openings: Opening[]): THREE.Group {
  const length = segLen(wall.ax, wall.ay, wall.bx, wall.by);
  const g = new THREE.Group();
  g.position.set(wall.ax, 0, wall.ay);
  g.rotation.y = -Math.atan2(wall.by - wall.ay, wall.bx - wall.ax);

  const holes: Hole[] = openings
    .map((o) => {
      const [s, e] = openingSpan(wall, o);
      return { o, start: Math.max(0, s * length), end: Math.min(length, e * length) };
    })
    .filter((h) => h.end - h.start > 0.05)
    .sort((a, b) => a.start - b.start);

  // walls run on centrelines; each end is extended by half the thickness so corners close
  const half = wall.thickness / 2;
  const runs = solidRuns(length, holes);
  for (const [from, to] of runs) {
    const a = from === 0 ? -half : from;
    const b = Math.abs(to - length) < 1e-6 ? length + half : to;
    g.add(wallPiece(a, b, 0, wall.height, wall.thickness));
  }
  if (runs.length === 0 && holes.length === 0) g.add(wallPiece(-half, length + half, 0, wall.height, wall.thickness));
  // a thin cap on top so the cut wall reads clearly from above
  g.add(slab(length + wall.thickness, 0.01, wall.thickness, wallCapMaterial, false).at(length / 2, wall.height, 0));
  for (const h of holes) buildOpening(h, wall, g);
  return g;
}

function buildFloor(room: Room): THREE.Mesh {
  const floor = slab(room.w, FLOOR_THICKNESS, room.h, floorMaterial(room.floor), false);
  floor.position.set(room.x + room.w / 2, 0, room.y + room.h / 2);
  floor.receiveShadow = true;
  return floor;
}

function buildLamp(room: Room, ceiling: number): THREE.Group {
  const lamp = new THREE.Group();
  lamp.position.set(room.x + room.w / 2, 0, room.y + room.h / 2);
  const drop = 0.55;
  lamp.add(post(0.006, drop, cordMaterial).at(0, ceiling - drop, 0));
  const shade = post(0.09, 0.16, lampShadeMaterial, 0.2, 24);
  shade.castShadow = false;
  lamp.add(shade.at(0, ceiling - drop - 0.16, 0));
  // brighter in bigger rooms, but never like a floodlight
  const area = Math.max(4, room.w * room.h);
  const light = new THREE.PointLight("#ffdcae", Math.min(7, 1.8 + area * 0.22), Math.max(5, room.w + room.h), 2);
  light.position.y = ceiling - drop - 0.2;
  lamp.add(light);
  return lamp;
}

export interface BuiltArchitecture {
  group: THREE.Group;
  /** the extent of the building itself (not the ground) */
  bounds: THREE.Box3;
}

export function buildArchitecture(model: PlanModel): BuiltArchitecture {
  const group = new THREE.Group();
  group.name = "architecture";
  const byWall = new Map<string, Opening[]>();
  for (const o of model.openings) byWall.set(o.wallId, [...(byWall.get(o.wallId) ?? []), o]);

  for (const w of model.walls) {
    const g = buildWall(w, byWall.get(w.id) ?? []);
    g.userData.entityId = w.id;
    group.add(g);
  }
  for (const r of model.rooms) {
    const f = buildFloor(r);
    f.userData.entityId = r.id;
    group.add(f);
  }
  const ceiling = Math.max(2.4, ...model.walls.map((w) => w.height));
  for (const r of model.rooms) group.add(buildLamp(r, ceiling));

  const bounds = model.walls.length ? new THREE.Box3().setFromObject(group) : new THREE.Box3(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 3, 3));

  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.name = "ground";
  group.add(ground);
  return { group, bounds };
}
