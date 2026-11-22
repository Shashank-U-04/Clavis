/**
 * The walker: a person at real size, so you can see how big a room is with someone in it, an
 * adult 1.75 m tall with the eyes at 1.63 m.
 *
 * In the browser it is an animated character (public/models/people/walker.fbx, public
 * domain) that stands idle, walks, runs and jumps, blending from one to the next with how fast
 * it is going. Until that has loaded, and wherever it cannot, a drawn figure stands in: the
 * joint heights of an average adult (hip 0.92 m, knee 0.49 m, shoulders 1.44 m) and a stride
 * driven by how far it has walked, so its feet never slide.
 */

import * as THREE from "three";
import { surface } from "./materials";

const PERSON = "/models/people/walker.fbx";
const PERSON_COLOURS = "/models/people/walker.png";
/** The character's walk cycle covers about this much ground at its own pace (m/s); faster or slower plays it faster or slower. */
const WALK_PACE = 1.4;
const RUN_PACE = 3.2;
const BLEND = 0.22; // seconds to blend from one movement into the next

/** Standing height, and the height of the eyes the first-person view looks from. */
export const STATURE = 1.75;
export const EYE_HEIGHT = 1.63;

const HIP = 0.92;
const KNEE = 0.49;
const SHOULDER = 1.44;
const SHOULDER_HALF = 0.2; // half the shoulder width (about 0.4 m across the joints)
const HIP_HALF = 0.09;
const UPPER_ARM = 0.3;
const FOREARM = 0.27;

const skin = surface("#d8b49a", "matte");
const top = surface("#3b6fb6", "matte");
const trousers = surface("#2f3540", "matte");
const shoes = surface("#1d1f24", "matte");
const hair = surface("#2a2320", "matte");

/** A rounded limb hanging down from its joint (the group's origin), `length` long. */
function limb(radius: number, length: number, material: THREE.Material, taper = 0.85): THREE.Group {
  const joint = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 6, 12), material);
  mesh.geometry.scale(1, 1, taper);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  joint.add(mesh);
  return joint;
}

export class Avatar {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  private torso = new THREE.Group();
  private phase = 0;
  private swing = 0; // 0 standing … 1 full stride
  /** the animated character, once loaded */
  private person: { model: THREE.Group; mixer: THREE.AnimationMixer; moves: Map<string, THREE.AnimationAction>; now: string } | null = null;
  private disposed = false;
  private loading = false;

  constructor() {
    this.root.name = "walker";
    this.hips.position.y = HIP;
    this.root.add(this.hips);

    // legs: thigh from the hip to the knee, shin from the knee to the ankle, and a shoe
    for (const side of [-1, 1]) {
      const hip = limb(0.075, HIP - KNEE, trousers);
      hip.position.x = side * HIP_HALF;
      const knee = limb(0.058, KNEE - 0.07, trousers);
      knee.position.y = -(HIP - KNEE);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.27), shoes);
      shoe.position.set(0, -(KNEE - 0.07) - 0.035, 0.05);
      shoe.castShadow = true;
      knee.add(shoe);
      hip.add(knee);
      this.hips.add(hip);
      this.legs.push({ hip, knee });
    }

    // pelvis, torso and chest up to the shoulders
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.08, 6, 14), trousers);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.75);
    pelvis.castShadow = true;
    this.hips.add(pelvis);
    this.torso.position.y = 0.04;
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, SHOULDER - HIP - 0.3, 8, 16), top);
    chest.scale.set(1.05, 1, 0.68);
    chest.position.y = (SHOULDER - HIP) / 2 - 0.03;
    chest.castShadow = true;
    this.torso.add(chest);

    // neck and head (about 0.23 m crown to chin), with hair
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin);
    neck.position.y = SHOULDER - HIP + 0.02;
    this.torso.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), skin);
    head.scale.set(0.92, 1.12, 1);
    head.position.y = STATURE - HIP - 0.04 - 0.118;
    head.castShadow = true;
    this.torso.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    cap.scale.set(0.94, 1.12, 1.02);
    cap.position.copy(head.position).add(new THREE.Vector3(0, 0.012, -0.008));
    this.torso.add(cap);

    // arms: upper arm from the shoulder, forearm from the elbow, a hand
    for (const side of [-1, 1]) {
      const shoulder = limb(0.05, UPPER_ARM, top);
      shoulder.position.set(side * SHOULDER_HALF, SHOULDER - HIP - 0.1, 0);
      const elbow = limb(0.042, FOREARM, skin);
      elbow.position.y = -UPPER_ARM;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin);
      hand.scale.set(0.8, 1.2, 0.6);
      hand.position.y = -FOREARM - 0.03;
      elbow.add(hand);
      shoulder.add(elbow);
      this.torso.add(shoulder);
      this.arms.push({ shoulder, elbow });
    }
    this.pose(0);
  }

  /**
   * Move the limbs for this frame. `travelled` is the distance walked since the last frame
   * (metres), `speed` how fast (m/s), `airborne` whether the feet are off the floor.
   */
  update(dt: number, travelled: number, speed: number, airborne: boolean) {
    if (this.person) return this.animate(dt, speed, airborne);
    // one full stride (two steps) every ~1.5 m, as people walk
    this.phase += (travelled / 1.5) * Math.PI * 2;
    const want = airborne ? 0.35 : Math.min(1, speed / 1.4);
    this.swing += (want - this.swing) * Math.min(1, dt * 10);
    this.pose(airborne ? 1 : 0);
  }

  private pose(tuck: number) {
    const s = Math.sin(this.phase);
    const swing = this.swing;
    this.legs.forEach(({ hip, knee }, i) => {
      const side = i === 0 ? 1 : -1;
      hip.rotation.x = -side * s * 0.45 * swing - tuck * 0.5;
      // the knee bends as the leg comes forward, and stays nearly straight behind
      knee.rotation.x = Math.max(0, side * Math.sin(this.phase + Math.PI / 2) * 0.7) * swing + tuck * 0.9;
    });
    this.arms.forEach(({ shoulder, elbow }, i) => {
      const side = i === 0 ? 1 : -1;
      shoulder.rotation.x = side * s * 0.4 * swing;
      shoulder.rotation.z = (i === 0 ? -1 : 1) * 0.06;
      elbow.rotation.x = -0.15 - 0.25 * swing;
    });
    // a little rise and fall over each step
    this.hips.position.y = HIP - (1 - Math.abs(Math.cos(this.phase))) * 0.03 * swing;
    this.torso.rotation.y = s * 0.06 * swing;
  }

  /** Fetch the animated character (once), the first time someone walks. */
  load() {
    if (this.loading || typeof window === "undefined") return;
    this.loading = true;
    void this.loadPerson();
  }

  /** Load the animated character and put it in place of the drawn figure. */
  private async loadPerson() {
    try {
      const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
      const [model, colours] = await Promise.all([new FBXLoader().loadAsync(PERSON), new THREE.TextureLoader().loadAsync(PERSON_COLOURS)]);
      if (this.disposed) return;
      // its colours are a small palette: each face takes one swatch, kept crisp
      colours.colorSpace = THREE.SRGBColorSpace;
      colours.magFilter = THREE.NearestFilter;
      colours.minFilter = THREE.NearestFilter;
      colours.generateMipmaps = false;
      const material = new THREE.MeshStandardMaterial({ map: colours, roughness: 0.85 });
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = material;
        m.castShadow = true;
        m.frustumCulled = false; // a skinned figure's bounds do not follow its moves
      });
      // to 1.75 m, standing on the floor at the origin
      const box = new THREE.Box3().setFromObject(model);
      const scale = STATURE / Math.max(1e-6, box.max.y - box.min.y);
      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale;

      const mixer = new THREE.AnimationMixer(model);
      const moves = new Map<string, THREE.AnimationAction>();
      for (const clip of model.animations) {
        const name = clip.name.split("|").pop()!;
        // its moves are on the spot (only the hips sway); the walk itself carries it along
        if (["Idle", "Walk", "Run", "Jump"].includes(name)) moves.set(name, mixer.clipAction(clip));
      }
      if (!moves.has("Idle") || !moves.has("Walk")) throw new Error("the character has no idle or walk");
      moves.get("Idle")!.play();
      this.root.remove(this.hips);
      this.root.add(model);
      this.person = { model, mixer, moves, now: "Idle" };
    } catch (err) {
      console.warn("[clavis] the walker's character could not load; the drawn figure stays", err);
    }
  }

  /** Blend into the movement that fits, at a pace that matches the ground covered. */
  private animate(dt: number, speed: number, airborne: boolean) {
    const p = this.person!;
    const want = airborne && p.moves.has("Jump") ? "Jump" : speed > 2.3 && p.moves.has("Run") ? "Run" : speed > 0.12 ? "Walk" : "Idle";
    if (want !== p.now) {
      const from = p.moves.get(p.now)!;
      const to = p.moves.get(want)!;
      to.reset();
      if (want === "Jump") {
        to.setLoop(THREE.LoopOnce, 1);
        to.clampWhenFinished = true;
      }
      to.play();
      from.crossFadeTo(to, BLEND, false);
      p.now = want;
    }
    if (want === "Walk") p.moves.get("Walk")!.timeScale = THREE.MathUtils.clamp(speed / WALK_PACE, 0.5, 1.6);
    if (want === "Run") p.moves.get("Run")!.timeScale = THREE.MathUtils.clamp(speed / RUN_PACE, 0.7, 1.5);
    p.mixer.update(dt);
  }

  dispose() {
    this.disposed = true;
    this.person?.mixer.stopAllAction();
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}
