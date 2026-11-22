/**
 * The 3D view as a plain class (no React): one renderer, camera and set of lights for its
 * whole life; only the content group is rebuilt when the design changes, at most once per
 * frame, and the replaced content is disposed.
 *
 * Camera modes:
 *   orbit — circle the building (drag to orbit, scroll to zoom)
 *   top   — straight down, north up, like the plan
 *   walk  — a 1.75 m figure steps in at the front door, seen from just behind (third person).
 *           WASD / arrows move it the way the camera faces, Shift runs, Space jumps; drag
 *           (either button) turns the camera round it, scroll zooms in and out, all the way
 *           into its eyes (first person, 1.63 m). Walls and furniture block it, doorways do
 *           not; the camera slides in rather than pass through a wall. Movement eases in and
 *           out rather than jumping.
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
import { GROUND, elevationOf, levelAbove, levelBelow, levelOf, levelsOf, onLevel } from "../model/levels";
import { isStair, stairProgress } from "../model/stairs";
import { Avatar, EYE_HEIGHT, STATURE } from "./avatar";
import { loadPlants } from "./plants";
import { walkView, type WalkView } from "./walkView";

const STEP = 1.4; // metres per second: an ordinary walking pace
const RUN = 2.3; // × STEP with Shift held: a jog, about 3.2 m/s
const EASE = 9; // how quickly the walker reaches speed and stops (per second)
const BODY = 0.22; // half the walker's width at the shoulders
const LOOK_SPEED = 0.005; // radians per pixel of drag
const TURN = 11; // how quickly the figure turns to face where it is going (per second)
const JUMP = 3.1; // metres per second upwards: a jump of about half a metre
const GRAVITY = 9.81;
/** Vertical field of view: wider while walking, so a room reads at its real size round you. */
const MODEL_FOV = 50;
const WALK_FOV = 70;
const FOLLOW = 3.2; // how far behind the walker the camera starts (metres)
const FOLLOW_MAX = 9;
const FIRST_PERSON = 0.5; // scrolled in closer than this, the camera is the walker's eyes

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
    // stairs are walked on, not walked round
    if (!c || c.isRug || c.stair || (itemSize(it)?.h ?? c.h) < 0.3) continue;
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
  /** what blocks the walker, floor by floor */
  private obstacles = new Map<string, Box[]>();
  /** the floor the walker is on, and how high their feet are */
  private walkLevel = GROUND;
  private feet = 0;
  private doors: Door[] = [];
  private mode: CameraMode = "orbit";
  private keys = new Set<string>();
  private velocity = { x: 0, z: 0 };
  /** the walker: their figure, where their feet are, which way they face, and how fast they rise or fall */
  private walker = new Avatar();
  private player = new THREE.Vector3();
  private facing = 0;
  private rising = 0;
  private jumpWanted = false;
  /** how far behind the walker the camera wants to be (0 = first person), and is after walls pull it in */
  private follow = FOLLOW;
  private followNow = FOLLOW;
  /** what the following camera must not pass through: walls and floors */
  private solids: THREE.Object3D[] = [];
  private camRay = new THREE.Raycaster();
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
    this.walker.root.visible = false;
    this.scene.add(this.walker.root);
    this.cleanups.push(() => this.walker.dispose());
    this.cleanups.push(walkView.onRequest((v) => this.setWalkView(v)));
    this.setTheme("light");

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.09;

    this.resize = new ResizeObserver(() => this.fitCanvas());
    this.resize.observe(mount);
    this.fitCanvas();
    this.listen();
    this.loop();
    // the real trees and plants arrive a moment later: build the scene again with them
    void loadPlants().then((ok) => {
      if (ok && this.model && !this.pendingModel) this.pendingModel = this.model;
    });
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
    this.camera.fov = mode === "walk" ? WALK_FOV : MODEL_FOV;
    this.camera.updateProjectionMatrix();
    this.walker.root.visible = false;
    this.placeCamera();
  }

  /** Walk seen from behind the figure, or through its eyes. */
  setWalkView(view: WalkView) {
    this.follow = view === "first" ? 0 : Math.max(this.follow, FOLLOW);
    this.followNow = this.follow;
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
    this.obstacles = new Map(levelsOf(model).map((l) => [l.id, obstaclesOf(onLevel(model, l.id))]));
    const solid = new Set([...model.walls.map((w) => w.id), ...model.rooms.map((r) => r.id)]);
    this.solids = group.children.filter((c) => solid.has(c.userData.entityId));
    if (!this.obstacles.has(this.walkLevel)) this.walkLevel = levelsOf(model)[0].id;
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
      // the walk starts just inside the front door, on the ground floor
      this.walkLevel = this.model ? levelsOf(this.model)[0].id : GROUND;
      this.feet = this.model ? elevationOf(this.model, this.walkLevel) : 0;
      this.player.set(pose?.x ?? c.x, this.feet, pose?.z ?? c.z);
      this.rising = 0;
      this.yaw = pose?.yaw ?? Math.PI;
      this.facing = this.yaw;
      this.pitch = -0.22;
      this.followNow = this.follow;
      this.placeWalker(0, 0, 0);
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

  /** Where the camera looks while walking. */
  private get look() {
    return new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /**
   * Put the figure where the walker is and the camera on it: through its eyes in first person,
   * otherwise behind and a little above its head, pulled in front of any wall or floor that
   * would come between them.
   */
  private placeWalker(dt: number, travelled: number, speed: number) {
    const first = this.follow < FIRST_PERSON;
    walkView.set(first ? "first" : "third");
    const look = this.look;
    this.walker.root.visible = !first;
    this.walker.root.position.copy(this.player);
    this.walker.root.rotation.y = this.facing;
    this.walker.update(dt, travelled, speed, this.rising !== 0);
    if (first) {
      const eye = this.player.clone().setY(this.player.y + EYE_HEIGHT);
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.add(look));
      return;
    }
    const head = this.player.clone().setY(this.player.y + STATURE - 0.12);
    this.camRay.set(head, look.clone().negate());
    this.camRay.far = this.follow;
    const hit = this.camRay.intersectObjects(this.solids, true)[0];
    const room = hit ? Math.max(0.35, hit.distance - 0.25) : this.follow;
    // in at once when something is in the way; back out gently once it is not
    this.followNow = room < this.followNow ? room : this.followNow + (room - this.followNow) * Math.min(1, dt * 4);
    this.camera.position.copy(head).addScaledVector(look, -this.followNow);
    this.camera.lookAt(head);
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
      if (k === " ") {
        this.jumpWanted = true;
        e.preventDefault();
        return;
      }
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
    const down = (e: PointerEvent) => {
      this.dragging = { x: e.clientX, y: e.clientY, moved: 0 };
      if (this.mode === "walk") el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragging.x;
      const dy = e.clientY - this.dragging.y;
      this.dragging = { x: e.clientX, y: e.clientY, moved: this.dragging.moved + Math.abs(dx) + Math.abs(dy) };
      // walking: a drag with either button turns the camera round the walker (or their head)
      if (this.mode === "walk" && e.buttons) {
        const first = this.follow < FIRST_PERSON;
        this.yaw -= dx * LOOK_SPEED;
        this.pitch = Math.max(first ? -1.25 : -1.2, Math.min(first ? 1.25 : 0.55, this.pitch - dy * LOOK_SPEED));
      }
    };
    const up = (e: PointerEvent) => {
      const drag = this.dragging;
      this.dragging = null;
      if (!drag || drag.moved >= 5 || e.button === 2) return;
      this.click(e);
    };
    // walking: scroll moves the camera in and out; all the way in is first person
    const wheel = (e: WheelEvent) => {
      if (this.mode !== "walk") return;
      e.preventDefault();
      const out = e.deltaY > 0;
      if (this.follow < FIRST_PERSON) this.follow = out ? 1.2 : 0;
      else this.follow = out ? Math.min(FOLLOW_MAX, this.follow * 1.15) : this.follow / 1.15 < 0.9 ? 0 : this.follow / 1.15;
      if (this.follow < FIRST_PERSON) this.followNow = 0;
    };
    const menu = (e: Event) => {
      if (this.mode === "walk") e.preventDefault();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    this.cleanups.push(() => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    });
  }

  private click(e: PointerEvent) {
    if (!this.content) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
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
    // moves are relative to where the camera faces
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
    if (!forward && !strafe && Math.hypot(this.velocity.x, this.velocity.z) < 0.01) this.velocity = { x: 0, z: 0 };

    let dx = this.velocity.x * dt;
    let dz = this.velocity.z * dt;
    const p = this.player;
    const blocks = this.obstacles.get(this.walkLevel) ?? [];
    const free = (x: number, z: number) => !blocks.some((b) => boxesOverlap({ x, y: z, halfW: BODY, halfD: BODY, angle: 0 }, b));
    // slide along walls: try the full step, then each axis on its own
    if ((dx || dz) && !free(p.x + dx, p.z + dz)) {
      if (free(p.x + dx, p.z)) (dz = 0), (this.velocity.z = 0);
      else if (free(p.x, p.z + dz)) (dx = 0), (this.velocity.x = 0);
      else (dx = 0), (dz = 0), (this.velocity = { x: 0, z: 0 });
    }
    p.x += dx;
    p.z += dz;
    const travelled = Math.hypot(dx, dz);

    // on a stair the floor rises (or falls) under the walker; past halfway they are on the other floor
    const under = this.groundUnder(p.x, p.z);
    this.walkLevel = under.level;
    this.feet = under.feet;
    const grounded = this.rising === 0 && p.y - under.feet < 0.05;
    if (this.jumpWanted && grounded) this.rising = JUMP;
    this.jumpWanted = false;
    if (this.rising !== 0 || p.y > under.feet + 0.3) {
      // in the air: up, then down under gravity, until the feet meet the floor
      this.rising -= GRAVITY * dt;
      p.y += this.rising * dt;
      if (p.y <= under.feet) (p.y = under.feet), (this.rising = 0);
    } else {
      p.y += (under.feet - p.y) * Math.min(1, dt * 14);
    }

    // the figure turns to face the way it walks (in first person it faces where you look)
    if (this.follow < FIRST_PERSON) this.facing = this.yaw;
    else if (travelled > 1e-4) {
      let turn = Math.atan2(dx, dz) - this.facing;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      this.facing += turn * Math.min(1, dt * TURN);
    }
    this.placeWalker(dt, travelled, travelled / Math.max(dt, 1e-3));
    // the figure's own shadow moves with it
    if (this.walker.root.visible && (travelled > 0 || this.rising !== 0)) this.shadowsDirty = true;
  }

  /** The floor under a point while walking: a stair's slope where there is one, else the current floor. */
  private groundUnder(x: number, z: number): { level: string; feet: number } {
    const m = this.model;
    if (!m) return { level: this.walkLevel, feet: this.feet };
    const below = levelBelow(m, this.walkLevel);
    for (const it of m.items) {
      if (!isStair(it)) continue;
      const lower = levelOf(it);
      if (lower !== this.walkLevel && lower !== below?.id) continue; // a stair up from here, or one coming up to here
      const upper = levelAbove(m, lower);
      const t = upper ? stairProgress(it, { x, y: z }) : null;
      if (t === null || !upper) continue;
      const from = elevationOf(m, lower);
      return { level: t > 0.5 ? upper.id : lower, feet: from + t * (upper.elevation - from) };
    }
    return { level: this.walkLevel, feet: elevationOf(m, this.walkLevel) };
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
