/**
 * Procedural furniture. Each model fills its catalog footprint (w along x, d along z, h tall),
 * stands on y = 0 and faces +z, which is the direction the item's `rotation` points to.
 */

import { realPlant } from "./plants";
import * as THREE from "three";
import { catalogByKind, type CatalogEntry } from "../model/catalog";
import { assemble, blob, legs, pillow, post, slab } from "./kit";
import { leafMaterial, screenMaterial, surface, waterMaterial } from "./materials";

type Builder = (c: CatalogEntry) => THREE.Group;

const wood = (c = "#9b7a55") => surface(c, "wood");
const fabric = (c: string) => surface(c, "fabric");
const metal = (c = "#8d9196") => surface(c, "metal");
const white = surface("#f2f4f5", "gloss");
const dark = surface("#2f2d2b", "matte");
const handle = surface("#b9b3a8", "metal");

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

/** A sofa or armchair: base, seat cushions, back cushions and arms. */
function couch(c: CatalogEntry, seats: number): THREE.Group {
  const { w, d, h } = c;
  const body = fabric(c.color);
  const arm = Math.min(0.18, w * 0.12);
  const backD = d * 0.24;
  const seatH = h * 0.5;
  const g = assemble(
    legs(w - 0.06, d - 0.06, 0.08, dark, 0.03, 0.018),
    slab(w, seatH - 0.08 - 0.12, d, body).at(0, 0.08, 0),
    slab(w, h - 0.08, backD, body).at(0, 0.08, -d / 2 + backD / 2),
    slab(arm, h * 0.7 - 0.08, d, body).at(-w / 2 + arm / 2, 0.08, 0),
    slab(arm, h * 0.7 - 0.08, d, body).at(w / 2 - arm / 2, 0.08, 0),
  );
  const inner = w - arm * 2;
  const cw = inner / seats;
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    g.add(pillow(cw - 0.02, 0.12, d - backD - 0.04, fabric(c.color)).at(x, seatH - 0.12, backD / 2 + 0.01));
    g.add(pillow(cw - 0.04, 0.12, h * 0.45, fabric(c.color)).turn(-Math.PI / 2.4, "x").at(x, seatH + 0.02, -d / 2 + backD + 0.02));
  }
  return g;
}

const sofa: Builder = (c) => couch(c, 2);
const sofa3: Builder = (c) => couch(c, 3);
const armchair: Builder = (c) => couch(c, 1);

function chair(c: CatalogEntry, seatH = 0.46): THREE.Group {
  const { w, d, h } = c;
  const m = wood(c.color);
  return assemble(
    legs(w, d, seatH - 0.04, m, 0.03, 0.017),
    slab(w, 0.04, d, m).at(0, seatH - 0.04, 0),
    slab(w, h - seatH, 0.03, m).at(0, seatH, -d / 2 + 0.03),
  );
}

const diningChair: Builder = (c) => chair(c);

const officeChair: Builder = (c) => {
  const { w, d, h } = c;
  const seat = fabric("#3e434b");
  const g = assemble(
    post(0.03, 0.4, metal("#5a5e64")).at(0, 0.06, 0),
    pillow(w * 0.85, 0.08, d * 0.85, seat).at(0, 0.46, 0.02),
    pillow(w * 0.8, 0.07, h - 0.6, seat).turn(-Math.PI / 2.2, "x").at(0, 0.55, -d / 2 + 0.06),
  );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(slab(0.03, 0.03, w / 2, metal("#5a5e64")).turn(a).at(Math.sin(a) * w * 0.22, 0.03, Math.cos(a) * w * 0.22));
    g.add(blob(0.025, 0.025, 0.025, dark).at(Math.sin(a) * w * 0.44, 0, Math.cos(a) * w * 0.44));
  }
  return g;
};

// ---------------------------------------------------------------------------
// Tables and storage
// ---------------------------------------------------------------------------

function table(c: CatalogEntry, top = 0.04): THREE.Group {
  const m = wood(c.color);
  return assemble(legs(c.w, c.d, c.h - top, m, 0.06, 0.025), slab(c.w, top, c.d, m).at(0, c.h - top, 0));
}

const coffeeTable: Builder = (c) => {
  const g = table(c, 0.05);
  g.add(slab(c.w - 0.12, 0.02, c.d - 0.12, wood(c.color)).at(0, 0.12, 0)); // lower shelf
  return g;
};
const sideTable: Builder = (c) => table(c, 0.04);
const desk: Builder = (c) => {
  const g = table(c, 0.035);
  g.add(slab(0.4, 0.5, c.d - 0.06, wood(c.color)).at(c.w / 2 - 0.22, c.h - 0.55, 0)); // drawer pedestal
  return g;
};

const diningTable: Builder = (c) => table(c);

const diningTableOval: Builder = (c) => {
  const m = wood(c.color);
  const topGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 40);
  topGeo.scale(c.w, 1, c.d);
  topGeo.translate(0, c.h - 0.02, 0);
  const top = new THREE.Mesh(topGeo, m);
  top.castShadow = top.receiveShadow = true;
  return assemble(top, post(0.06, c.h - 0.04, m, 0.09).at(-c.w * 0.25, 0, 0), post(0.06, c.h - 0.04, m, 0.09).at(c.w * 0.25, 0, 0));
};

/** A closed box of storage with door or drawer seams on the front. */
function cabinet(c: CatalogEntry, fronts: number, opts: { plinth?: number; vertical?: boolean } = {}): THREE.Group {
  const { w, d, h } = c;
  const plinth = opts.plinth ?? 0.08;
  const body = wood(c.color);
  const g = assemble(slab(w - 0.04, plinth, d - 0.04, dark).at(0, 0, -0.01), slab(w, h - plinth, d, body).at(0, plinth, 0));
  for (let i = 1; i < fronts; i++) {
    const seam = opts.vertical ? slab(0.006, h - plinth - 0.04, 0.004, dark).at(-w / 2 + (w / fronts) * i, plinth + 0.02, d / 2) : slab(w - 0.04, 0.006, 0.004, dark).at(0, plinth + ((h - plinth) / fronts) * i, d / 2);
    g.add(seam);
  }
  for (let i = 0; i < fronts; i++) {
    const knob = opts.vertical
      ? slab(0.012, 0.12, 0.02, handle).at(-w / 2 + (w / fronts) * (i + 0.5) + (i % 2 ? -1 : 1) * (w / fronts) * 0.35, plinth + (h - plinth) * 0.55, d / 2 + 0.01)
      : slab(0.14, 0.012, 0.02, handle).at(0, plinth + ((h - plinth) / fronts) * (i + 0.5), d / 2 + 0.01);
    g.add(knob);
  }
  return g;
}

const sideboard: Builder = (c) => cabinet(c, 3, { vertical: true, plinth: 0.12 });
const nightstand: Builder = (c) => cabinet(c, 2, { plinth: 0.1 });
const wardrobe: Builder = (c) => cabinet(c, 2, { vertical: true, plinth: 0.06 });

function television(width: number): THREE.Group {
  const h = width * 0.56;
  return assemble(slab(width, h, 0.04, screenMaterial).at(0, 0.06, 0), slab(width * 0.25, 0.06, 0.18, dark).at(0, 0, 0));
}

const tvStand: Builder = (c) => {
  const g = cabinet({ ...c, h: c.h * 0.9 }, 2, { vertical: true, plinth: 0.05 });
  g.add(television(Math.min(1.2, c.w * 0.75)).translateY(c.h * 0.9));
  return g;
};

const tvSideboard: Builder = (c) => {
  const base = 0.75;
  const g = cabinet({ ...c, h: base }, 3, { vertical: true, plinth: 0.12 });
  g.add(television(Math.min(1.3, c.w * 0.6)).translateY(base));
  return g;
};

const bookshelf: Builder = (c) => {
  const { w, d, h } = c;
  const m = wood(c.color);
  const side = 0.025;
  const g = assemble(slab(side, h, d, m).at(-w / 2 + side / 2, 0, 0), slab(side, h, d, m).at(w / 2 - side / 2, 0, 0), slab(w, h, 0.01, m).at(0, 0, -d / 2 + 0.005));
  const shelves = 5;
  const palette = ["#7b4b3a", "#3f5d7a", "#c9a86a", "#5f7a54", "#8a8f99", "#a25a4f"];
  for (let i = 0; i <= shelves; i++) {
    const y = (h - 0.02) * (i / shelves);
    g.add(slab(w - side * 2, 0.02, d - 0.01, m).at(0, y, 0.005));
    if (i === shelves) break;
    // a run of books of varied height on each shelf
    let x = -w / 2 + side + 0.02;
    let k = i * 3;
    while (x < w / 2 - side - 0.06) {
      const bw = 0.025 + ((k * 7) % 4) * 0.008;
      const bh = (h / shelves) * (0.55 + ((k * 5) % 4) * 0.08);
      g.add(slab(bw, bh, d * 0.7, surface(palette[k % palette.length], "matte")).at(x + bw / 2, y + 0.02, 0));
      x += bw + 0.004;
      k++;
    }
  }
  return g;
};

const rug: Builder = (c) => assemble(slab(c.w, 0.012, c.d, fabric(c.color), false), slab(c.w - 0.16, 0.014, c.d - 0.16, fabric("#a99178"), false));

// ---------------------------------------------------------------------------
// Bedroom
// ---------------------------------------------------------------------------

function bed(c: CatalogEntry, pillows: number): THREE.Group {
  const { w, d } = c;
  const frame = wood("#8a6d50");
  const g = assemble(
    legs(w, d, 0.12, frame, 0.04, 0.025),
    slab(w, 0.18, d, frame).at(0, 0.12, 0),
    slab(w, 0.95, 0.06, frame).at(0, 0.12, -d / 2 + 0.03), // headboard
    pillow(w - 0.04, 0.2, d - 0.1, white).at(0, 0.3, 0.03), // mattress
    pillow(w - 0.02, 0.05, d * 0.62, fabric(c.color)).at(0, 0.52, d * 0.17), // duvet
  );
  const pw = (w - 0.12) / pillows;
  for (let i = 0; i < pillows; i++) g.add(pillow(pw - 0.04, 0.1, 0.36, white).at(-w / 2 + 0.06 + pw * (i + 0.5), 0.52, -d / 2 + 0.28));
  return g;
}

const bedDouble: Builder = (c) => bed(c, 2);
const bedSingle: Builder = (c) => bed(c, 1);

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

function counter(c: CatalogEntry): THREE.Group {
  const doors = Math.max(1, Math.round(c.w / 0.6));
  const g = cabinet({ ...c, h: c.h - 0.04, color: "#e9e6e0" }, doors, { vertical: true, plinth: 0.1 });
  g.add(slab(c.w + 0.02, 0.04, c.d + 0.02, surface("#4b4a48", "gloss")).at(0, c.h - 0.04, 0.01));
  return g;
}

const kitchenCounter: Builder = counter;
const counterUnit: Builder = counter;

const kitchenSinkUnit: Builder = (c) => {
  const g = counter(c);
  g.add(slab(0.5, 0.012, 0.38, metal("#c5c9cc")).at(0, c.h, 0.03));
  g.add(post(0.012, 0.28, metal("#c5c9cc")).at(0, c.h, -c.d / 2 + 0.08));
  return g;
};

const kitchenHobUnit: Builder = (c) => {
  const g = counter(c);
  g.add(slab(0.6, 0.01, 0.5, dark).at(0, c.h, 0.02));
  for (const [x, z] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.14], [0.14, 0.14]]) g.add(post(0.07, 0.012, metal("#555"), 0.07, 24).at(x, c.h + 0.006, z));
  g.add(slab(0.58, 0.012, 0.004, metal("#999")).at(0, c.h * 0.55, c.d / 2 + 0.002)); // oven door line
  return g;
};

const fridge: Builder = (c) => {
  const { w, d, h } = c;
  const body = surface("#dde1e5", "gloss");
  return assemble(
    slab(w, h, d, body),
    slab(w - 0.02, 0.006, 0.004, dark).at(0, h * 0.62, d / 2),
    slab(0.02, h * 0.3, 0.03, handle).at(w / 2 - 0.06, h * 0.66, d / 2 + 0.015),
    slab(0.02, h * 0.22, 0.03, handle).at(w / 2 - 0.06, h * 0.36, d / 2 + 0.015),
  );
};

// ---------------------------------------------------------------------------
// Bathroom
// ---------------------------------------------------------------------------

const bathtub: Builder = (c) => {
  const { w, d, h } = c;
  return assemble(slab(w, h, d, white), slab(w - 0.14, 0.02, d - 0.14, waterMaterial, false).at(0, h - 0.1, 0), post(0.015, 0.2, metal("#c5c9cc")).at(-w / 2 + 0.12, h, -d / 2 + 0.06));
};

const cornerBath: Builder = (c) => {
  const geo = new THREE.CylinderGeometry(c.w, c.w, c.h, 32, 1, false, 0, Math.PI / 2);
  geo.translate(0, c.h / 2, 0);
  geo.translate(-c.w / 2, 0, -c.d / 2); // quarter disc fills the footprint from the back-left corner
  const tub = new THREE.Mesh(geo, white);
  tub.castShadow = tub.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(c.w - 0.1, c.w - 0.1, 0.02, 32, 1, false, 0, Math.PI / 2).translate(-c.w / 2, c.h - 0.08, -c.d / 2), waterMaterial);
  return assemble(tub, water);
};

const shower: Builder = (c) => {
  const { w, d, h } = c;
  const glass = surface("#cfe1ea", "gloss");
  glass.transparent = true;
  glass.opacity = 0.3;
  return assemble(
    slab(w, 0.06, d, white),
    slab(w, h - 0.06, 0.01, glass, false).at(0, 0.06, d / 2 - 0.005),
    slab(0.01, h - 0.06, d, glass, false).at(w / 2 - 0.005, 0.06, 0),
    post(0.012, h - 0.2, metal("#c5c9cc")).at(-w / 2 + 0.1, 0.06, -d / 2 + 0.08),
    blob(0.08, 0.02, 0.08, metal("#c5c9cc")).at(-w / 2 + 0.2, h - 0.2, -d / 2 + 0.12),
  );
};

const toilet: Builder = (c) => {
  const { w, d } = c;
  return assemble(
    post(w * 0.42, 0.38, white, w * 0.32, 24).at(0, 0, d * 0.12),
    slab(w * 0.95, 0.03, d * 0.55, white).at(0, 0.38, d * 0.12),
    slab(w, 0.38, 0.18, white).at(0, 0.4, -d / 2 + 0.09), // cistern
  );
};

const sink: Builder = (c) => {
  const { w, d, h } = c;
  return assemble(post(0.06, h - 0.15, white, 0.09).at(0, 0, -d * 0.1), slab(w, 0.15, d, white).at(0, h - 0.15, 0), slab(w - 0.12, 0.01, d - 0.14, waterMaterial, false).at(0, h - 0.02, 0.02));
};

const towelRail: Builder = (c) => {
  const m = metal("#c5c9cc");
  const g = assemble(post(0.012, c.h, m).at(-c.w / 2 + 0.02, 0, 0), post(0.012, c.h, m).at(c.w / 2 - 0.02, 0, 0));
  for (let i = 1; i <= 5; i++) g.add(slab(c.w, 0.015, 0.015, m).at(0, c.h * (0.2 + i * 0.14), 0));
  g.add(slab(c.w - 0.08, 0.5, 0.02, fabric("#e9e2d6")).at(0, c.h * 0.45, 0.015));
  return g;
};

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------

const plant: Builder = (c) => {
  const pot = post(c.w * 0.32, c.h * 0.3, surface("#b5734e", "matte"), c.w * 0.24, 20);
  const g = assemble(pot);
  const clumps = [
    [0, 0.3, 0, 0.42],
    [-0.08, 0.5, 0.05, 0.32],
    [0.07, 0.55, -0.05, 0.3],
    [0, 0.72, 0, 0.26],
  ];
  for (const [x, y, z, r] of clumps) g.add(blob(c.w * r, c.h * 0.16, c.w * r, leafMaterial).at(x * c.w, c.h * y, z * c.w));
  return g;
};

// ---------------------------------------------------------------------------
// Stairs: you step on at the front (+z) and climb towards the back (−z), up the full height
// ---------------------------------------------------------------------------

const tread = () => wood("#b48a5c");
const steel = surface("#2c2f33", "metal");
const glassRail = new THREE.MeshPhysicalMaterial({ color: "#dfeef4", roughness: 0.05, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
glassRail.userData.shared = true;

/** A straight flight: oak treads on two steel stringers, a glass balustrade on the open side. */
function straightStair(c: CatalogEntry): THREE.Group {
  const { w, d, h } = c;
  const steps = Math.max(3, Math.round(h / 0.18));
  const rise = h / steps;
  const going = d / steps;
  const g = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    // each tread at its height, a little deeper than its going so they read as one flight
    g.add(slab(w - 0.04, 0.04, going + 0.03, tread()).at(0, (i + 1) * rise - 0.04, d / 2 - (i + 0.5) * going));
  }
  // stringers: sloped steel plates along both sides
  for (const side of [-1, 1]) {
    const plate = slab(0.03, 0.26, Math.hypot(d, h), steel).at(side * (w / 2 - 0.015), 0, 0);
    plate.geometry.translate(0, -0.13, 0);
    plate.rotation.x = Math.atan2(h, d);
    plate.position.y = h / 2;
    g.add(plate);
  }
  // a glass balustrade 0.9 m above the pitch line, on the right-hand side going up
  const rail = slab(0.012, 0.9, Math.hypot(d, h), glassRail, false).at(w / 2 - 0.02, 0, 0);
  rail.rotation.x = Math.atan2(h, d);
  rail.position.y = h / 2 + 0.05;
  g.add(rail);
  return g;
}

/** A spiral stair: wedge treads turning round a steel column, with a handrail post at the top. */
function spiralStair(c: CatalogEntry): THREE.Group {
  const { w, h } = c;
  const r = w / 2;
  const steps = Math.max(8, Math.round(h / 0.2));
  const rise = h / steps;
  const turn = (Math.PI * 1.75) / steps; // most of a full turn, so the top lands beside the start
  const g = assemble(post(0.06, h + 0.9, steel).at(0, 0, 0));
  for (let i = 0; i < steps; i++) {
    const wedge = new THREE.CylinderGeometry(r, r, 0.04, 12, 1, false, 0, turn * 1.15);
    wedge.translate(0, (i + 1) * rise - 0.02, 0);
    const m = new THREE.Mesh(wedge, tread());
    m.castShadow = m.receiveShadow = true;
    // start at the front (+z) and turn as it climbs
    m.rotation.y = i * turn;
    g.add(m);
    // a baluster at the outer end of each tread
    const a = i * turn + turn / 2;
    g.add(post(0.012, 0.9, steel).at(Math.sin(a) * (r - 0.04), (i + 1) * rise, Math.cos(a) * (r - 0.04)));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Railings, facade and structure
// ---------------------------------------------------------------------------

const frameDark = surface("#2c2f33", "metal");
const stone = surface("#e9e6df", "matte");

/** A frameless glass balustrade: a pane in a slim steel shoe, with a steel handrail. */
const railingGlass: Builder = (c) =>
  assemble(slab(c.w, 0.08, 0.08, frameDark).at(0, 0, 0), slab(c.w - 0.02, c.h - 0.1, 0.014, glassRail, false).at(0, 0.08, 0), slab(c.w, 0.04, 0.06, frameDark).at(0, c.h - 0.04, 0));

/** A steel railing: posts every metre or so, a top rail and thin bars between. */
const railingSteel: Builder = (c) => {
  const g = assemble(slab(c.w, 0.04, 0.05, frameDark).at(0, c.h - 0.04, 0), slab(c.w, 0.02, 0.03, frameDark).at(0, 0.08, 0));
  const posts = Math.max(2, Math.round(c.w / 1.1) + 1);
  for (let i = 0; i < posts; i++) g.add(slab(0.04, c.h - 0.04, 0.04, frameDark).at(-c.w / 2 + 0.02 + (i * (c.w - 0.04)) / (posts - 1), 0, 0));
  const bars = Math.round(c.w / 0.12);
  for (let i = 1; i < bars; i++) g.add(post(0.008, c.h - 0.14, frameDark).at(-c.w / 2 + (i * c.w) / bars, 0.1, 0));
  return g;
};

/** Floor-to-ceiling glazing: tall panes between slim dark frames. */
const glassWall: Builder = (c) => {
  const g = assemble(slab(c.w, 0.05, c.d, frameDark).at(0, 0, 0), slab(c.w, 0.05, c.d, frameDark).at(0, c.h - 0.05, 0));
  const panes = Math.max(1, Math.round(c.w / 1.2));
  const pw = c.w / panes;
  for (let i = 0; i <= panes; i++) g.add(slab(0.05, c.h, c.d, frameDark).at(-c.w / 2 + i * pw, 0, 0));
  g.add(slab(c.w - 0.04, c.h - 0.1, 0.012, glassRail, false).at(0, 0.05, 0));
  return g;
};

/** Vertical timber battens on a dark backing, as modern facades are clad. */
const cladding: Builder = (c) => {
  const g = assemble(slab(c.w, c.h, 0.02, frameDark).at(0, 0, -c.d / 2 + 0.01));
  const battens = Math.round(c.w / 0.09);
  for (let i = 0; i < battens; i++) g.add(slab(0.05, c.h, c.d - 0.02, wood(c.color)).at(-c.w / 2 + 0.045 + (i * (c.w - 0.09)) / Math.max(1, battens - 1), 0, 0.01));
  return g;
};

const column: Builder = (c) => assemble(slab(c.w, c.h, c.d, stone));

/** A pergola: four dark posts, two beams and slats overhead for dappled shade. */
const pergola: Builder = (c) => {
  const s = 0.12;
  const g = new THREE.Group();
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(slab(s, c.h - 0.2, s, frameDark).at(x * (c.w / 2 - s / 2), 0, z * (c.d / 2 - s / 2)));
  for (const z of [-1, 1]) g.add(slab(c.w + 0.3, 0.2, 0.08, frameDark).at(0, c.h - 0.2, z * (c.d / 2 - s / 2)));
  const slats = Math.round(c.w / 0.25);
  for (let i = 0; i <= slats; i++) g.add(slab(0.05, 0.12, c.d + 0.3, frameDark).at(-c.w / 2 + (i * c.w) / slats, c.h - 0.12, 0));
  return g;
};

// ---------------------------------------------------------------------------
// Outdoor and pool
// ---------------------------------------------------------------------------

const poolTile = surface("#6fb4d3", "gloss");
const coping = surface("#ece6da", "matte");
const outdoorCushion = surface("#f2f0ea", "fabric");
const greenery = surface("#5b8a4a", "matte");
const hedgeGreen = surface("#5f7f4c", "matte");

/** A pool: water in a tiled basin, with a stone coping all round. */
function poolOf(c: CatalogEntry, infinity: boolean): THREE.Group {
  const lip = 0.3;
  const g = assemble(slab(c.w - lip, 0.02, c.d - lip, poolTile, false).at(0, 0, 0), slab(c.w - lip, 0.01, c.d - lip, waterMaterial, false).at(0, c.h - 0.06, 0));
  // coping on every side, except the far end of an infinity pool, where the water runs over a glass edge
  g.add(slab(c.w, c.h, lip / 2, coping, false).at(0, 0, c.d / 2 - lip / 4));
  g.add(slab(lip / 2, c.h, c.d, coping, false).at(-c.w / 2 + lip / 4, 0, 0));
  g.add(slab(lip / 2, c.h, c.d, coping, false).at(c.w / 2 - lip / 4, 0, 0));
  if (infinity) g.add(slab(c.w - lip, c.h - 0.04, 0.02, glassRail, false).at(0, 0, -c.d / 2 + lip / 4));
  else g.add(slab(c.w, c.h, lip / 2, coping, false).at(0, 0, -c.d / 2 + lip / 4));
  return g;
}

const paving: Builder = (c) => assemble(slab(c.w, c.h, c.d, surface(c.color, "matte"), false));

/** A timber deck: boards across its width, with gaps between. */
const deck: Builder = (c) => {
  const g = new THREE.Group();
  const boards = Math.round(c.d / 0.15);
  for (let i = 0; i < boards; i++) g.add(slab(c.w, c.h, 0.14, wood(c.color), false).at(0, 0, -c.d / 2 + 0.075 + (i * (c.d - 0.15)) / Math.max(1, boards - 1)));
  return g;
};

/** A sun lounger: a slim cushion on a dark frame, its back raised towards the head. */
const lounger: Builder = (c) => {
  const g = assemble(slab(c.w, 0.05, c.d, frameDark).at(0, 0.2, 0), slab(c.w * 0.94, 0.07, c.d * 0.62, outdoorCushion).at(0, 0.25, c.d * 0.17));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(post(0.02, 0.2, frameDark).at(sx * (c.w / 2 - 0.05), 0, sz * (c.d / 2 - 0.08)));
  const back = slab(c.w * 0.94, 0.07, c.d * 0.36, outdoorCushion).at(0, 0.25, -c.d / 2 + c.d * 0.18);
  back.rotation.x = -0.6;
  g.add(back);
  return g;
};

const outdoorSofa: Builder = (c) => {
  const body = surface(c.color, "matte");
  const arm = 0.12;
  return assemble(
    slab(c.w, 0.32, c.d, body).at(0, 0.06, 0),
    slab(c.w - arm * 2, 0.12, c.d - 0.2, outdoorCushion).at(0, 0.38, 0.06),
    slab(c.w, c.h - 0.06, 0.16, body).at(0, 0.06, -c.d / 2 + 0.08),
    slab(arm, 0.5, c.d, body).at(-c.w / 2 + arm / 2, 0.06, 0),
    slab(arm, 0.5, c.d, body).at(c.w / 2 - arm / 2, 0.06, 0),
  );
};

const outdoorDining: Builder = (c) => {
  const g = assemble(slab(c.w, 0.04, c.d, frameDark).at(0, c.h - 0.04, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(slab(0.05, c.h - 0.04, 0.05, frameDark).at(sx * (c.w / 2 - 0.1), 0, sz * (c.d / 2 - 0.1)));
  // a chair at each place along the long sides
  const places = Math.max(2, Math.floor(c.w / 0.65));
  for (let i = 0; i < places; i++)
    for (const side of [-1, 1]) {
      const x = -c.w / 2 + (c.w / places) * (i + 0.5);
      g.add(slab(0.45, 0.04, 0.45, outdoorCushion).at(x, 0.44, side * (c.d / 2 + 0.3)));
      g.add(slab(0.45, 0.42, 0.04, frameDark).at(x, 0.44, side * (c.d / 2 + 0.5)));
      for (const lx of [-1, 1]) for (const lz of [-1, 1]) g.add(post(0.012, 0.44, frameDark).at(x + lx * 0.2, 0, side * (c.d / 2 + 0.3) + lz * 0.2));
    }
  return g;
};

const parasol: Builder = (c) => {
  const canopy = new THREE.ConeGeometry(c.w / 2, 0.45, 8, 1, true);
  canopy.translate(0, c.h - 0.22, 0);
  // its own material: the canopy is seen from below, so both faces are drawn
  const shade = new THREE.Mesh(canopy, new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.95, side: THREE.DoubleSide }));
  shade.castShadow = true;
  return assemble(slab(0.5, 0.06, 0.5, frameDark).at(0, 0, 0), post(0.025, c.h - 0.2, frameDark).at(0, 0, 0), shade);
};

const firePit: Builder = (c) => {
  const bowl = post(c.w / 2, c.h, surface(c.color, "matte"), c.w / 2 - 0.08, 24);
  const glow = new THREE.MeshStandardMaterial({ color: "#3a2a20", emissive: "#ff8a3a", emissiveIntensity: 0.8 });
  return assemble(bowl, post(c.w / 2 - 0.12, 0.02, glow).at(0, c.h - 0.02, 0));
};

const planter: Builder = (c) => assemble(slab(c.w, c.h * 0.7, c.d, surface("#3b3d40", "matte")), blob(c.w / 2 - 0.05, c.h * 0.45, c.d / 2 - 0.03, greenery).at(0, c.h * 0.55, 0));

const hedge: Builder = (c) => assemble(pillow(c.w, c.h, c.d, hedgeGreen));

/** A tree: a trunk and a crown of overlapping rounded masses. */
const tree: Builder = (c) => {
  const r = c.w / 2;
  const trunk = surface("#6b5241", "wood");
  return assemble(
    post(0.12, c.h * 0.45, trunk, 0.16).at(0, 0, 0),
    blob(r, c.h * 0.32, r, greenery).at(0, c.h * 0.38, 0),
    blob(r * 0.7, c.h * 0.26, r * 0.7, surface("#4b7740", "matte")).at(r * 0.25, c.h * 0.6, -r * 0.15),
    blob(r * 0.6, c.h * 0.22, r * 0.6, greenery).at(-r * 0.3, c.h * 0.55, r * 0.2),
  );
};

// ---------------------------------------------------------------------------
// The finer rooms of a large house
// ---------------------------------------------------------------------------

/** A kitchen island: cabinets on one side, an overhanging stone top with stools on the other. */
const kitchenIsland: Builder = (c) => {
  const top = surface("#f1efea", "gloss");
  const g = cabinet({ ...c, h: c.h - 0.04, d: c.d - 0.3 }, 4, { plinth: 0.1 });
  g.position.z = -0.15;
  const out = assemble(g, slab(c.w, 0.04, c.d, top).at(0, c.h - 0.04, 0));
  for (let i = 0; i < 3; i++) out.add(barStool({ ...c, w: 0.42, d: 0.42, h: 0.66 }).translateX(-c.w / 3 + (i * c.w) / 3).translateZ(c.d / 2 + 0.22));
  return out;
};

const barCounter: Builder = (c) => {
  const top = surface("#2b2522", "gloss");
  const g = cabinet({ ...c, h: c.h - 0.05 }, 3, { plinth: 0.08 });
  g.add(slab(c.w + 0.1, 0.05, c.d + 0.2, top).at(0, c.h - 0.05, 0.1));
  // bottles on a shelf behind
  for (let i = 0; i < 6; i++) g.add(post(0.035, 0.28, surface(["#2f5d3a", "#6e2f2a", "#c7a55a"][i % 3], "gloss")).at(-c.w / 2 + 0.25 + i * 0.28, c.h, -c.d / 2 + 0.12));
  return g;
};

function barStool(c: CatalogEntry): THREE.Group {
  return assemble(post(0.2, 0.05, surface("#2f2d2b", "fabric")).at(0, c.h - 0.05, 0), post(0.025, c.h - 0.05, frameDark).at(0, 0, 0), post(0.18, 0.02, frameDark).at(0, 0, 0), post(0.16, 0.015, frameDark).at(0, 0.3, 0));
}

const doubleVanity: Builder = (c) => {
  const g = cabinet({ ...c, h: c.h - 0.05 }, 4, { plinth: 0.1 });
  g.add(slab(c.w, 0.04, c.d, surface("#f1efea", "gloss")).at(0, c.h - 0.05, 0));
  for (const x of [-c.w / 4, c.w / 4]) {
    g.add(slab(0.42, 0.01, 0.3, waterMaterial, false).at(x, c.h - 0.012, 0.02));
    g.add(post(0.012, 0.2, metal("#c5c9cc")).at(x, c.h, -c.d / 2 + 0.06));
    g.add(slab(0.6, 0.8, 0.02, surface("#d9e4ea", "gloss")).at(x, c.h + 0.3, -c.d / 2 + 0.01)); // mirror
  }
  return g;
};

/** A freestanding bath: a rounded tub on the floor with a floor-standing tap. */
const freestandingTub: Builder = (c) => {
  const tub = pillow(c.w, c.h, c.d, white);
  const water = slab(c.w - 0.2, 0.01, c.d - 0.2, waterMaterial, false).at(0, c.h - 0.1, 0);
  return assemble(tub, water, post(0.015, c.h + 0.25, metal("#c5c9cc")).at(c.w / 2 + 0.12, 0, 0));
};

/** Open walk-in shelving: hanging rails, shelves and drawers along one wall. */
const walkInWardrobe: Builder = (c) => {
  const body = wood(c.color);
  const g = assemble(slab(c.w, c.h, 0.03, body).at(0, 0, -c.d / 2 + 0.015));
  const bays = Math.max(2, Math.round(c.w / 0.8));
  for (let i = 0; i <= bays; i++) g.add(slab(0.03, c.h, c.d, body).at(-c.w / 2 + 0.015 + (i * (c.w - 0.03)) / bays, 0, 0));
  for (let i = 0; i < bays; i++) {
    const x = -c.w / 2 + (c.w / bays) * (i + 0.5);
    g.add(slab(c.w / bays - 0.04, 0.03, c.d - 0.04, body).at(x, c.h - 0.35, 0));
    g.add(post(0.012, c.w / bays - 0.06, metal("#b9b3a8")).turn(Math.PI / 2, "z").at(x + (c.w / bays - 0.06) / 2, c.h - 0.45, 0));
    // clothes on the rail, as soft blocks
    g.add(slab(c.w / bays - 0.14, 0.9, c.d * 0.6, fabric(["#5a6b80", "#c9c2b6", "#2f3134"][i % 3])).at(x, c.h - 1.4, 0));
    g.add(slab(c.w / bays - 0.04, 0.5, c.d - 0.04, body).at(x, 0, 0)); // drawers
  }
  return g;
};

const fireplace: Builder = (c) => {
  const glow = new THREE.MeshStandardMaterial({ color: "#2a1d16", emissive: "#ff7a2e", emissiveIntensity: 0.9 });
  return assemble(
    slab(c.w, c.h, c.d, surface(c.color, "matte")),
    slab(c.w * 0.6, c.h * 0.32, 0.02, screenMaterial).at(0, c.h * 0.25, c.d / 2),
    slab(c.w * 0.52, 0.05, 0.02, glow).at(0, c.h * 0.3, c.d / 2 + 0.005),
    slab(c.w + 0.1, 0.06, c.d + 0.06, stone).at(0, c.h, 0),
  );
};

/** A grand piano: a curved black case on three legs, its lid propped open. */
const grandPiano: Builder = (c) => {
  const black = surface("#111111", "gloss");
  const shape = new THREE.Shape();
  const w = c.w / 2;
  const d = c.d / 2;
  shape.moveTo(-w, d);
  shape.lineTo(w, d);
  shape.lineTo(w, -d * 0.2);
  shape.quadraticCurveTo(w, -d, 0, -d);
  shape.quadraticCurveTo(-w * 0.4, -d, -w * 0.5, -d * 0.4);
  shape.quadraticCurveTo(-w, d * 0.2, -w, d);
  const caseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  caseGeo.rotateX(-Math.PI / 2);
  caseGeo.translate(0, c.h - 0.35, 0);
  const caseMesh = new THREE.Mesh(caseGeo, black);
  caseMesh.castShadow = true;
  const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }).rotateX(-Math.PI / 2), black);
  lid.position.set(0, c.h - 0.05, 0);
  lid.rotation.z = 0.5;
  const g = assemble(caseMesh, lid, slab(c.w * 0.9, 0.05, 0.25, white).at(0, c.h - 0.3, d - 0.05));
  for (const [x, z] of [[-w * 0.8, d * 0.8], [w * 0.8, d * 0.8], [0, -d * 0.6]]) g.add(post(0.04, c.h - 0.35, black).at(x, 0, z));
  return g;
};

const cinemaScreen: Builder = (c) => assemble(slab(c.w, c.h - 0.5, 0.03, white).at(0, 0.5, 0), slab(c.w + 0.1, 0.06, c.d, frameDark).at(0, c.h - 0.06, 0), slab(c.w, 0.5, c.d, frameDark).at(0, 0, 0));

/** A row of cinema recliners with wide arms between the seats. */
const cinemaRecliners: Builder = (c) => {
  const leather = surface(c.color, "fabric");
  const seats = Math.max(2, Math.round(c.w / 0.9));
  const sw = c.w / seats;
  const g = new THREE.Group();
  for (let i = 0; i < seats; i++) {
    const x = -c.w / 2 + sw * (i + 0.5);
    g.add(slab(sw - 0.16, 0.42, c.d * 0.75, leather).at(x, 0.05, 0.08));
    g.add(slab(sw - 0.16, c.h - 0.05, 0.22, leather).at(x, 0.05, -c.d / 2 + 0.11));
  }
  for (let i = 0; i <= seats; i++) g.add(slab(0.14, 0.62, c.d, leather).at(-c.w / 2 + 0.07 + (i * (c.w - 0.14)) / seats, 0.05, 0));
  return g;
};

const BUILDERS: Record<string, Builder> = {
  stair_straight: straightStair,
  stair_spiral: spiralStair,
  railing_glass: railingGlass,
  railing_steel: railingSteel,
  glass_wall: glassWall,
  cladding,
  column,
  pergola,
  pool: (c) => poolOf(c, false),
  pool_infinity: (c) => poolOf(c, true),
  stone_terrace: paving,
  timber_deck: deck,
  sun_lounger: lounger,
  outdoor_sofa: outdoorSofa,
  outdoor_dining: outdoorDining,
  parasol,
  fire_pit: firePit,
  planter,
  hedge,
  tree,
  kitchen_island: kitchenIsland,
  bar_counter: barCounter,
  bar_stool: barStool,
  double_vanity: doubleVanity,
  freestanding_tub: freestandingTub,
  walk_in_wardrobe: walkInWardrobe,
  fireplace,
  grand_piano: grandPiano,
  cinema_screen: cinemaScreen,
  cinema_recliners: cinemaRecliners,
  sofa,
  sofa_3: sofa3,
  armchair,
  coffee_table: coffeeTable,
  side_table: sideTable,
  sideboard,
  tv_sideboard: tvSideboard,
  tv_stand: tvStand,
  bookshelf,
  rug,
  bed_double: bedDouble,
  bed_single: bedSingle,
  nightstand,
  wardrobe,
  desk,
  office_chair: officeChair,
  dining_table: diningTable,
  dining_table_oval: diningTableOval,
  dining_chair: diningChair,
  kitchen_counter: kitchenCounter,
  counter_unit: counterUnit,
  kitchen_sink_unit: kitchenSinkUnit,
  kitchen_hob_unit: kitchenHobUnit,
  fridge,
  bathtub,
  corner_bath: cornerBath,
  shower,
  toilet,
  sink,
  towel_rail: towelRail,
  plant,
};

/**
 * The 3D model for a catalog kind, or a plain block for kinds without a dedicated model. Plants
 * are the real ones once they have loaded (see plants.ts); `seed` picks which tree, and how a
 * hedge or planter is planted, so the same piece always looks the same.
 */
export function buildFurniture(kind: string, seed = 0): THREE.Group | null {
  const c = catalogByKind(kind);
  if (!c) return null;
  const real = realPlant(kind, c, seed);
  if (real) {
    real.name = kind;
    return real;
  }
  const build = BUILDERS[kind];
  const g = build ? build(c) : assemble(slab(c.w, c.h, c.d, surface(c.color, "matte")));
  g.name = kind;
  return g;
}

