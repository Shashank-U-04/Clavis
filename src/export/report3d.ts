/**
 * Pictures of a design in 3D for its report, made off screen: the house in daylight with its
 * real trees and plants (when they load in time), seen from above at each of its four corners
 * with no roof, so the furnished rooms show, and once from the front at eye height.
 */

import * as THREE from "three";
import type { PlanModel } from "../model/types";
import { buildContent, disposeGroup } from "../three/content";
import { Daylight } from "../three/daylight";
import { cordMaterial, lampShadeMaterial } from "../three/materials";
import { loadPlants } from "../three/plants";

export interface View3D {
  label: string;
  png: string;
}

const W = 1600;
const H = 1000;

export async function render3dViews(model: PlanModel): Promise<View3D[]> {
  // real plants if they arrive within a few seconds; the drawn ones otherwise
  await Promise.race([loadPlants(), new Promise((r) => setTimeout(r, 5000))]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const daylight = new Daylight(renderer, scene);
  daylight.setTheme("light");

  const { group, bounds } = buildContent(model);
  // daylight: the room lamps stay off, and their pendants are not wanted in a picture from outside
  group.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    if ((o as THREE.Light).isLight || mat === lampShadeMaterial || mat === cordMaterial) o.visible = false;
  });
  scene.add(group);
  const centre = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(4, Math.hypot(size.x, size.z) / 2);
  daylight.aim(new THREE.Vector3(centre.x, 0, centre.z), radius + 6);

  const camera = new THREE.PerspectiveCamera(38, W / H, 0.3, 2000);
  const shot = (label: string, dir: THREE.Vector3, elevation: number, fill: number, targetY: number): View3D => {
    const v = THREE.MathUtils.degToRad(camera.fov / 2);
    const h = Math.atan(Math.tan(v) * camera.aspect);
    const dist = (radius * fill) / Math.sin(Math.min(v, h));
    const el = THREE.MathUtils.degToRad(elevation);
    const target = new THREE.Vector3(centre.x, targetY, centre.z);
    const d = dir.clone().setY(0).normalize();
    camera.position.copy(target).addScaledVector(d, Math.cos(el) * dist).setY(targetY + Math.sin(el) * dist);
    camera.lookAt(target);
    renderer.render(scene, camera);
    return { label, png: canvas.toDataURL("image/png") };
  };

  // plan x is east, plan y (scene z) is south
  const views = [
    shot("From the north-west", new THREE.Vector3(-1, 0, -1), 38, 1.05, size.y * 0.3),
    shot("From the north-east", new THREE.Vector3(1, 0, -1), 38, 1.05, size.y * 0.3),
    shot("From the south-east", new THREE.Vector3(1, 0, 1), 38, 1.05, size.y * 0.3),
    shot("From the south-west", new THREE.Vector3(-1, 0, 1), 38, 1.05, size.y * 0.3),
    shot("From the front, at eye height", new THREE.Vector3(-0.35, 0, -1), 4, 1.25, 1.6),
  ];

  disposeGroup(group);
  daylight.dispose();
  renderer.dispose();
  return views;
}
