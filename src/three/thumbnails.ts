/**
 * Small pictures of each furniture model for the catalog, rendered once per kind with a
 * single off-screen renderer and kept as data URLs. Returns null where WebGL is unavailable,
 * and the catalog falls back to a colour swatch.
 */

import * as THREE from "three";
import { buildFurniture } from "./furniture";
import { disposeGroup } from "./content";

const SIZE = 96;
const pictures = new Map<string, string | null>();
let stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null | undefined;

function getStage() {
  if (stage !== undefined) return stage;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#666055", 1.6));
    const key = new THREE.DirectionalLight("#fff4e4", 1.8);
    key.position.set(2, 4, 3);
    scene.add(key);
    stage = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.01, 50) };
  } catch {
    stage = null;
  }
  return stage;
}

export function thumbnailFor(kind: string): string | null {
  if (pictures.has(kind)) return pictures.get(kind)!;
  const s = getStage();
  const model = s ? buildFurniture(kind) : null;
  if (!s || !model) {
    pictures.set(kind, null);
    return null;
  }
  s.scene.add(model);
  // frame the model from the front-right, a little above
  const box = new THREE.Box3().setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const distance = radius / Math.sin((s.camera.fov * Math.PI) / 360);
  s.camera.position.copy(centre).add(new THREE.Vector3(0.75, 0.6, 1).normalize().multiplyScalar(distance));
  s.camera.lookAt(centre);
  s.renderer.render(s.scene, s.camera);
  const url = s.renderer.domElement.toDataURL("image/png");
  s.scene.remove(model);
  disposeGroup(model);
  pictures.set(kind, url);
  return url;
}
