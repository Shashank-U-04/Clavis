/**
 * The 3D view as a plain class (no React): one renderer, camera and set of lights for its
 * whole life; only the content group is rebuilt when the design changes, at most once per
 * frame, and the replaced content is disposed.
 *
 * Camera modes:
 *   orbit — circle the building (drag to orbit, scroll to zoom)
 *   top   — straight down, north up, like the plan
 *   walk  — eye height; click to look with the mouse (pointer lock; Esc frees it) or drag to
 *           look; WASD / arrows to move, Shift to hurry; walls and furniture block you,
 *           doorways do not. Movement eases in and out rather than jumping.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Daylight, type SceneTheme } from "./daylight";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import type { PlanModel } from "../model/types";
import type { CameraMode } from "../model/store";
import { analyzeModel } from "../model/analysis";
import { boxesOverlap, segLen, wallBox, type Box } from "../model/geometry";
import { itemBox, openingSpan } from "../model/issues";
import { catalogByKind, itemSize } from "../model/catalog";
import { buildContent, disposeGroup } from "./content";

const EYE = 1.6;
const STEP = 1.9; // metres per second, walking
const RUN = 1.9; // × STEP with Shift held
const EASE = 10; // how quickly the walker reaches speed and stops (per second)
const BODY = 0.22; // half-width of the walker
const LOOK_SPEED = 0.0042; // dragging
const MOUSE_LOOK = 0.0022; // pointer lock: radians per pixel of mouse movement
/** When the pointer lock last ended: the Esc that ends it should not also leave the walk. */
export let pointerFreedAt = 0;

export interface ViewerCallbacks {
  /** a piece of furniture (or nothing) was clicked */
  onPick(entityId: string | null): void;
  /** the floor was clicked at plan (x, y) while placing */
  onFloor(x: number, y: number): void;
  /** whether a click on the floor should place something */
  placing(): boolean;
}

interface Door {
  hinge: THREE.Object3D;
  id: string;
  openAngle: number;
  amount: number; // 0 closed … 1 open
  target: number;
}

/** Solid wall stretches (doorways excluded) and tall furniture, as plan boxes. */
function obstaclesOf(model: PlanModel): Box[] {
  const out: Box[] = [];
  for (const w of model.walls) {
    const length = segLen(w.ax, w.ay, w.bx, w.by);
    if (length < 1e-6) continue;
    const doors = model.openings
      .filter((o) => o.wallId === w.id && o.kind === "door")
      .map((o) => openingSpan(w, o).map((t) => t * length) as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const runs: [number, number][] = [];
    for (const [s, e] of doors) {
      if (s > cursor) runs.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < length) runs.push([cursor, length]);
    const ux = (w.bx - w.ax) / length;
    const uy = (w.by - w.ay) / length;
    for (const [s, e] of runs) {
      const a = { x: w.ax + ux * s, y: w.ay + uy * s };
      const b = { x: w.ax + ux * e, y: w.ay + uy * e };
      out.push(wallBox({ ax: a.x, ay: a.y, bx: b.x, by: b.y, thickness: w.thickness }));
    }
  }
  for (const it of model.items) {
    const c = catalogByKind(it.kind);
    if (!c || c.isRug || (itemSize(it)?.h ?? c.h) < 0.3) continue;
    const box = itemBox(it);
    if (box) out.push(box);
  }
  return out;
}

/** Just inside the front door, looking into the room it opens onto. */
function entryPose(m: PlanModel): { x: number; z: number; yaw: number } | null {
  const a = analyzeModel(m);
  const first = a.rooms.find((r) => r.depth === 1) ?? a.rooms[0];
  const room = first && m.rooms.find((r) => r.id === first.id);
  if (!room) return null;
  const centre = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const door = m.openings.find((o) => o.id === first.routeDoors?.[0]);
  const wall = door && m.walls.find((w) => w.id === door.wallId);
  if (!door || !wall) return { x: centre.x, z: centre.y, yaw: Math.PI };
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
  const c = { x: wall.ax + (wall.bx - wall.ax) * door.t, y: wall.ay + (wall.by - wall.ay) * door.t };
  let n = { x: -(wall.by - wall.ay) / len, y: (wall.bx - wall.ax) / len };
  if ((centre.x - c.x) * n.x + (centre.y - c.y) * n.y < 0) n = { x: -n.x, y: -n.y };
  // face along the room's longer reach from the door (down a hall rather than into its wall)
  const toCentre = { x: centre.x - c.x, y: centre.y - c.y };
  const dir = Math.hypot(toCentre.x, toCentre.y) > 1.5 ? toCentre : n;
  return { x: c.x + n.x * 0.7, z: c.y + n.y * 0.7, yaw: Math.atan2(dir.x, dir.y) };
}

export { SCENE_THEMES, type SceneTheme } from "./daylight";

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1500);
  private daylight: Daylight;
  private orbit: OrbitControls;
  private content: THREE.Group | null = null;
  private markers = new THREE.Group();
  private bounds = new THREE.Box3();
  private model: PlanModel | null = null;
  private pendingModel: PlanModel | null = null;
  private obstacles: Box[] = [];
  private doors: Door[] = [];
  private mode: CameraMode = "orbit";
  private keys = new Set<string>();
  private velocity = { x: 0, z: 0 };
  private shadowsDirty = true;
  private yaw = 0;
  private pitch = 0;
  private dragging: { x: number; y: number; moved: number } | null = null;
  private frame = 0;
  private clock = new THREE.Clock();
  private resize: ResizeObserver;
  private cleanups: (() => void)[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(private mount: HTMLElement, private callbacks: ViewerCallbacks) {
    // no preserveDrawingBuffer: snapshot() renders and reads in the same task, and keeping the
    // buffer costs every frame
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    // the sun never moves: shadows are drawn again only when the building or a door changes
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.dataset.testid = "scene3d-canvas";
    mount.appendChild(this.renderer.domElement);

    // a sky all round, the sun, and the lawn fading into haze far off
    this.daylight = new Daylight(this.renderer, this.scene);
    this.cleanups.push(() => this.daylight.dispose());
    this.scene.add(this.markers);
    this.setTheme("light");

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.09;

    this.resize = new ResizeObserver(() => this.fitCanvas());
    this.resize.observe(mount);
    this.fitCanvas();
    this.listen();
    this.loop();
  }

  // ---- public ------------------------------------------------------------------

  setModel(model: PlanModel) {
    // the same design again (a selection or a view change): nothing to rebuild
    if (model === this.model || model === this.pendingModel) return;
    this.pendingModel = model;
  }

  /** Match the studio's theme: a clear day, or dusk. The house itself does not change. */
  setTheme(theme: SceneTheme) {
    this.daylight.setTheme(theme);
    this.aimSun();
  }

  /** Put the sun's shadow camera over the whole building. */
  private aimSun() {
    if (this.bounds.isEmpty()) this.daylight.aim(new THREE.Vector3(), 12);
    else this.daylight.aim(this.centre, this.radius + 3);
    this.shadowsDirty = true;
  }

  setMode(mode: CameraMode) {
    this.mode = mode;
    this.keys.clear();
    this.velocity = { x: 0, z: 0 };
    if (mode !== "walk" && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.placeCamera();
  }

  /** Outline these entities (selection and highlighted findings). */
  mark(selected: string[], flagged: string[]) {
    for (const child of [...this.markers.children]) {
      this.markers.remove(child);
      (child as THREE.Box3Helper).geometry?.dispose();
      ((child as THREE.Box3Helper).material as THREE.Material)?.dispose();
    }
    if (!this.content) return;
    const colour = (id: string) => (flagged.includes(id) ? 0xff6b5a : selected.includes(id) ? 0x4a63ff : null);
    for (const child of this.content.children) {
      const id = child.userData.entityId as string | undefined;
      const c = id ? colour(id) : null;
      if (c === null) continue;
      this.markers.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(child).expandByScalar(0.02), c));
    }
  }

  setDoors(state: "open" | "closed" | "toggle", id?: string) {
    for (const d of this.doors) if (!id || d.id === id) d.target = state === "open" ? 1 : state === "closed" ? 0 : d.target > 0.5 ? 0 : 1;
  }

  /** The current frame as a PNG data URL. */
  snapshot(): string {
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /** The building and furniture as Wavefront OBJ text. */
  exportObj(): string {
    return this.content ? new OBJExporter().parse(this.content) : "";
  }

  refit() {
    this.placeCamera();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    for (const c of this.cleanups) c();
    if (this.content) disposeGroup(this.content);
    this.orbit.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---- content ---------------------------------------------------------------

  private rebuild(model: PlanModel) {
    const before = new Map(this.doors.map((d) => [d.id, d]));
    const previousSize = this.bounds.isEmpty() ? null : this.bounds.getSize(new THREE.Vector3());
    if (this.content) {
      this.scene.remove(this.content);
      disposeGroup(this.content);
    }
    const { group, bounds } = buildContent(model);
    this.content = group;
    this.bounds = bounds;
    this.model = model;
    this.scene.add(group);
    this.aimSun();
    this.obstacles = obstaclesOf(model);
    this.doors = [];
    group.traverse((o) => {
      if (!o.userData.doorHinge) return;
      const was = before.get(o.userData.doorId);
      const door: Door = { hinge: o, id: o.userData.doorId, openAngle: o.userData.openAngle, amount: was?.amount ?? 0, target: was?.target ?? 0 };
      o.rotation.y = door.amount * door.openAngle;
      this.doors.push(door);
    });
    // re-frame only when the building's size changed noticeably (a new layout), not on edits
    const size = bounds.getSize(new THREE.Vector3());
    if (!previousSize || previousSize.distanceTo(size) > 1.5) this.placeCamera();
  }

  private get centre() {
    return this.bounds.getCenter(new THREE.Vector3());
  }

  private get radius() {
    return Math.max(3, this.bounds.getSize(new THREE.Vector3()).length() / 2);
  }

  private placeCamera() {
    const c = this.centre;
    const r = this.radius;
    this.orbit.enabled = this.mode !== "walk";
    if (this.mode === "walk") {
      const pose = this.model ? entryPose(this.model) : null;
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(pose?.x ?? c.x, EYE, pose?.z ?? c.z);
      this.yaw = pose?.yaw ?? Math.PI;
      this.pitch = -0.05;
      this.aim();
      return;
    }
    // far enough that the whole building fits the narrower of the two fields of view
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const distance = (r / Math.sin(Math.min(vHalf, hHalf))) * 0.85;
    if (this.mode === "top") {
      this.camera.up.set(0, 0, -1); // north at the top, as in the plan
      this.camera.position.set(c.x, distance, c.z + 0.001);
      this.orbit.maxPolarAngle = 0.12;
    } else {
      this.camera.up.set(0, 1, 0);
      const dir = new THREE.Vector3(0.62, 0.62, 0.8).normalize().multiplyScalar(distance);
      this.camera.position.set(c.x + dir.x, dir.y, c.z + dir.z);
      this.orbit.maxPolarAngle = Math.PI / 2 - 0.03;
    }
    this.orbit.target.set(c.x, this.mode === "top" ? 0 : 0.9, c.z);
    this.orbit.minDistance = 1.5;
    this.orbit.maxDistance = 90;
    this.orbit.update();
  }

  private aim() {
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  // ---- input -------------------------------------------------------------------

  private listen() {
    const el = this.renderer.domElement;
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    };
    const keyDown = (e: KeyboardEvent) => {
      if (this.mode !== "walk" || typing(e)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Shift"].includes(k)) {
        this.keys.add(k);
        if (k !== "Shift") e.preventDefault();
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (e.key === "Shift") this.keys.delete("Shift");
    };
    const blur = () => this.keys.clear();
    const locked = () => document.pointerLockElement === el;
    const lockChange = () => {
      if (!locked()) pointerFreedAt = performance.now();
    };
    const mouseLook = (e: MouseEvent) => {
      if (this.mode !== "walk" || !locked()) return;
      this.yaw -= e.movementX * MOUSE_LOOK;
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - e.movementY * MOUSE_LOOK));
      this.aim();
    };
    const down = (e: PointerEvent) => {
      this.dragging = { x: e.clientX, y: e.clientY, moved: 0 };
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging || locked()) return;
      const dx = e.clientX - this.dragging.x;
      const dy = e.clientY - this.dragging.y;
      this.dragging = { x: e.clientX, y: e.clientY, moved: this.dragging.moved + Math.abs(dx) + Math.abs(dy) };
      if (this.mode === "walk" && e.buttons) {
        this.yaw -= dx * LOOK_SPEED;
        this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy * LOOK_SPEED));
        this.aim();
      }
    };
    const up = (e: PointerEvent) => {
      const drag = this.dragging;
      this.dragging = null;
      if (!drag || drag.moved >= 5) return;
      // walking: the first click takes the mouse for looking; later clicks act at the crosshair
      if (this.mode === "walk" && !locked() && !this.callbacks.placing()) {
        void Promise.resolve(el.requestPointerLock?.()).catch(() => {});
        return;
      }
      this.click(e, this.mode === "walk" && locked());
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("pointerlockchange", lockChange);
    document.addEventListener("mousemove", mouseLook);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    this.cleanups.push(() => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("pointerlockchange", lockChange);
      document.removeEventListener("mousemove", mouseLook);
      if (locked()) document.exitPointerLock();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    });
  }

  private click(e: PointerEvent, atCentre = false) {
    if (!this.content) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = atCentre ? new THREE.Vector2(0, 0) : new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.callbacks.placing()) {
      const floor = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floor)) this.callbacks.onFloor(floor.x, floor.z);
      return;
    }
    const hit = this.raycaster.intersectObject(this.content, true).find((h) => (h.object as THREE.Mesh).isMesh && h.object.name !== "ground");
    if (!hit) return this.callbacks.onPick(null);
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o.userData.doorHinge) return this.setDoors("toggle", o.userData.doorId);
      const id = o.userData.entityId as string | undefined;
      if (id) return this.callbacks.onPick(this.model?.items.some((i) => i.id === id) ? id : null);
    }
  }

  // ---- frame loop ----------------------------------------------------------------

  private fitCanvas() {
    const w = Math.max(1, this.mount.clientWidth);
    const h = Math.max(1, this.mount.clientHeight);
    const wasHidden = this.camera.aspect === 1 || this.renderer.domElement.width <= 2;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    // the pane just appeared (or first sized): frame the building for its real shape
    if (wasHidden && w > 2 && h > 2 && this.mode !== "walk") this.placeCamera();
  }

  private walk(dt: number) {
    let forward = 0;
    let strafe = 0;
    if (this.keys.has("w") || this.keys.has("ArrowUp")) forward++;
    if (this.keys.has("s") || this.keys.has("ArrowDown")) forward--;
    if (this.keys.has("d") || this.keys.has("ArrowRight")) strafe++;
    if (this.keys.has("a") || this.keys.has("ArrowLeft")) strafe--;
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const r = { x: -f.z, z: f.x };
    // diagonal moves are no faster than straight ones
    const n = Math.hypot(forward, strafe) || 1;
    const speed = STEP * (this.keys.has("Shift") ? RUN : 1);
    const want = { x: ((f.x * forward + r.x * strafe) / n) * speed, z: ((f.z * forward + r.z * strafe) / n) * speed };
    // ease towards the wanted velocity: smooth starts and stops, independent of frame rate
    const blend = 1 - Math.exp(-EASE * dt);
    this.velocity.x += (want.x - this.velocity.x) * blend;
    this.velocity.z += (want.z - this.velocity.z) * blend;
    if (!forward && !strafe && Math.hypot(this.velocity.x, this.velocity.z) < 0.01) {
      this.velocity = { x: 0, z: 0 };
      return;
    }
    let dx = this.velocity.x * dt;
    let dz = this.velocity.z * dt;
    const p = this.camera.position;
    const free = (x: number, z: number) => !this.obstacles.some((b) => boxesOverlap({ x, y: z, halfW: BODY, halfD: BODY, angle: 0 }, b));
    // slide along walls: try the full step, then each axis on its own
    if (!free(p.x + dx, p.z + dz)) {
      if (free(p.x + dx, p.z)) (dz = 0), (this.velocity.z = 0);
      else if (free(p.x, p.z + dz)) (dx = 0), (this.velocity.x = 0);
      else return void (this.velocity = { x: 0, z: 0 });
    }
    p.x += dx;
    p.z += dz;
    this.aim();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.pendingModel) {
      const next = this.pendingModel;
      this.pendingModel = null;
      try {
        this.rebuild(next);
      } catch (err) {
        console.error("[clavis] 3D rebuild failed", err);
      }
    }
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === "walk") this.walk(dt);
    else this.orbit.update();
    for (const d of this.doors) {
      if (Math.abs(d.target - d.amount) < 1e-3) continue;
      d.amount += (d.target - d.amount) * Math.min(1, dt * 6);
      d.hinge.rotation.y = d.amount * d.openAngle;
      this.shadowsDirty = true;
    }
    // a hidden pane (plan-only layout) keeps its scene current but skips drawing
    if (this.mount.clientWidth < 2 || this.mount.clientHeight < 2) return;
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  };
}
