/**
 * Procedural furniture. Each model fills its catalog footprint (w along x, d along z, h tall),
 * stands on y = 0 and faces +z, which is the direction the item's `rotation` points to.
 */

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

const BUILDERS: Record<string, Builder> = {
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

/** The 3D model for a catalog kind, or a plain block for kinds without a dedicated model. */
export function buildFurniture(kind: string): THREE.Group | null {
  const c = catalogByKind(kind);
  if (!c) return null;
  const build = BUILDERS[kind];
  const g = build ? build(c) : assemble(slab(c.w, c.h, c.d, surface(c.color, "matte")));
  g.name = kind;
  return g;
}

