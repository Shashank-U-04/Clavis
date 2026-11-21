/**
 * Spatial analysis: room types, the circulation graph, habitability and area metrics.
 *
 * Covers circulation routes from the entrance, daylight / escape-opening / minimum-size
 * habitability checks, and carpet vs envelope areas, for Clavis's metric model: rooms are clear floor rectangles inside
 * the wall faces, and doors and windows are hosted on walls at a position `t`.
 *
 * Every threshold is a configurable early-design heuristic, NOT a building-code value for any
 * jurisdiction. The UI says so wherever these numbers are shown.
 *
 * This module depends only on geometry and types so the constraint engine can import it.
 */

import type { Issue, Opening, PlanModel, Room, Wall } from "./types";
import { levelOf, levelsOf } from "./levels";
import { stairLinks } from "./stairs";
import { segLen, segPoint, type Pt } from "./geometry";

export const ROOM_TYPES = ["bedroom", "living", "kitchen", "dining", "bath", "study", "hall", "utility", "other"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

/** Concept-design heuristics. Edit here; every check and every UI number reads from this. */
export const HABITABILITY = {
  /** glazing area / floor area for habitable rooms */
  minDaylightRatio: 0.1,
  /** a bedroom needs at least one window at least this big with a sill no higher than maxEscapeSill */
  escapeWindow: { minWidth: 0.5, minHeight: 0.6, maxSill: 1.1 },
  /** minimum clear floor area (m²) and shortest side (m) by room type */
  minSize: {
    bedroom: { area: 6.5, side: 2.1 },
    living: { area: 10, side: 2.7 },
    kitchen: { area: 4.5, side: 1.8 },
    dining: { area: 6, side: 2.1 },
    bath: { area: 2.2, side: 1.2 },
    study: { area: 4.5, side: 1.8 },
  } as Partial<Record<RoomType, { area: number; side: number }>>,
};

const PATTERNS: [RoomType, RegExp][] = [
  ["bath", /\b(bath(room)?s?|shower|en-?suite|wc|toilet|powder|washroom|restroom|lavatory)\b/i],
  ["bedroom", /\b(bed(room)?s?|master|guest|kids?|nursery|sleep(ing)?)\b/i],
  ["living", /\b(living|lounge|family|sitting|great room|salon|studio)\b/i],
  ["kitchen", /\b(kitchen(ette)?|cook(ing)?|galley)\b/i],
  ["dining", /\b(dining|breakfast|eat(ing)?)\b/i],
  ["study", /\b(study|office|den|library|work(room|space)?)\b/i],
  ["hall", /\b(hall(way)?|corridor|entry|entrance|foyer|lobby|landing|passage|vestibule|porch)\b/i],
  ["utility", /\b(utility|laundry|storage|store|closet|garage|pantry|walk-?in|plant|boiler|mud ?room)\b/i],
];

/** Every type a label suggests, most specific first ("Living & Kitchen" → living, kitchen). */
export function roomTypes(label: string): RoomType[] {
  const hits = PATTERNS.filter(([, re]) => re.test(label)).map(([t]) => t);
  return hits.length ? hits : ["other"];
}

export const primaryType = (label: string): RoomType => roomTypes(label)[0];

const HABITABLE = new Set<RoomType>(["bedroom", "living", "study", "dining"]);
export const isHabitable = (types: RoomType[]) => types.some((t) => HABITABLE.has(t));
const PRIVATE = new Set<RoomType>(["bedroom", "bath"]);

// ---------------------------------------------------------------------------
// Openings → the rooms on either side
// ---------------------------------------------------------------------------

const EXTERIOR = "exterior";

function inRoom(r: Room, p: Pt, tol = 0.02): boolean {
  return p.x >= r.x - tol && p.x <= r.x + r.w + tol && p.y >= r.y - tol && p.y <= r.y + r.h + tol;
}

/** The rooms (or "exterior") on the two faces of an opening, probing just past the wall faces. */
export function openingSides(o: Opening, wall: Wall, rooms: Room[]): [string, string] {
  const len = segLen(wall.ax, wall.ay, wall.bx, wall.by) || 1;
  const nx = -(wall.by - wall.ay) / len;
  const ny = (wall.bx - wall.ax) / len;
  const c = segPoint({ x: wall.ax, y: wall.ay }, { x: wall.bx, y: wall.by }, o.t);
  const probe = wall.thickness / 2 + 0.15;
  const side = (s: number) => {
    const p = { x: c.x + nx * probe * s, y: c.y + ny * probe * s };
    return rooms.find((r) => inRoom(r, p))?.id ?? EXTERIOR;
  };
  return [side(1), side(-1)];
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface RoomAnalysis {
  id: string;
  label: string;
  types: RoomType[];
  habitable: boolean;
  area: number;
  shortSide: number;
  doors: string[];
  windows: string[];
  glazingArea: number;
  daylightRatio: number;
  /** a window that meets HABITABILITY.escapeWindow */
  escapeWindowId: string | null;
  /** fewest doors from an entrance (1 = straight from outside); null = unreachable */
  depth: number | null;
  /** room ids from the entrance-side room to this one, inclusive */
  route: string[] | null;
  /** door ids crossed along the route, starting with the entrance door */
  routeDoors: string[] | null;
}

export interface DoorLink {
  id: string;
  a: string;
  b: string;
}

export interface Analysis {
  rooms: RoomAnalysis[];
  /** door ids that connect a room to the outside */
  entrances: string[];
  links: DoorLink[];
  metrics: {
    carpetArea: number;
    /** bounding area of the outer wall faces (a rectangle approximation of the footprint) */
    envelopeArea: number;
    envelope: { x: number; y: number; w: number; h: number } | null;
    /** carpet / envelope, 0..1 */
    efficiency: number;
    bedrooms: number;
    bathrooms: number;
    glazingArea: number;
    areaByType: Partial<Record<RoomType, number>>;
  };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function analyzeModel(model: PlanModel): Analysis {
  const wallById = new Map(model.walls.map((w) => [w.id, w]));
  // a door joins rooms on its own floor; floors are joined by stairs (below)
  const roomsOn = new Map<string, Room[]>();
  for (const r of model.rooms) roomsOn.set(levelOf(r), [...(roomsOn.get(levelOf(r)) ?? []), r]);
  const byRoom = new Map<string, { doors: string[]; windows: Opening[] }>(model.rooms.map((r) => [r.id, { doors: [], windows: [] }]));
  const links: DoorLink[] = [];
  const entrances: string[] = [];

  for (const o of model.openings) {
    const wall = wallById.get(o.wallId);
    if (!wall) continue;
    const [a, b] = openingSides(o, wall, roomsOn.get(levelOf(wall)) ?? []);
    for (const side of new Set([a, b])) {
      const slot = byRoom.get(side);
      if (!slot) continue;
      if (o.kind === "door") slot.doors.push(o.id);
      else slot.windows.push(o);
    }
    if (o.kind === "door" && a !== b) {
      links.push({ id: o.id, a, b });
      if (a === EXTERIOR || b === EXTERIOR) entrances.push(o.id);
    }
  }

  for (const s of stairLinks(model)) if (s.a && s.b) links.push({ id: s.id, a: s.a, b: s.b });

  // breadth-first from the outside through doors and stairs: fewest of them to each room
  const adj = new Map<string, { to: string; door: string }[]>();
  for (const l of links) {
    (adj.get(l.a) ?? adj.set(l.a, []).get(l.a)!).push({ to: l.b, door: l.id });
    (adj.get(l.b) ?? adj.set(l.b, []).get(l.b)!).push({ to: l.a, door: l.id });
  }
  const prev = new Map<string, { from: string; door: string }>();
  const depth = new Map<string, number>([[EXTERIOR, 0]]);
  const queue = [EXTERIOR];
  while (queue.length) {
    const cur = queue.shift()!;
    // deterministic order: sort neighbours by room id
    for (const n of [...(adj.get(cur) ?? [])].sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0))) {
      if (depth.has(n.to)) continue;
      depth.set(n.to, depth.get(cur)! + 1);
      prev.set(n.to, { from: cur, door: n.door });
      queue.push(n.to);
    }
  }
  const routeTo = (id: string): { rooms: string[]; doors: string[] } | null => {
    if (!depth.has(id)) return null;
    const rooms: string[] = [];
    const doors: string[] = [];
    let cur = id;
    while (cur !== EXTERIOR) {
      rooms.unshift(cur);
      const p = prev.get(cur)!;
      doors.unshift(p.door);
      cur = p.from;
    }
    return { rooms, doors };
  };

  const esc = HABITABILITY.escapeWindow;
  const rooms: RoomAnalysis[] = model.rooms.map((r) => {
    const types = roomTypes(r.label);
    const slot = byRoom.get(r.id)!;
    const glazingArea = r3(slot.windows.reduce((s, w) => s + w.width * w.height, 0));
    const area = r3(r.w * r.h);
    const route = routeTo(r.id);
    const escape = slot.windows.find((w) => w.width >= esc.minWidth && w.height >= esc.minHeight && w.sill <= esc.maxSill);
    return {
      id: r.id,
      label: r.label,
      types,
      habitable: isHabitable(types),
      area,
      shortSide: r3(Math.min(r.w, r.h)),
      doors: slot.doors,
      windows: slot.windows.map((w) => w.id),
      glazingArea,
      daylightRatio: area > 0 ? r3(glazingArea / area) : 0,
      escapeWindowId: escape?.id ?? null,
      depth: route ? route.rooms.length : null,
      route: route?.rooms ?? null,
      routeDoors: route?.doors ?? null,
    };
  });

  // envelope: outer faces of all walls (axis-aligned bounding box)
  let envelope: Analysis["metrics"]["envelope"] = null;
  if (model.walls.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const w of model.walls) {
      const h = w.thickness / 2;
      x0 = Math.min(x0, w.ax - h, w.bx - h);
      y0 = Math.min(y0, w.ay - h, w.by - h);
      x1 = Math.max(x1, w.ax + h, w.bx + h);
      y1 = Math.max(y1, w.ay + h, w.by + h);
    }
    envelope = { x: r3(x0), y: r3(y0), w: r3(x1 - x0), h: r3(y1 - y0) };
  }
  const carpetArea = r3(rooms.reduce((s, r) => s + r.area, 0));
  const envelopeArea = envelope ? r3(envelope.w * envelope.h) : 0;
  const areaByType: Partial<Record<RoomType, number>> = {};
  for (const r of rooms) areaByType[r.types[0]] = r3((areaByType[r.types[0]] ?? 0) + r.area);

  return {
    rooms,
    entrances,
    links,
    metrics: {
      carpetArea,
      envelopeArea,
      envelope,
      efficiency: envelopeArea > 0 ? r3(carpetArea / envelopeArea) : 0,
      bedrooms: rooms.filter((r) => r.types[0] === "bedroom").length,
      bathrooms: rooms.filter((r) => r.types[0] === "bath").length,
      glazingArea: r3(rooms.reduce((s, r) => s + r.glazingArea, 0)),
      areaByType,
    },
  };
}

// ---------------------------------------------------------------------------
// Review findings (merged into the constraint engine's output)
// ---------------------------------------------------------------------------

type Draft = Omit<Issue, "id">;

/**
 * Circulation and habitability findings. These complement, and never duplicate, the
 * geometric checks: a room with no door or no window at all is reported by issues.ts
 * (room_no_door / room_no_window), so it is skipped here.
 */
export function reviewFindings(model: PlanModel, a: Analysis = analyzeModel(model)): Draft[] {
  const out: Draft[] = [];
  if (model.rooms.length === 0 || model.walls.length === 0) return out;
  const label = new Map(model.rooms.map((r) => [r.id, r.label]));
  const anyDoor = model.openings.some((o) => o.kind === "door");

  if (anyDoor && a.entrances.length === 0) {
    out.push({
      severity: "warning",
      code: "no_entrance",
      message: "No door leads outside, so nobody can get in. Add an entrance door on an exterior wall.",
      refs: model.rooms.map((r) => r.id),
    });
  }

  // stairs: each must climb to a floor and land in a room there, from a room down here
  const levelName = (id: string | null) => levelsOf(model).find((l) => l.id === id)?.name ?? "the floor above";
  for (const s of stairLinks(model)) {
    if (!s.to) {
      out.push({ severity: "warning", code: "stair_no_floor_above", message: "This stair climbs to nothing: there is no floor above it. Add a floor, or remove the stair.", refs: [s.id] });
      continue;
    }
    if (!s.b)
      out.push({ severity: "warning", code: "stair_lands_nowhere", message: `This stair lands outside every room on ${levelName(s.to)}. Put a room (a landing or hall) where it arrives.`, refs: [s.id] });
    if (!s.a)
      out.push({ severity: "warning", code: "stair_starts_nowhere", message: "Nothing is in front of this stair's foot: it starts outside every room on its floor.", refs: [s.id] });
  }

  for (const r of a.rooms) {
    // circulation
    if (a.entrances.length > 0 && r.doors.length > 0 && r.depth === null) {
      out.push({
        severity: "warning",
        code: "room_unreachable",
        message: `"${r.label}" has a door but cannot be reached from the entrance.`,
        refs: [r.id, ...r.doors],
      });
    }
    if (r.route && r.route.length > 2) {
      const through = r.route.slice(0, -1).filter((id) => {
        const t = primaryType(label.get(id) ?? "");
        return PRIVATE.has(t);
      });
      if (through.length) {
        out.push({
          severity: "info",
          code: "route_through_private",
          message: `"${r.label}" is only reached through ${through.map((id) => `"${label.get(id)}"`).join(", ")}.`,
          refs: [r.id, ...through],
        });
      }
    }

    // habitability
    if (r.habitable && r.windows.length > 0 && r.daylightRatio < HABITABILITY.minDaylightRatio) {
      out.push({
        severity: "warning",
        code: "room_low_daylight",
        message: `"${r.label}" has ${r.glazingArea.toFixed(2)} m² of glazing for ${r.area.toFixed(1)} m² of floor (${Math.round(r.daylightRatio * 100)}%; aim for ${HABITABILITY.minDaylightRatio * 100}%+).`,
        refs: [r.id, ...r.windows],
        measurements: { glazing_m2: r.glazingArea, floor_m2: r.area, ratio: r.daylightRatio, target: HABITABILITY.minDaylightRatio },
      });
    }
    if (r.types[0] === "bedroom" && r.windows.length > 0 && !r.escapeWindowId) {
      const e = HABITABILITY.escapeWindow;
      out.push({
        severity: "warning",
        code: "bedroom_no_escape_window",
        message: `"${r.label}" has no window big and low enough to climb out of in an emergency (≥ ${e.minWidth} × ${e.minHeight} m, sill ≤ ${e.maxSill} m).`,
        refs: [r.id, ...r.windows],
      });
    }
    if (r.types[0] === "bath" && r.windows.length === 0) {
      out.push({
        severity: "info",
        code: "bath_needs_extract",
        message: `"${r.label}" has no window; plan for mechanical extract ventilation.`,
        refs: [r.id],
      });
    }
    const min = HABITABILITY.minSize[r.types[0]];
    if (min && (r.area < min.area - 1e-6 || r.shortSide < min.side - 1e-6)) {
      out.push({
        severity: "warning",
        code: "room_undersized",
        message: `"${r.label}" is ${r.area.toFixed(1)} m² with a ${r.shortSide.toFixed(2)} m short side; a ${r.types[0]} usually needs ${min.area} m² and ${min.side} m.`,
        refs: [r.id],
        measurements: { area_m2: r.area, short_side: r.shortSide, min_area_m2: min.area, min_side: min.side },
      });
    }
  }
  return out;
}
