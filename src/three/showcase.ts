/**
 * The landing page's model: a design and its grounds, rendered the way the studio renders
 * them, that visitors can turn and zoom. It opens as the 2D plan seen from straight above,
 * north up, then the house rises out of the plan while the camera swings round to the front,
 * and the trees grow in.
 *
 * Interaction (OrbitControls): drag to turn, right-drag or two fingers to pan. Zoom with the
 * buttons, Ctrl/⌘ + scroll, or a pinch — a plain scroll wheel keeps scrolling the page.
 * It draws only while something moves, and not at all while off screen.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PlanModel, Room } from "../model/types";
import { elevationOf, levelAbove, levelOf } from "../model/levels";
import { catalogByKind } from "../model/catalog";
import type { SitePiece } from "../components/figures/sunsetFigure";
import { buildContent, disposeGroup } from "./content";
import { buildSite } from "./site";
import { Daylight } from "./daylight";
import { slab } from "./kit";
import { cordMaterial, lampShadeMaterial, surface, wallCapMaterial } from "./materials";

/** Wall tops are drawn in ink while the house is still a flat plan, and fade to plaster as it rises. */
const INK = new THREE.Color("#15171c");
const CAP = wallCapMaterial.color.clone();

const roofMaterial = surface("#eeede8", "matte");

/**
 * A flat roof over every room that has no room above it, out to the walls' outer faces and
 * resting on the tallest wall of its floor. A room mostly covered by the floor above is left
 * to that floor's slab.
 */
function buildRoof(model: PlanModel): THREE.Group {
  const roof = new THREE.Group();
  roof.name = "roof";
  const edge = Math.max(0.1, ...model.walls.map((w) => w.thickness)) / 2 + 0.02;
  const overlap = (a: Room, b: Room) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (const r of model.rooms) {
    const level = levelOf(r);
    const above = levelAbove(model, level);
    const covered = above ? model.rooms.filter((o) => levelOf(o) === above.id).reduce((sum, o) => sum + overlap(r, o), 0) : 0;
    if (covered > r.w * r.h * 0.5) continue;
    const top = elevationOf(model, level) + Math.max(2.4, ...model.walls.filter((w) => levelOf(w) === level).map((w) => w.height));
    roof.add(slab(r.w + edge * 2, 0.24, r.h + edge * 2, roofMaterial).at(r.x + r.w / 2, top, r.y + r.h / 2));
  }
  return roof;
}

/** Phases of the opening, in milliseconds. */
const RISE: [number, number] = [700, 3300];
const SWING: [number, number] = [300, 3900];
const GROW: [number, number] = [2600, 4200];
const ROOF: [number, number] = [3500, 4400];
export const INTRO_MS = 4400;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const within = (t: number, [a, b]: [number, number]) => clamp((t - a) / (b - a));

export interface ShowcaseOptions {
  /** where the camera rests, as a direction from the house in plan (x east, y south) */
  front: { x: number; y: number };
  /** degrees above the horizon the camera looks down from */
  elevation: number;
  /** let one finger turn the model (phones: only after the visitor asks to explore) */
  touch: boolean;
}

export class Showcase {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1500);
  private controls: OrbitControls;
  private daylight: Daylight;
  private house: THREE.Group;
  private site: THREE.Group;
  private roof: THREE.Group;
  /** 0 = roof off (lifted away), 1 = roof on */
  private roofOn = 0;
  private roofTarget = 1;
  private trees: THREE.Object3D[] = [];
  private centre = new THREE.Vector3();
  private radius = 10;
  private rest = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private plan = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private dirty = true;
  private visible = true;
  private frame = 0;
  private intro: { t0: number } | null = null;
  private tween: { t0: number; ms: number; from: THREE.Vector3; to: THREE.Vector3; target0: THREE.Vector3; target1: THREE.Vector3 } | null = null;
  private resize: ResizeObserver;
  private seen: IntersectionObserver;
  private cleanups: (() => void)[] = [];

  constructor(
    private mount: HTMLElement,
    model: PlanModel,
    sitePieces: readonly SitePiece[],
    private opts: ShowcaseOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.display = "block";
    mount.appendChild(this.renderer.domElement);

    this.daylight = new Daylight(this.renderer, this.scene);
    this.daylight.setTheme("light");

    const { group, bounds } = buildContent(model);
    this.house = group;
    // daylight: the room lamps stay off, and their pendants are not wanted in a picture of the outside
    group.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if ((o as THREE.Light).isLight || m === lampShadeMaterial || m === cordMaterial) o.visible = false;
    });
    // the lawn stays where it is while the house rises out of its plan
    const ground = group.getObjectByName("ground");
    this.site = buildSite(sitePieces);
    this.site.traverse((o) => {
      if (o.userData.grows) this.trees.push(o);
    });
    this.roof = buildRoof(model);
    this.scene.add(this.house, this.site, this.roof);
    if (ground) this.scene.attach(ground);

    // frame the house itself (the pool and terrace beside it come into view with it); the sun's
    // shadows cover the whole plot
    const all = new THREE.Box3().copy(bounds).union(new THREE.Box3().setFromObject(this.site));
    const framed = new THREE.Box3().copy(bounds);
    this.site.traverse((o) => {
      if (o.userData.frames) framed.union(new THREE.Box3().setFromObject(o));
    });
    // the design's own pools, terraces and decks belong in the picture too (its trees need not)
    const paved = new Set(model.items.filter((it) => catalogByKind(it.kind)?.category === "outdoor" && catalogByKind(it.kind)?.isRug).map((it) => it.id));
    for (const child of this.house.children) if (paved.has(child.userData.entityId)) framed.union(new THREE.Box3().setFromObject(child));
    framed.getCenter(this.centre);
    // look at the middle of a tall house, and just above the floor of a low one
    this.centre.y = Math.max(1.2, bounds.max.y * 0.38);
    this.radius = Math.max(6, framed.getSize(new THREE.Vector3()).setY(0).length() / 2);
    this.daylight.aim(all.getCenter(new THREE.Vector3()), all.getSize(new THREE.Vector3()).setY(0).length() / 2 + 2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      enableZoom: opts.touch, // pinch on phones; Ctrl/⌘ + scroll and the buttons elsewhere
      minDistance: this.radius * 0.35,
      maxDistance: this.radius * 3.5,
      minPolarAngle: 0.05,
      maxPolarAngle: Math.PI / 2 - 0.04, // never below the lawn
      enabled: false, // until the opening has played
    });
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener("change", () => (this.dirty = true));
    // on a phone one finger scrolls the page until the visitor chooses to explore the model
    this.setTouch(!opts.touch);

    this.placeViews();
    this.camera.position.copy(this.rest.position);
    this.controls.target.copy(this.rest.target);

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !this.controls.enabled) return; // a plain wheel scrolls the page
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 0.88 : 1 / 0.88, false);
    };
    this.renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    this.cleanups.push(() => this.renderer.domElement.removeEventListener("wheel", onWheel));

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(mount);
    this.seen = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.dirty = true;
    });
    this.seen.observe(mount);
    this.fit();
    this.loop();
  }

  /** The resting view (from the front, looking down a little) and the plan view (straight down, north up). */
  private placeViews() {
    const dir = new THREE.Vector3(this.opts.front.x, 0, this.opts.front.y).normalize();
    const el = THREE.MathUtils.degToRad(this.opts.elevation);
    const dist = this.fitDistance(0.5);
    this.rest.target.copy(this.centre);
    this.rest.position.copy(this.centre).addScaledVector(dir, Math.cos(el) * dist).setY(this.centre.y + Math.sin(el) * dist);
    this.plan.target.copy(this.centre).setY(0);
    // straight down with north at the top: the camera's up is plan north (−z)
    this.plan.position.copy(this.centre).setY(this.fitDistance(0.85) + 2);
  }

  /** How far back the camera must be for the grounds to fill the view (`fill` < 1 is tighter). */
  private fitDistance(fill: number) {
    const v = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const h = Math.atan(Math.tan(v) * this.camera.aspect);
    return (this.radius * fill) / Math.sin(Math.min(v, h));
  }

  /** Play the opening: from the flat plan, up into the model. */
  playIntro(reduceMotion: boolean) {
    this.roofTarget = 1; // every opening ends with the roof on
    this.tween = null;
    if (reduceMotion) return this.finishIntro();
    this.intro = { t0: performance.now() };
    this.controls.enabled = false;
    this.dirty = true;
  }

  private finishIntro() {
    this.intro = null;
    this.roofOn = this.roofTarget;
    this.placeRoof();
    this.house.scale.y = 1;
    wallCapMaterial.color.copy(CAP);
    for (const t of this.trees) t.scale.setScalar(1);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.rest.position);
    this.controls.target.copy(this.rest.target);
    this.controls.enabled = true;
    this.controls.update();
    this.dirty = true;
  }

  private stepIntro(now: number) {
    const t = now - this.intro!.t0;
    const rise = ease(within(t, RISE));
    const swing = ease(within(t, SWING));
    const grow = ease(within(t, GROW));
    // the roof settles on last
    this.roofOn = this.roofTarget * ease(within(t, ROOF));
    this.placeRoof();
    // the house rises out of its own plan
    this.house.scale.y = 0.004 + rise * 0.996;
    wallCapMaterial.color.copy(INK).lerp(CAP, clamp(rise * 4));
    for (const tr of this.trees) tr.scale.setScalar(Math.max(0.001, grow));
    // the camera swings from straight above (north up) round and down to the front
    const from = this.plan.position.clone().sub(this.plan.target);
    const to = this.rest.position.clone().sub(this.rest.target);
    const sFrom = new THREE.Spherical().setFromVector3(from);
    const sTo = new THREE.Spherical().setFromVector3(to);
    // the plan view has no direction of its own: start it facing north so the turn reads
    sFrom.theta = Math.PI;
    let dTheta = sTo.theta - sFrom.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    const s = new THREE.Spherical(sFrom.radius + (sTo.radius - sFrom.radius) * swing, Math.max(0.0001, sFrom.phi + (sTo.phi - sFrom.phi) * swing), sFrom.theta + dTheta * swing);
    const target = this.plan.target.clone().lerp(this.rest.target, swing);
    this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(s));
    // north up while looking straight down, then the world's up as the camera comes down
    this.camera.up.set(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), clamp(swing * 3)).normalize();
    this.camera.lookAt(target);
    this.controls.target.copy(target);
    this.dirty = true;
    if (t >= INTRO_MS) this.finishIntro();
  }

  /** Put the roof on (true) or lift it off to look inside (false). */
  setRoof(on: boolean) {
    this.roofTarget = on ? 1 : 0;
    this.dirty = true;
  }

  get roofShown(): boolean {
    return this.roofTarget === 1;
  }

  /** The roof hovers above the house and fades as it lifts off. */
  private placeRoof() {
    const lift = 1 - this.roofOn;
    this.roof.position.y = lift * 4;
    this.roof.visible = this.roofOn > 0.01;
    this.dirty = true;
  }

  /** Zoom in (factor < 1) or out (> 1), smoothly or at once. */
  zoom(factor: number, smooth = true) {
    if (this.intro) this.finishIntro();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    const to = this.controls.target.clone().add(offset.setLength(len));
    if (!smooth) {
      this.camera.position.copy(to);
      this.dirty = true;
      return;
    }
    this.tween = { t0: performance.now(), ms: 320, from: this.camera.position.clone(), to, target0: this.controls.target.clone(), target1: this.controls.target.clone() };
  }

  /** Back to the front view. */
  reset() {
    if (this.intro) this.finishIntro();
    this.tween = { t0: performance.now(), ms: 700, from: this.camera.position.clone(), to: this.rest.position.clone(), target0: this.controls.target.clone(), target1: this.rest.target.clone() };
  }

  /** Whether the visitor has moved away from the front view. */
  get moved(): boolean {
    return this.camera.position.distanceTo(this.rest.position) > 0.2 || this.controls.target.distanceTo(this.rest.target) > 0.2;
  }

  /** Let one finger turn the model (true) or scroll the page (false). */
  setTouch(on: boolean) {
    this.controls.enableRotate = on || !this.opts.touch;
    this.controls.enablePan = on || !this.opts.touch;
    this.controls.enableZoom = on && this.opts.touch;
    this.renderer.domElement.style.touchAction = on || !this.opts.touch ? "none" : "pan-y";
  }

  private fit() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const wasAtRest = !this.moved;
    this.placeViews();
    if (wasAtRest && !this.intro) {
      this.camera.position.copy(this.rest.position);
      this.controls.target.copy(this.rest.target);
    }
    this.dirty = true;
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const now = performance.now();
    if (this.intro) this.stepIntro(now);
    if (this.tween) {
      const p = ease(clamp((now - this.tween.t0) / this.tween.ms));
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, p);
      this.controls.target.lerpVectors(this.tween.target0, this.tween.target1, p);
      this.dirty = true;
      if (p >= 1) this.tween = null;
    }
    if (!this.intro) {
      this.controls.update();
      if (Math.abs(this.roofOn - this.roofTarget) > 1e-3) {
        this.roofOn += (this.roofTarget - this.roofOn) * 0.16;
        if (Math.abs(this.roofOn - this.roofTarget) < 1e-3) this.roofOn = this.roofTarget;
        this.placeRoof();
      }
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.seen.disconnect();
    for (const c of this.cleanups) c();
    this.controls.dispose();
    disposeGroup(this.house);
    disposeGroup(this.site);
    disposeGroup(this.roof);
    const ground = this.scene.getObjectByName("ground");
    if (ground) disposeGroup(ground);
    wallCapMaterial.color.copy(CAP);
    this.daylight.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
