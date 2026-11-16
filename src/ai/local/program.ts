/**
 * From a plain-language brief to a room program to a layout.
 *
 *   "a three bedroom house with two bathrooms, a study and a separate kitchen, about 120 m²"
 *     → Brief { bedrooms: 3, bathrooms: 2, study: true, openKitchen: false, targetArea: 120 }
 *     → Program (labelled rooms with target areas)
 *     → LayoutSpec for the deterministic layout builder (model/layout.ts)
 *
 * The plan type is a two-band house: a private band (bedrooms, bathrooms) along the north,
 * a hall running the full width, and a living band along the south. Every room opens onto
 * the hall, so every room is reachable from the entrance by construction. Areas are
 * concept-design defaults that scale to the requested total.
 */

import type { LayoutSpec } from "../../model/layout";
import type { PlanModel, Room } from "../../model/types";
import { roomTypes } from "../../model/analysis";

export interface Brief {
  bedrooms: number;
  bathrooms: number;
  ensuite: boolean;
  study: boolean;
  dining: boolean;
  openKitchen: boolean;
  utility: boolean;
  /** clear floor area to aim for, m² */
  targetArea: number | null;
  name: string | null;
  /** per-room overrides keyed by program alias (bed1, ensuite, bath1, living, kitchen, …) */
  areas?: Record<string, number>;
  labels?: Record<string, string>;
}

const WORDS: Record<string, number> = {
  zero: 0, no: 0, one: 1, a: 1, an: 1, single: 1, two: 2, double: 2, three: 3, four: 4, five: 5, six: 6,
};

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return WORDS[s.toLowerCase()] ?? null;
};

const COUNT = "(\\d+|zero|no|one|a|an|single|two|double|three|four|five|six)";

/** True when the text reads like a request for a new home rather than an edit. */
export function looksLikeBrief(text: string): boolean {
  const t = text.toLowerCase();
  const verb = /\b(design|create|make|build|generate|draw|plan|start|give me|i want|i need|new)\b/.test(t);
  const subject = /\b(house|home|apartment|flat|condo|bungalow|cottage|villa|studio|layout|floor ?plan|\d\s*bhk|bed(room)?s?)\b/.test(t);
  const edit = /\b(add|put|place|move|rotate|remove|delete|rename|fix|repair|how|what|which|why|where|is there|are there)\b|\?/.test(t);
  return (verb && subject && !/\b(rename|remove|delete)\b/.test(t)) || /\b\d\s*bhk\b/.test(t) || (subject && !edit && t.split(/\s+/).length <= 14);
}

export function parseBrief(text: string): Brief {
  const t = text.toLowerCase().replace(/[–—]/g, "-");
  const bhk = t.match(/\b(\d)\s*-?\s*bhk\b/);
  const bedM = t.match(new RegExp(`\\b${COUNT}[ -]?(?:bed(?:room)?s?|br)\\b`));
  let bedrooms = num(bhk?.[1]) ?? num(bedM?.[1]) ?? (/\bstudio\b/.test(t) ? 0 : 2);
  bedrooms = Math.max(0, Math.min(6, bedrooms));

  const bathM = t.match(new RegExp(`\\b${COUNT}[ -]?(?:bath(?:room)?s?|wcs?|toilets?)\\b`));
  let bathrooms = num(bathM?.[1]) ?? (bedrooms >= 3 ? 2 : 1);
  bathrooms = Math.max(1, Math.min(4, bathrooms));

  let targetArea: number | null = null;
  const m2 = t.match(/(\d{2,4}(?:\.\d+)?)\s*(?:m2|m²|sqm|sq\.? ?m(?:eters?|etres?)?|square met(?:er|re)s?)(?![a-z])/);
  const ft2 = t.match(/(\d{3,5})\s*(?:ft2|ft²|sq\.? ?ft|sqft|square f(?:ee|oo)t)(?![a-z])/);
  if (m2) targetArea = Number(m2[1]);
  else if (ft2) targetArea = Math.round(Number(ft2[1]) * 0.092903);
  if (targetArea !== null) targetArea = Math.max(20, Math.min(400, targetArea));

  const named = text.match(/\b(?:called|named)\s+["“']?([^"”'.,]{2,40})/i);

  return {
    bedrooms,
    bathrooms,
    // "no en-suite" names one too, so the refusal has to be read before the word itself
    ensuite: !/\b(no|without( an?)?) en-?suite\b/.test(t) && (/\ben-?suite\b/.test(t) || (bathrooms >= 2 && bedrooms >= 2)),
    study: /\b(study|office|home office|work ?space|den)\b/.test(t),
    dining: /\b(dining|separate kitchen|closed kitchen)\b/.test(t) || bedrooms >= 3,
    openKitchen: !/\b(separate|closed|enclosed) kitchen\b/.test(t),
    utility: /\b(utility|laundry|storage|store ?room)\b/.test(t) || bedrooms >= 4,
    targetArea,
    name: named ? named[1].trim() : null,
  };
}

interface ProgramRoom {
  as: string;
  label: string;
  area: number;
  band: "private" | "public";
  floor: "oak" | "tile" | "carpet";
  /** minimum width along the band, metres */
  minW: number;
  window: { width: number; sill?: number; height?: number } | null;
  /** room it opens into, default the hall */
  via?: string;
}

export function programFor(b: Brief): ProgramRoom[] {
  return baseProgram(b).map((r) => ({
    ...r,
    area: b.areas?.[r.as] ?? r.area,
    label: b.labels?.[r.as] ?? r.label,
    // a resized room needs a matching minimum width so its area is honoured
    minW: b.areas?.[r.as] ? Math.min(r.minW, Math.sqrt(b.areas[r.as])) : r.minW,
  }));
}

function baseProgram(b: Brief): ProgramRoom[] {
  const rooms: ProgramRoom[] = [];
  const bedLabel = (i: number) => (b.bedrooms === 1 ? "Bedroom" : i === 0 ? "Main bedroom" : `Bedroom ${i + 1}`);
  const bath = (as: string, label: string, area: number, via?: string): ProgramRoom => ({
    as, label, area, band: "private", floor: "tile", minW: 1.7, window: { width: 0.6, sill: 1.3, height: 0.8 }, via,
  });

  for (let i = 0; i < b.bedrooms; i++) {
    rooms.push({ as: `bed${i + 1}`, label: bedLabel(i), area: i === 0 ? 13 : 10.5, band: "private", floor: "carpet", minW: 2.9, window: { width: 1.4 } });
    if (i === 0 && b.ensuite && b.bathrooms >= 2) rooms.push(bath("ensuite", "En-suite", 4, "bed1"));
  }
  const shared = b.bathrooms - (b.ensuite && b.bathrooms >= 2 && b.bedrooms >= 1 ? 1 : 0);
  for (let i = 0; i < shared; i++) rooms.push(bath(`bath${i + 1}`, shared > 1 ? `Bathroom ${i + 1}` : "Bathroom", 5));
  if (b.utility) rooms.push({ as: "utility", label: "Utility", area: 4, band: "private", floor: "tile", minW: 1.6, window: null });

  const livingArea = 18 + 2.5 * b.bedrooms;
  // dining sits right after living so the two can share a door
  rooms.push(
    b.openKitchen
      ? { as: "living", label: "Living & Kitchen", area: livingArea + 9, band: "public", floor: "oak", minW: 5, window: { width: 2.4, height: 1.4 } }
      : { as: "living", label: "Living room", area: livingArea, band: "public", floor: "oak", minW: 3.8, window: { width: 2.2, height: 1.4 } },
  );
  if (b.dining) rooms.push({ as: "dining", label: "Dining", area: 10, band: "public", floor: "oak", minW: 3, window: { width: 1.4 }, via: "living" });
  if (!b.openKitchen) rooms.push({ as: "kitchen", label: "Kitchen", area: 9, band: "public", floor: "tile", minW: 2.6, window: { width: 1.2 } });
  if (b.study) rooms.push({ as: "study", label: "Study", area: 7.5, band: "public", floor: "oak", minW: 2.5, window: { width: 1.2 } });
  return rooms;
}

const HALL_DEPTH = 1.3;
/** preferred band depths (wall centrelines), metres */
const PRIVATE_DEPTH = { pref: 4.0, min: 3.2, max: 5.0 };
const PUBLIC_DEPTH = { pref: 5.2, min: 4.0, max: 6.8 };
const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ProgramPlan {
  spec: LayoutSpec;
  /** clear floor the program aims for (before walls), m² */
  plannedArea: number;
  notes: string[];
}

type Banded = ProgramRoom & { band: "private" | "public" };

/**
 * Line up room boundaries across the hall when they nearly coincide. Two partitions 10 cm
 * apart would leave a sliver of wall too short to build (and too short to validate).
 */
function align(ws: number[], ref: number[]): number[] {
  const refEdges = ref.map((_, i) => round1(total(ref.slice(0, i + 1)))).slice(0, -1);
  const edges = ws.map((_, i) => round1(total(ws.slice(0, i + 1))));
  for (let i = 0; i < edges.length - 1; i++) {
    const near = refEdges.find((e) => Math.abs(e - edges[i]) > 1e-6 && Math.abs(e - edges[i]) < 0.45);
    if (near === undefined) continue;
    const lo = i === 0 ? 0 : edges[i - 1];
    // keep both neighbours at least 1.5 m wide
    if (near - lo >= 1.5 && edges[i + 1] - near >= 1.5) edges[i] = near;
  }
  return edges.map((e, i) => round1(e - (i === 0 ? 0 : edges[i - 1])));
}

const widths = (rooms: Banded[], depth: number) => rooms.map((r) => Math.max(r.minW, round1(r.area / depth)));
const total = (ws: number[]) => ws.reduce((s, v) => s + v, 0);

/** Lay the program out as a two-band house and describe it for the layout builder. */
export function layoutFor(b: Brief): ProgramPlan {
  const program = programFor(b);
  const notes: string[] = [];
  const base = program.reduce((s, r) => s + r.area, 0);
  // the hall is not part of the program; scale rooms so program + hall ≈ target
  let scale = 1;
  if (b.targetArea && !b.areas) {
    const hall = Math.sqrt(base) * 1.1 * HALL_DEPTH;
    const wanted = (b.targetArea - hall) / base;
    scale = clamp(wanted, 0.7, 1.8);
    if (Math.abs(scale - wanted) > 0.02) notes.push(`Room sizes were kept livable, so the total differs from the ${b.targetArea} m² asked for.`);
  }
  let priv: Banded[] = program.filter((r) => r.band === "private").map((r) => ({ ...r, area: r.area * scale }));
  let pub: Banded[] = program.filter((r) => r.band === "public").map((r) => ({ ...r, area: r.area * scale }));

  // balance the bands: a long private band moves its last movable rooms across the hall
  const movable = (r: Banded) => !r.via && (r.as === "utility" || (r.as.startsWith("bed") && r.as !== "bed1") || r.as.startsWith("bath"));
  for (let guard = 0; guard < 6; guard++) {
    const wq = total(widths(priv, PRIVATE_DEPTH.pref));
    const wp = total(widths(pub, PUBLIC_DEPTH.pref));
    if (wq <= wp * 1.2) break;
    const i = priv.map(movable).lastIndexOf(true);
    if (i < 0) break;
    const [r] = priv.splice(i, 1);
    pub = [...pub, { ...r, band: "public" }];
  }

  // converge on one width with both band depths inside their livable range
  const aq = priv.reduce((s, r) => s + r.area, 0);
  const ap = pub.reduce((s, r) => s + r.area, 0);
  // bigger programs get deeper bands instead of ever longer ones
  const grow = Math.sqrt(Math.max(1, (aq + ap) / 70));
  let dq = round1(clamp(PRIVATE_DEPTH.pref * grow, PRIVATE_DEPTH.min, PRIVATE_DEPTH.max));
  let dp = round1(clamp(PUBLIC_DEPTH.pref * grow, PUBLIC_DEPTH.min, PUBLIC_DEPTH.max));
  const span = () => round1(Math.max(4, priv.length ? total(widths(priv, dq)) : 0, total(widths(pub, dp))));
  let width = span();
  // the narrower band gets shallower (within limits) instead of only wider, to stay near the program area
  if (priv.length) dq = round1(clamp(aq / width, PRIVATE_DEPTH.min, dq));
  dp = round1(clamp(ap / width, PUBLIC_DEPTH.min, dp));
  width = span();
  // stretch the band's largest room so both bands span the same width
  const stretch = (ws: number[]) => {
    const sum = total(ws);
    if (ws.length === 0 || width - sum < 1e-6) return ws;
    const i = ws.indexOf(Math.max(...ws));
    return ws.map((v, k) => (k === i ? round1(v + width - sum) : v));
  };
  const wq = stretch(widths(priv, dq));
  const wp = align(stretch(widths(pub, dp)), wq);

  const rooms: LayoutSpec["rooms"] = [];
  const doors: NonNullable<LayoutSpec["doors"]> = [];
  const windows: NonNullable<LayoutSpec["windows"]> = [];
  const placed: { r: Banded; w: number; h: number }[] = [];
  let x = 0;
  priv.forEach((r, i) => {
    rooms.push({ as: r.as, label: r.label, x: round1(x), y: 0, w: wq[i], h: dq, floor: r.floor });
    placed.push({ r, w: wq[i], h: dq });
    x += wq[i];
  });
  const hallY = priv.length ? dq : 0;
  rooms.push({ as: "hall", label: "Hall", x: 0, y: hallY, w: width, h: HALL_DEPTH, floor: "oak" });
  x = 0;
  pub.forEach((r, i) => {
    rooms.push({ as: r.as, label: r.label, x: round1(x), y: round1(hallY + HALL_DEPTH), w: wp[i], h: dp, floor: r.floor });
    placed.push({ r, w: wp[i], h: dp });
    x += wp[i];
  });

  doors.push({ from: "hall", to: "exterior", side: "west", width: 1.0 });
  for (const { r } of placed) {
    const via = r.via && rooms.some((x) => x.as === r.via) ? r.via : "hall";
    const wet = r.floor === "tile" && r.as !== "kitchen";
    // doors near one end of the hall wall leave a full wall for beds, sofas and counters
    const position = via === "hall" ? (r.band === "private" ? 0.15 : 0.85) : undefined;
    doors.push({ from: r.as, to: via, width: r.as === "living" ? 1.2 : wet ? 0.8 : 0.9, ...(position !== undefined ? { position } : {}) });
  }
  // windows sized for ~12% glazing so habitable rooms clear the 10% daylight heuristic
  for (const { r, w, h } of placed) {
    if (!r.window) continue;
    const height = r.window.height ?? 1.2;
    const need = (w * h * 0.12) / height;
    const width = round1(clamp(Math.max(r.window.width, need), 0.4, Math.min(4, Math.max(0.4, w - 0.7))));
    windows.push({ room: r.as, side: r.band === "private" ? "north" : "south", ...r.window, width });
  }
  windows.push({ room: "hall", side: "east", width: 0.8 });
  // end rooms of each band get a window on their outer side
  for (const band of [priv, pub]) {
    const ends = band.length > 1 ? [band[0], band[band.length - 1]] : band;
    ends.forEach((r, k) => {
      if (r.window && r.floor !== "tile") windows.push({ room: r.as, side: k === 0 ? "west" : "east", width: 1.2 });
    });
  }

  const name =
    b.name ??
    (b.bedrooms === 0 ? "Studio home" : `${["", "One", "Two", "Three", "Four", "Five", "Six"][b.bedrooms]}-bedroom home`);
  const plannedArea = round1(rooms.reduce((s, r) => s + r.w * r.h, 0));
  return { spec: { name, rooms, doors, windows }, plannedArea, notes };
}

// ---------------------------------------------------------------------------
// Reading a design back into a brief (for structural edits)
// ---------------------------------------------------------------------------

/** Clear floor is smaller than the centreline rectangle the program describes. */
const CLEAR_TO_CENTRELINE = 1.1;

export interface ReadBack {
  brief: Brief;
  /** program alias → existing room id */
  aliasOf: Record<string, string>;
  /** rooms that do not map to the program (custom spaces) and would be lost */
  unmapped: Room[];
}

/**
 * The brief that would regenerate (approximately) this design: room counts and options
 * from room types, and each room's current size and name as overrides.
 */
export function briefFromModel(m: PlanModel): ReadBack {
  const type = (r: Room) => roomTypes(r.label);
  const area = (r: Room) => Math.round(r.w * r.h * CLEAR_TO_CENTRELINE * 10) / 10;
  const beds = m.rooms.filter((r) => type(r)[0] === "bedroom");
  const main = beds.find((r) => /\b(main|master|primary)\b/i.test(r.label)) ?? [...beds].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const orderedBeds = main ? [main, ...beds.filter((r) => r !== main)] : [];
  const baths = m.rooms.filter((r) => type(r)[0] === "bath");
  const ensuite = baths.find((r) => /en-?suite/i.test(r.label));
  const living = m.rooms.find((r) => type(r).includes("living"));
  const kitchen = m.rooms.find((r) => type(r)[0] === "kitchen");
  const dining = m.rooms.find((r) => type(r)[0] === "dining");
  const study = m.rooms.find((r) => type(r)[0] === "study");
  const utility = m.rooms.find((r) => type(r)[0] === "utility");

  const aliasOf: Record<string, string> = {};
  orderedBeds.forEach((r, i) => (aliasOf[`bed${i + 1}`] = r.id));
  if (ensuite && main) aliasOf.ensuite = ensuite.id;
  baths.filter((r) => r !== ensuite || !main).forEach((r, i) => (aliasOf[`bath${i + 1}`] = r.id));
  if (living) aliasOf.living = living.id;
  if (kitchen && kitchen !== living) aliasOf.kitchen = kitchen.id;
  if (dining) aliasOf.dining = dining.id;
  if (study) aliasOf.study = study.id;
  if (utility) aliasOf.utility = utility.id;

  const byId = new Map(m.rooms.map((r) => [r.id, r]));
  const areas: Record<string, number> = {};
  const labels: Record<string, string> = {};
  for (const [alias, id] of Object.entries(aliasOf)) {
    areas[alias] = area(byId.get(id)!);
    labels[alias] = byId.get(id)!.label;
  }
  const mapped = new Set(Object.values(aliasOf));
  const unmapped = m.rooms.filter((r) => !mapped.has(r.id) && type(r)[0] !== "hall");
  return {
    brief: {
      bedrooms: orderedBeds.length,
      bathrooms: Math.max(1, baths.length),
      ensuite: !!(ensuite && main),
      study: !!study,
      dining: !!dining,
      openKitchen: !aliasOf.kitchen,
      utility: !!utility,
      targetArea: null,
      name: m.name,
      areas,
      labels,
    },
    aliasOf,
    unmapped,
  };
}
