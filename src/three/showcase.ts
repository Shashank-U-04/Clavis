/**
 * The landing page's model: a design and its grounds, rendered the way the studio renders
 * them, that visitors can turn and zoom.
 *
 * It opens as the 2D plan seen from straight above, north up, and is then built floor by floor
 * while the camera circles the house: the ground floor's walls rise wall by wall and its rooms
 * are furnished, the next floor's slabs are lowered on, its walls rise and its rooms are
 * furnished, and so on to the top; then the roof goes on, the pool, terraces and garden come
 * in, and the camera settles at the front. Every frame of the opening is worked out from the
 * time alone (`pose`), so it never jumps and a replay starts exactly where the first one did.
 *
 * Interaction (OrbitControls): drag to turn, right-drag or two fingers to pan, scroll or pinch
 * to zoom. It draws only while something moves, and not at all while off screen.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PlanModel, Room } from "../model/types";
import { elevationOf, levelAbove, levelOf, levelsOf } from "../model/levels";
import { catalogByKind } from "../model/catalog";
import type { SitePiece } from "../components/figures/sunsetFigure";
import { buildContent, disposeGroup, seedOf } from "./content";
import { buildFurniture } from "./furniture";
import { buildSite } from "./site";
import { Daylight } from "./daylight";
import { slab } from "./kit";
import { cordMaterial, lampShadeMaterial, surface, wallCapMaterial } from "./materials";

/** Wall tops are drawn in ink while the house is still a flat plan, and fade to plaster as it rises. */
const INK = new THREE.Color("#15171c");
const CAP = wallCapMaterial.color.clone();

const roofMaterial = surface("#eeede8", "matte");
/** How deep a roof slab is; a roof over a lower wing sits flush with the floor beside it. */
const ROOF_DEPTH = 0.2;

/** One roof slab, and the floor (index from the ground) whose build it belongs to. */
interface RoofSlab {
  mesh: THREE.Object3D;
  /** a roof over a lower wing goes on with the floor above it; the top roof goes on last */
  withLevel: number | null;
}

/**
 * A flat roof over every room that has no room above it, out to the walls' outer faces. Over a
 * lower wing it is level with the floor above (the walls reach up to it); over the top floor it
 * rests on that floor's tallest wall. A room mostly covered by the floor above is left to that
 * floor's slab.
 */
function buildRoof(model: PlanModel): { group: THREE.Group; slabs: RoofSlab[] } {
  const group = new THREE.Group();
  group.name = "roof";
  const slabs: RoofSlab[] = [];
  const levels = levelsOf(model);
  const edge = Math.max(0.1, ...model.walls.map((w) => w.thickness)) / 2 + 0.02;
  const overlap = (a: Room, b: Room) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (const r of model.rooms) {
    const level = levelOf(r);
    const above = levelAbove(model, level);
    const covered = above ? model.rooms.filter((o) => levelOf(o) === above.id).reduce((sum, o) => sum + overlap(r, o), 0) : 0;
    if (covered > r.w * r.h * 0.5) continue;
    const wallTop = Math.max(2.4, ...model.walls.filter((w) => levelOf(w) === level).map((w) => w.height));
    // just under the floor finish above, so the two never fight over the same surface
    const bottom = above ? above.elevation - ROOF_DEPTH - 0.01 : elevationOf(model, level) + wallTop;
    const mesh = slab(r.w + edge * 2, ROOF_DEPTH, r.h + edge * 2, roofMaterial).at(r.x + r.w / 2, bottom, r.y + r.h / 2);
    group.add(mesh);
    slabs.push({ mesh, withLevel: above ? levels.findIndex((l) => l.id === above.id) : null });
  }
  return { group, slabs };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** ease in and out (cubic) */
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
/** a gentler ease for long camera moves: no sudden rush in the middle */
const glide = (v: number) => 0.5 - Math.cos(Math.PI * v) / 2;
/** ease out with a touch of settle, for pieces lowered into place */
const land = (v: number) => 1 - (1 - v) ** 3;
const span = (t: number, at: number, ms: number) => clamp((t - at) / ms);

/** The opening's rhythm (ms). */
const PLAN_HOLD = 1300; // the flat plan, from above, before anything rises
const SLAB_MS = 900; // an upper floor's slabs are lowered on
const WALLS_MS = 2100; // a floor's walls rise, one after another
const WALL_MS = 1000; // …each wall takes this long
const FURNISH_MS = 1500; // a floor's rooms are furnished, piece after piece
const PIECE_MS = 650;
const ROOF_MS = 1100;
const GROUNDS_MS = 2000;
const SETTLE_MS = 1600; // the camera comes round to the front
const TURN_DELAY = 900; // the camera tilts this long before it starts to circle

/** Outdoor pieces that grow in rather than being set down. */
const PLANTS = /tree|hedge|planter|shrub|bush/;

/** How a piece of the house comes in. */
type Arrival = "rise" | "lower" | "drop" | "grow";

interface Piece {
  obj: THREE.Object3D;
  y: number;
  scale: THREE.Vector3;
  at: number;
  ms: number;
  how: Arrival;
  /** how far above its place a lowered or dropped piece starts */
  from: number;
  /** a piece already there in the flat plan (the ground floor's walls and floors) */
  inPlan: boolean;
}

/** The moments the page's build log follows (ms from the start of the opening). */
export interface ShowcaseTimeline {
  /** the camera starts down from the plan */
  lift: number;
  /** each floor starts building, from the ground up */
  levels: number[];
  roof: number;
  grounds: number;
  end: number;
}

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
  private camera = new THREE.PerspectiveCamera(38, 1, 0.3, 900);
  private controls: OrbitControls;
  private daylight: Daylight;
  private house: THREE.Group;
  private site: THREE.Group;
  private roof: THREE.Group;
  private pieces: Piece[] = [];
  readonly timeline: ShowcaseTimeline;
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

  constructor(
    private mount: HTMLElement,
    private model: PlanModel,
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
    // the lawn stays where it is while the house is built on it
    const ground = group.getObjectByName("ground");
    this.site = buildSite(sitePieces);
    const roof = buildRoof(model);
    this.roof = roof.group;
    this.scene.add(this.house, this.site, this.roof);
    if (ground) this.scene.attach(ground);

    // the sun's shadows reach everything in the design, trees out on the lawn included
    const all = new THREE.Box3().setFromObject(this.house).union(new THREE.Box3().setFromObject(this.site));
    // frame the house itself (the pool and terrace beside it come into view with it)
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

    this.timeline = this.schedule(model, roof.slabs);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.08,
      zoomSpeed: 0.7,
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

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(mount);
    this.seen = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.dirty = true;
    });
    this.seen.observe(mount);
    this.fit();
    // until the opening plays, the frame shows its first moment: the flat plan from above
    this.pose(0);
    this.loop();
  }

  /**
   * When each piece of the house comes in. Floors are built from the ground up; on each, the
   * walls rise in a sweep across the plan and then the rooms are furnished the same way. The
   * design's outdoor pieces (pool, terraces, loungers, trees) wait for the grounds, after the roof.
   */
  private schedule(model: PlanModel, roofs: RoofSlab[]): ShowcaseTimeline {
    const levels = levelsOf(model);
    const indexOf = (id: string) => Math.max(0, levels.findIndex((l) => l.id === id));
    const byId = new Map<string, { level: number; kind: "wall" | "room" | "item" | "outdoor" | "plant"; x: number; y: number }>();
    for (const w of model.walls) byId.set(w.id, { level: indexOf(levelOf(w)), kind: "wall", x: (w.ax + w.bx) / 2, y: (w.ay + w.by) / 2 });
    for (const r of model.rooms) byId.set(r.id, { level: indexOf(levelOf(r)), kind: "room", x: r.x + r.w / 2, y: r.y + r.h / 2 });
    for (const it of model.items) {
      // pools, terraces and outdoor furniture are set down; trees, hedges and planters grow
      const outdoor = catalogByKind(it.kind)?.category === "outdoor";
      const kind = !outdoor ? "item" : PLANTS.test(it.kind) ? "plant" : "outdoor";
      byId.set(it.id, { level: indexOf(levelOf(it)), kind, x: it.x, y: it.y });
    }

    // a sweep across the plan, from the corner the camera starts nearest to: 0 … 1
    const sweep = (x: number, y: number) => x * 0.8 + y * 0.6;
    const order = (list: { x: number; y: number }[]) => {
      const values = list.map((p) => sweep(p.x, p.y));
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      return (p: { x: number; y: number }) => (hi - lo < 1e-6 ? 0 : (sweep(p.x, p.y) - lo) / (hi - lo));
    };

    const groups = new Map<string, { obj: THREE.Object3D; level: number; x: number; y: number }[]>();
    const add = (key: string, entry: { obj: THREE.Object3D; level: number; x: number; y: number }) => groups.set(key, [...(groups.get(key) ?? []), entry]);
    for (const obj of this.house.children) {
      const info = byId.get(obj.userData.entityId);
      if (!info || !obj.visible) continue;
      add(info.kind === "outdoor" || info.kind === "plant" ? info.kind : `${info.kind}:${info.level}`, { obj, level: info.level, x: info.x, y: info.y });
    }

    const piece = (obj: THREE.Object3D, at: number, ms: number, how: Arrival, from = 0, inPlan = false) =>
      this.pieces.push({ obj, y: obj.position.y, scale: obj.scale.clone(), at, ms, how, from, inPlan });
    const stagger = (key: string, at: number, total: number, each: number, how: Arrival, from = 0, inPlan = false) => {
      const list = groups.get(key) ?? [];
      const rank = order(list);
      for (const e of list) piece(e.obj, at + rank(e) * Math.max(0, total - each), each, how, from, inPlan);
    };

    const starts: number[] = [];
    let t = PLAN_HOLD;
    for (let i = 0; i < levels.length; i++) {
      starts.push(t);
      if (i > 0) {
        // the floor's slabs are lowered on, and the roofs over the wing below with them
        stagger(`room:${i}`, t, SLAB_MS, SLAB_MS * 0.7, "lower", 2.6);
        for (const r of roofs) if (r.withLevel === i) piece(r.mesh, t, SLAB_MS * 0.7, "lower", 2.6);
        t += SLAB_MS * 0.75;
      } else {
        // the ground floor's rooms are the plan itself
        stagger("room:0", 0, 0, 0, "lower", 0, true);
      }
      stagger(`wall:${i}`, t, WALLS_MS, WALL_MS, "rise", 0, i === 0);
      stagger(`item:${i}`, t + WALLS_MS * 0.75, FURNISH_MS, PIECE_MS, "drop", 0.9);
      t += WALLS_MS * 0.75 + FURNISH_MS * 0.55;
    }
    const roofAt = t;
    const top = roofs.filter((r) => r.withLevel === null);
    top.forEach((r, i) => piece(r.mesh, roofAt + (top.length > 1 ? (i / (top.length - 1)) * ROOF_MS * 0.4 : 0), ROOF_MS * 0.6, "lower", 3));
    const groundsAt = roofAt + ROOF_MS * 0.6;
    stagger("outdoor", groundsAt, GROUNDS_MS * 0.7, 700, "drop", 0.6);
    stagger("plant", groundsAt + GROUNDS_MS * 0.3, GROUNDS_MS * 0.7, 900, "grow");
    let n = 0;
    this.site.traverse((o) => {
      if (o.userData.grows) piece(o, groundsAt + GROUNDS_MS * 0.3 + ((n++ * 7) % 10) * GROUNDS_MS * 0.05, 900, "grow");
    });
    return { lift: PLAN_HOLD * 0.7, levels: starts, roof: roofAt, grounds: groundsAt, end: groundsAt + GROUNDS_MS + SETTLE_MS * 0.5 };
  }

  /** The resting view (from the front, looking down a little) and the plan view (straight down, north up). */
  private placeViews() {
    const dir = new THREE.Vector3(this.opts.front.x, 0, this.opts.front.y).normalize();
    const el = THREE.MathUtils.degToRad(this.opts.elevation);
    // a little lawn all round the house in the picture, so it stands in open grounds
    const dist = this.fitDistance(0.58);
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

  /** Play the opening: from the flat plan, up into the finished house. */
  playIntro(reduceMotion: boolean) {
    this.tween = null;
    if (reduceMotion) return this.finishIntro();
    this.intro = { t0: performance.now() };
    this.controls.enabled = false;
    this.pose(0);
  }

  private finishIntro() {
    this.intro = null;
    this.pose(Infinity);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.rest.position);
    this.controls.target.copy(this.rest.target);
    this.controls.enabled = true;
    this.controls.update();
    this.dirty = true;
  }

  /** The house and the camera `t` ms into the opening. */
  private pose(t: number) {
    for (const p of this.pieces) {
      const raw = span(t, p.at, p.ms);
      const o = p.obj;
      o.position.y = p.y;
      o.scale.copy(p.scale);
      if (p.how === "rise") {
        // a wall grows up from its footprint; in the flat plan it is a low ink outline
        const s = p.inPlan ? 0.025 + 0.975 * ease(raw) : ease(raw);
        o.visible = s > 0.001;
        o.scale.y = p.scale.y * Math.max(0.001, s);
      } else if (p.how === "lower") {
        const s = land(raw);
        o.visible = p.inPlan || raw > 0;
        o.position.y = p.y + (1 - s) * p.from;
      } else if (p.how === "drop") {
        const s = land(raw);
        o.visible = raw > 0;
        o.position.y = p.y + (1 - s) * p.from;
        o.scale.multiplyScalar(Math.max(0.001, 0.6 + 0.4 * s));
      } else {
        const s = land(raw);
        o.visible = raw > 0;
        o.scale.multiplyScalar(Math.max(0.001, s));
      }
    }
    // wall tops: ink in the plan, plaster once the ground floor stands
    const groundWalls = this.timeline.levels[0] ?? PLAN_HOLD;
    wallCapMaterial.color.copy(INK).lerp(CAP, span(t, groundWalls, WALLS_MS * 0.5));
    if (Number.isFinite(t)) this.poseCamera(t);
    this.dirty = true;
  }

  /**
   * The camera: straight down on the plan, north up; then it tilts down over the house and
   * circles it once while it is built, looking a little higher as the floors go up, and comes
   * round to the front as the garden grows in.
   */
  private poseCamera(t: number) {
    const { lift, end } = this.timeline;
    const tilt = ease(span(t, lift, 2200));
    // the circling starts once the camera has tilted well off the vertical: turning while it
    // still looks straight down would spin the picture on the spot
    const turn = glide(span(t, lift + TURN_DELAY, end - lift - TURN_DELAY));
    const settle = ease(span(t, end - SETTLE_MS * 1.4, SETTLE_MS * 1.4));

    const from = new THREE.Spherical().setFromVector3(this.plan.position.clone().sub(this.plan.target));
    const to = new THREE.Spherical().setFromVector3(this.rest.position.clone().sub(this.rest.target));
    // the plan view has no direction of its own: start it from the south, looking north, so as
    // the camera tilts down north stays at the top of the picture (from the north side it
    // would have to roll half a turn on the way down, which shows as a jolt)
    from.theta = 0;
    let dTheta = to.theta - from.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    // once all the way round, plus whatever is left to reach the front
    const theta = from.theta + (dTheta + (dTheta >= 0 ? 2 * Math.PI : -2 * Math.PI)) * turn;
    // while circling it looks down at about 30°, so every floor and the roof can be seen
    const orbit = { phi: THREE.MathUtils.degToRad(60), radius: to.radius * 1.12 };
    const phi = from.phi + (orbit.phi - from.phi) * tilt + (to.phi - orbit.phi) * settle;
    const radius = from.radius + (orbit.radius - from.radius) * tilt + (to.radius - orbit.radius) * settle;

    // the eye follows the building up as floors are added
    const built = this.timeline.levels.length ? clamp((t - this.timeline.levels[0]) / Math.max(1, this.timeline.roof - this.timeline.levels[0])) : 1;
    const target = this.plan.target.clone().lerp(this.rest.target, tilt);
    target.y = this.plan.target.y + (this.rest.target.y - this.plan.target.y) * tilt * (0.55 + 0.45 * built);
    target.lerp(this.rest.target, settle);

    this.camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, Math.max(0.0001, phi), theta)));
    // north up while looking straight down, then the world's up as the camera comes down
    this.camera.up.set(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), clamp(tilt * 3)).normalize();
    this.camera.lookAt(target);
    this.controls.target.copy(target);
  }

  /**
   * The real trees, hedges, planters and pot plants have arrived: put each in place of its drawn
   * stand-in, keeping where it is in the opening, so the picture never jumps.
   */
  swapPlants() {
    const kinds = new Set(["tree", "hedge", "planter", "plant"]);
    const items = new Map(this.model.items.filter((it) => kinds.has(it.kind)).map((it) => [it.id, it]));
    for (const piece of this.pieces) {
      const it = items.get(piece.obj.userData.entityId);
      if (!it) continue;
      const real = buildFurniture(it.kind, seedOf(it.id));
      if (!real) continue;
      const old = piece.obj;
      real.position.copy(old.position).setY(piece.y);
      real.rotation.copy(old.rotation);
      real.scale.copy(piece.scale);
      real.userData.entityId = it.id;
      this.house.remove(old);
      this.house.add(real);
      disposeGroup(old);
      piece.obj = real;
    }
    // put everything where the opening has it now
    this.pose(this.intro ? performance.now() - this.intro.t0 : this.controls.enabled ? Infinity : 0);
  }

  /** Back to the front view. */
  reset() {
    if (this.intro) this.finishIntro();
    this.tween = { t0: performance.now(), ms: 700, from: this.camera.position.clone(), to: this.rest.position.clone(), target0: this.controls.target.clone(), target1: this.rest.target.clone() };
  }

  /** Whether the visitor has moved away from the front view. */
  get moved(): boolean {
    return !this.intro && (this.camera.position.distanceTo(this.rest.position) > 0.2 || this.controls.target.distanceTo(this.rest.target) > 0.2);
  }

  /** Whether the opening is still playing. */
  get playing(): boolean {
    return this.intro !== null;
  }

  /** Let one finger turn the model (true) or scroll the page (false). */
  setTouch(on: boolean) {
    this.controls.enableRotate = on || !this.opts.touch;
    this.controls.enablePan = on || !this.opts.touch;
    // the scroll wheel zooms on a computer; on a phone, a pinch once exploring
    this.controls.enableZoom = on || !this.opts.touch;
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
    const wasAtRest = !this.moved && !this.intro && this.controls?.enabled;
    this.placeViews();
    if (wasAtRest) {
      this.camera.position.copy(this.rest.position);
      this.controls.target.copy(this.rest.target);
    } else if (!this.intro && !this.controls.enabled && this.timeline) {
      // still waiting to open: keep showing the plan, framed to the new size
      this.pose(0);
    }
    this.dirty = true;
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const now = performance.now();
    if (this.intro) {
      const t = now - this.intro.t0;
      if (t >= this.timeline.end) this.finishIntro();
      else this.pose(t);
    }
    if (this.tween) {
      const p = ease(clamp((now - this.tween.t0) / this.tween.ms));
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, p);
      this.controls.target.lerpVectors(this.tween.target0, this.tween.target1, p);
      this.dirty = true;
      if (p >= 1) this.tween = null;
    }
    if (!this.intro && this.controls.enabled) this.controls.update();
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    this.seen.disconnect();
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
