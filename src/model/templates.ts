/**
 * Hand-written starting points. These are deterministic templates, NOT AI output, and the UI
 * labels them that way. The compact two-bedroom program mirrors the PRD's demo request so the
 * workflow can still be shown when the model provider is unreachable.
 *
 * Dimensions are illustrative concept-design values, not a statement of compliance with any
 * building code.
 */

import { applyBatch, type DesignOperation } from "./operations";
import { emptyModel, type PlanModel } from "./types";

export const COMPACT_TWO_BEDROOM: DesignOperation[] = [
  {
    op: "build_layout",
    name: "Compact two-bedroom home",
    rooms: [
      { as: "living", label: "Living & Kitchen", x: 0, y: 0, w: 6, h: 4.5, floor: "oak" },
      { as: "bed1", label: "Bedroom 1", x: 6, y: 0, w: 3.6, h: 5.7, floor: "carpet" },
      { as: "hall", label: "Hall", x: 0, y: 4.5, w: 6, h: 1.2, floor: "oak" },
      { as: "bed2", label: "Bedroom 2", x: 0, y: 5.7, w: 3.6, h: 3.3, floor: "carpet" },
      { as: "bath", label: "Bathroom", x: 3.6, y: 5.7, w: 2.4, h: 3.3, floor: "tile" },
    ],
    doors: [
      { from: "hall", to: "exterior", side: "west" },
      { from: "living", to: "hall", width: 1.2, position: 0.75 },
      { from: "bed1", to: "hall" },
      { from: "bed2", to: "hall", position: 0.8 },
      { from: "bath", to: "hall", width: 0.8, position: 0 },
    ],
    windows: [
      { room: "living", side: "north", width: 2 },
      { room: "living", side: "west", width: 1.4 },
      { room: "bed1", side: "north", width: 1.4 },
      { room: "bed1", side: "east", width: 1.2 },
      { room: "bed2", side: "west", width: 1.2 },
      { room: "bath", side: "south", width: 0.6, sill: 1.2, height: 0.9 },
    ],
  },
  // open kitchen along the north-east of the living space, living area to the west
  { op: "place_item_in_room", kind: "kitchen_counter", roomId: "$living", against: "east", along: 0.15 },
  { op: "place_item_in_room", kind: "fridge", roomId: "$living", against: "east", along: 0.75 },
  { op: "place_item_in_room", kind: "dining_table", roomId: "$living", against: "center", rotation: 90 },
  { op: "place_item_in_room", kind: "sofa", roomId: "$living", against: "west", along: 0.15, gap: 0.05 },
  // study corner: desk in the living room's south-west corner
  { op: "place_item_in_room", kind: "desk", roomId: "$living", against: "south", along: 0 },
  { op: "place_item_in_room", kind: "bed_double", roomId: "$bed1", against: "east", along: 0.3 },
  { op: "place_item_in_room", kind: "wardrobe", roomId: "$bed1", against: "west", along: 0.15 },
  { op: "place_item_in_room", kind: "bed_single", roomId: "$bed2", against: "south", along: 0 },
  { op: "place_item_in_room", kind: "wardrobe", roomId: "$bed2", against: "east", along: 1 },
  { op: "place_item_in_room", kind: "toilet", roomId: "$bath", against: "east", along: 0.8 },
  { op: "place_item_in_room", kind: "shower", roomId: "$bath", against: "east", along: 0 },
  { op: "place_item_in_room", kind: "sink", roomId: "$bath", against: "west", along: 0.8 },
];

/** The compact two-bedroom template as a ready design. */
export function templateModel(): PlanModel {
  let n = 0;
  return applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, (prefix) => `${prefix}_${(n++).toString(36)}`).model;
}

const item = (kind: string, x: number, y: number, rotation: number): DesignOperation => ({ op: "place_item", kind, x, y, rotation });

/**
 * Sunset Loft — a generous open-plan home of about 119 m² (12 × 9.9 m on centrelines).
 * The living room's sofa faces a wide west window for the evening light; dining sits in the
 * middle of the open space and the kitchen runs along its east wall. A full-width hall serves
 * the main bedroom, a study, a bathroom, a guest bedroom and a utility room.
 */
export const SUNSET_LOFT: DesignOperation[] = [
  {
    op: "build_layout",
    name: "Sunset Loft",
    rooms: [
      { as: "living", label: "Living & Kitchen", x: 0, y: 0, w: 7.2, h: 5.4, floor: "oak" },
      { as: "bed1", label: "Main bedroom", x: 7.2, y: 0, w: 4.8, h: 5.4, floor: "carpet" },
      { as: "hall", label: "Hall", x: 0, y: 5.4, w: 12, h: 1.3, floor: "oak" },
      { as: "study", label: "Study", x: 0, y: 6.7, w: 3.6, h: 3.2, floor: "oak" },
      { as: "bath", label: "Bathroom", x: 3.6, y: 6.7, w: 2.8, h: 3.2, floor: "tile" },
      { as: "bed2", label: "Guest bedroom", x: 6.4, y: 6.7, w: 3.6, h: 3.2, floor: "carpet" },
      { as: "utility", label: "Utility", x: 10, y: 6.7, w: 2, h: 3.2, floor: "tile" },
    ],
    doors: [
      { from: "hall", to: "exterior", side: "west", width: 1.0 },
      { from: "living", to: "hall", width: 1.2, position: 0.55 },
      { from: "bed1", to: "hall", position: 0.85 },
      { from: "study", to: "hall" },
      { from: "bath", to: "hall", width: 0.8 },
      { from: "bed2", to: "hall", position: 0.15 },
      { from: "utility", to: "hall", width: 0.8 },
    ],
    windows: [
      { room: "living", side: "west", width: 3.2, height: 1.8, sill: 0.4 },
      { room: "living", side: "north", width: 2.8, height: 1.5 },
      { room: "bed1", side: "north", width: 1.8, height: 1.4 },
      { room: "bed1", side: "east", width: 1.4 },
      { room: "study", side: "west", width: 1.4 },
      { room: "bath", side: "south", width: 0.6, sill: 1.3, height: 0.8 },
      { room: "bed2", side: "south", width: 1.6 },
      { room: "hall", side: "east", width: 0.8 },
    ],
  },
  // living: a three-seat sofa facing the west window, armchairs either side of the coffee table
  item("rug", 1.95, 2.6, 90),
  item("sofa_3", 3.1, 2.6, 270),
  item("coffee_table", 1.95, 2.6, 90),
  item("armchair", 1.95, 0.6, 0),
  item("armchair", 1.95, 4.6, 180),
  item("plant", 0.4, 0.4, 0),
  item("plant", 0.4, 5.05, 0),
  // dining for six in the middle of the open space
  item("dining_table_oval", 4.6, 2.6, 90),
  item("dining_chair", 3.845, 2.0, 90),
  item("dining_chair", 3.845, 2.6, 90),
  item("dining_chair", 3.845, 3.2, 90),
  item("dining_chair", 5.355, 2.0, 270),
  item("dining_chair", 5.355, 2.6, 270),
  item("dining_chair", 5.355, 3.2, 270),
  // kitchen along the east wall
  item("kitchen_counter", 6.84, 1.45, 270),
  item("kitchen_hob_unit", 6.84, 3.3, 270),
  item("fridge", 6.8, 4.45, 270),
  // main bedroom
  item("bed_double", 10.85, 2.5, 270),
  item("nightstand", 11.7, 1.425, 270),
  item("nightstand", 11.7, 3.575, 270),
  item("wardrobe", 7.55, 1.0, 90),
  item("wardrobe", 7.55, 2.6, 90),
  item("armchair", 8.4, 4.6, 90),
  // study: desk under the window
  item("desk", 0.425, 8.3, 90),
  item("office_chair", 1.1, 8.3, 270),
  item("bookshelf", 3.39, 8.8, 270),
  // bathroom
  item("bathtub", 5.0, 9.4, 180),
  item("toilet", 6.0, 8.0, 270),
  item("sink", 3.86, 8.0, 90),
  // guest bedroom
  item("bed_double", 8.2, 8.75, 180),
  item("nightstand", 7.125, 9.6, 180),
  item("nightstand", 9.275, 9.6, 180),
  item("wardrobe", 9.65, 7.6, 270),
  // utility and hall
  item("counter_unit", 11.59, 8.8, 270),
  item("plant", 8.3, 6.05, 0),
];

/** Sunset Loft as a ready design. */
export function sunsetLoftModel(): PlanModel {
  let n = 0;
  return applyBatch(emptyModel(), SUNSET_LOFT, (prefix) => `${prefix}_${(n++).toString(36)}`).model;
}

const against = (kind: string, roomId: string, side: "north" | "south" | "east" | "west", along = 0.5, gap?: number): DesignOperation => ({
  op: "place_item_in_room",
  kind,
  roomId: `$${roomId}`,
  against: side,
  along,
  ...(gap !== undefined && { gap }),
});

/**
 * Cedar Villa — a single-storey villa of about 330 m² (24 × 14.4 m on centrelines). The day
 * rooms run along the north front: a grand living room glazed floor to ceiling towards the
 * pool on the west, dining and an open kitchen with an island. A gallery hall runs behind
 * them to the bedrooms: a study, two guest bedrooms and a family bathroom, and at the east end
 * a main suite with its own dressing room and en-suite.
 */
export const CEDAR_VILLA: DesignOperation[] = [
  {
    op: "build_layout",
    name: "Cedar Villa",
    rooms: [
      { as: "living", label: "Living room", x: 0, y: 0, w: 8.4, h: 6.6, floor: "oak" },
      { as: "dining", label: "Dining", x: 8.4, y: 0, w: 4.8, h: 6.6, floor: "oak" },
      { as: "kitchen", label: "Kitchen", x: 13.2, y: 0, w: 4.8, h: 6.6, floor: "tile" },
      { as: "main", label: "Main bedroom", x: 18, y: 0, w: 6, h: 8.4, floor: "oak" },
      { as: "hall", label: "Gallery hall", x: 0, y: 6.6, w: 18, h: 1.8, floor: "oak" },
      { as: "study", label: "Study", x: 0, y: 8.4, w: 4.4, h: 6, floor: "oak" },
      { as: "guest", label: "Guest bedroom", x: 4.4, y: 8.4, w: 4.6, h: 6, floor: "carpet" },
      { as: "bath", label: "Bathroom", x: 9, y: 8.4, w: 2.6, h: 6, floor: "tile" },
      { as: "bed3", label: "Bedroom 3", x: 11.6, y: 8.4, w: 4.4, h: 6, floor: "carpet" },
      { as: "utility", label: "Utility", x: 16, y: 8.4, w: 2, h: 6, floor: "tile" },
      { as: "dress", label: "Dressing room", x: 18, y: 8.4, w: 2.4, h: 6, floor: "oak" },
      { as: "ensuite", label: "En-suite", x: 20.4, y: 8.4, w: 3.6, h: 6, floor: "tile" },
    ],
    doors: [
      { from: "hall", to: "exterior", side: "west", width: 1.6 },
      { from: "living", to: "exterior", side: "north", width: 1.8, position: 1 },
      { from: "living", to: "hall", width: 1.6, position: 0.6 },
      { from: "dining", to: "living", width: 2.4 },
      { from: "kitchen", to: "dining", width: 1.4 },
      { from: "kitchen", to: "hall", position: 0.8 },
      { from: "main", to: "hall" },
      { from: "study", to: "hall", position: 0.7 },
      { from: "guest", to: "hall", position: 0.2 },
      { from: "bath", to: "hall", width: 0.8 },
      { from: "bed3", to: "hall", position: 0.8 },
      { from: "utility", to: "hall", width: 0.8 },
      { from: "dress", to: "main", width: 0.9 },
      { from: "ensuite", to: "main", width: 0.9, position: 0.3 },
    ],
    windows: [
      { room: "living", side: "west", width: 4, height: 2.2, sill: 0 },
      { room: "living", side: "north", width: 3.6, height: 2, sill: 0.2 },
      { room: "dining", side: "north", width: 3.2, height: 1.8, sill: 0.4 },
      { room: "kitchen", side: "north", width: 2.4, height: 1.1, sill: 1.05 },
      { room: "main", side: "north", width: 3.2, height: 1.8, sill: 0.4 },
      { room: "main", side: "east", width: 2, height: 1.5 },
      { room: "study", side: "west", width: 1.8, height: 1.5 },
      { room: "study", side: "south", width: 1.4 },
      { room: "guest", side: "south", width: 2.4, height: 1.4 },
      { room: "bath", side: "south", width: 0.8, sill: 1.3, height: 0.8 },
      { room: "bed3", side: "south", width: 2.4, height: 1.4 },
      { room: "utility", side: "south", width: 0.6, sill: 1.2, height: 0.9 },
      { room: "dress", side: "south", width: 0.8, sill: 1.4, height: 0.6 },
      { room: "ensuite", side: "east", width: 1, sill: 1.3, height: 0.8 },
      { room: "ensuite", side: "south", width: 1.2, sill: 1.2, height: 0.9 },
    ],
  },
  // living: a long sofa and two armchairs facing the glass wall and the pool beyond it
  item("rug", 2.5, 3.3, 90),
  item("sofa_3", 3.75, 3.3, 270),
  item("coffee_table", 2.5, 3.3, 90),
  item("armchair", 2.5, 1.5, 0),
  item("armchair", 2.5, 5.1, 180),
  item("side_table", 3.75, 1.6, 0),
  item("plant", 0.45, 0.45, 0),
  item("plant", 0.45, 6.15, 0),
  // a second seat by the north window, the fire side of the room
  item("rug", 5.9, 3.3, 0),
  item("sofa", 5.9, 4.6, 180),
  item("armchair", 5.2, 2.1, 0),
  item("armchair", 6.6, 2.1, 0),
  item("coffee_table", 5.9, 3.35, 0),
  // dining for six
  item("dining_table_oval", 10.8, 3.3, 90),
  item("dining_chair", 10.045, 2.7, 90),
  item("dining_chair", 10.045, 3.3, 90),
  item("dining_chair", 10.045, 3.9, 90),
  item("dining_chair", 11.555, 2.7, 270),
  item("dining_chair", 11.555, 3.3, 270),
  item("dining_chair", 11.555, 3.9, 270),
  against("sideboard", "dining", "south", 0.2),
  // kitchen: a run along the east wall and an island
  item("kitchen_sink_unit", 17.64, 0.75, 270),
  item("kitchen_counter", 17.64, 2.55, 270),
  item("kitchen_hob_unit", 17.64, 4.35, 270),
  item("fridge", 17.6, 5.3, 270),
  item("kitchen_counter", 15.5, 3.3, 90),
  // main bedroom
  against("bed_double", "main", "east", 0.38),
  item("nightstand", 23.7, 2.355, 270),
  item("nightstand", 23.7, 4.505, 270),
  against("sofa", "main", "west", 0.36, 0.1),
  item("rug", 21.2, 3.2, 90),
  item("plant", 18.5, 0.5, 0),
  // study
  against("desk", "study", "west", 0.45),
  against("bookshelf", "study", "east", 0.4),
  against("armchair", "study", "south", 0.82),
  // guest bedroom
  against("bed_double", "guest", "south", 0.5),
  item("nightstand", 5.625, 14.1, 180),
  item("nightstand", 7.775, 14.1, 180),
  against("wardrobe", "guest", "east", 0.25),
  // family bathroom
  against("bathtub", "bath", "south", 0.5),
  against("toilet", "bath", "east", 0.3),
  against("sink", "bath", "west", 0.3),
  // bedroom 3
  against("bed_double", "bed3", "south", 0.5),
  item("nightstand", 12.725, 14.1, 180),
  item("nightstand", 14.875, 14.1, 180),
  against("wardrobe", "bed3", "west", 0.25),
  against("desk", "bed3", "east", 0.3),
  // utility
  against("counter_unit", "utility", "west", 0.6),
  // dressing room
  item("wardrobe", 18.35, 9.95, 90),
  item("wardrobe", 18.35, 11.5, 90),
  item("wardrobe", 18.35, 13.05, 90),
  // en-suite
  against("bathtub", "ensuite", "south", 0.6),
  item("shower", 23.45, 9.4, 270),
  against("sink", "ensuite", "west", 0.25),
  against("sink", "ensuite", "west", 0.45),
  against("toilet", "ensuite", "west", 0.68),
];

/** Cedar Villa as a ready design. */
export function cedarVillaModel(): PlanModel {
  let n = 0;
  return applyBatch(emptyModel(), CEDAR_VILLA, (prefix) => `${prefix}_${(n++).toString(36)}`).model;
}

/** A piece placed on a given floor (by the alias its add_level was given). */
const on = (level: string, kind: string, x: number, y: number, rotation = 0): DesignOperation => ({ op: "place_item", kind, x, y, rotation, level: `$${level}` });

let railings = 0;
/** A run of glass balustrade cut to `width`, on a given floor. */
const glass = (level: string, x: number, y: number, rotation: number, width: number): DesignOperation[] => {
  const as = `rail${railings++}`;
  return [
    { op: "place_item", as, kind: "railing_glass", x, y, rotation, level: `$${level}` },
    { op: "resize_item", id: `$${as}`, w: width },
  ];
};

/**
 * Linden Heights — a three-floor house of about 640 m², built only from the library. The
 * ground floor opens to the north and west: a glazed living room, dining and an island kitchen
 * along the garden front, an entrance hall with the stair, and a study, home cinema, powder
 * room, utility and guest bedroom behind. Upstairs, the main suite with its en-suite and
 * dressing room, three bedrooms and a bathroom, and a stone terrace over the living room. At
 * the top, a sky lounge with a bar, a gym, and a roof terrace. An infinity pool on a stone
 * terrace runs along the west front.
 */
export const LINDEN_HEIGHTS: DesignOperation[] = [
  { op: "rename_plan", name: "Linden Heights" },
  { op: "update_level", id: "ground", height: 3.4 },
  { op: "add_level", as: "first", height: 3.4 },
  { op: "add_level", as: "second", height: 3.4, name: "Second floor" },

  // ---- ground floor -------------------------------------------------------
  {
    op: "build_layout",
    name: "Linden Heights",
    wallHeight: 3,
    rooms: [
      { as: "living", label: "Living room", x: 0, y: 0, w: 9, h: 7, floor: "oak" },
      { as: "dining", label: "Dining", x: 9, y: 0, w: 5, h: 7, floor: "oak" },
      { as: "kitchen", label: "Kitchen", x: 14, y: 0, w: 6, h: 7, floor: "tile" },
      { as: "hall", label: "Entrance hall", x: 0, y: 7, w: 20, h: 2.4, floor: "tile" },
      { as: "study", label: "Study", x: 0, y: 9.4, w: 5, h: 5, floor: "oak" },
      { as: "cinema", label: "Home cinema", x: 5, y: 9.4, w: 5, h: 5, floor: "carpet" },
      { as: "powder", label: "Powder room", x: 10, y: 9.4, w: 2.5, h: 5, floor: "tile" },
      { as: "utility", label: "Utility", x: 12.5, y: 9.4, w: 2.5, h: 5, floor: "tile" },
      { as: "guest", label: "Guest bedroom", x: 15, y: 9.4, w: 5, h: 5, floor: "carpet" },
    ],
    doors: [
      { from: "hall", to: "exterior", side: "west", width: 1.8 },
      { from: "living", to: "exterior", side: "north", width: 2.4, position: 1 },
      { from: "living", to: "hall", width: 1.6, position: 0.3 },
      { from: "dining", to: "living", width: 2.4 },
      { from: "kitchen", to: "dining", width: 1.6 },
      { from: "kitchen", to: "hall", position: 0.85 },
      { from: "study", to: "hall", position: 0.5 },
      { from: "cinema", to: "hall", position: 0.2 },
      { from: "powder", to: "hall", width: 0.8 },
      { from: "utility", to: "hall", width: 0.8 },
      { from: "guest", to: "hall", position: 0.5 },
    ],
    windows: [
      { room: "living", side: "west", width: 4, height: 2.6, sill: 0 },
      { room: "living", side: "north", width: 3.6, height: 2.6, sill: 0.2 },
      { room: "dining", side: "north", width: 3.6, height: 2.6, sill: 0.2 },
      { room: "kitchen", side: "north", width: 2.8, height: 1.4, sill: 1.05 },
      { room: "kitchen", side: "east", width: 2.4, height: 1.4, sill: 1.05 },
      { room: "study", side: "west", width: 2.4, height: 2 },
      { room: "study", side: "south", width: 1.6 },
      { room: "powder", side: "south", width: 0.8, sill: 1.5, height: 0.8 },
      { room: "utility", side: "south", width: 0.6, sill: 1.4, height: 0.9 },
      { room: "guest", side: "south", width: 2.6, height: 1.6 },
      { room: "guest", side: "east", width: 1.6, height: 1.6 },
    ],
  },
  // living: two seating groups facing the glass, a fireplace on the hall wall, a grand piano
  item("rug", 3, 3.5, 90),
  item("sofa_3", 4.3, 3.5, 270),
  item("coffee_table", 3, 3.5, 90),
  item("armchair", 3, 1.6, 0),
  item("armchair", 3, 5.4, 180),
  against("fireplace", "living", "south", 0.75),
  item("grand_piano", 7.3, 2.0, 0),
  item("plant", 0.5, 0.5, 0),
  item("plant", 8.5, 6.5, 0),
  // dining for eight, a sideboard on the hall wall
  item("dining_table_oval", 11.5, 3.2, 90),
  item("dining_chair", 10.745, 2.6, 90),
  item("dining_chair", 10.745, 3.2, 90),
  item("dining_chair", 10.745, 3.8, 90),
  item("dining_chair", 12.255, 2.6, 270),
  item("dining_chair", 12.255, 3.2, 270),
  item("dining_chair", 12.255, 3.8, 270),
  against("sideboard", "dining", "south", 0.4),
  // kitchen: a run along the east wall, an island, a bar against the hall wall
  item("kitchen_sink_unit", 19.58, 0.8, 270),
  item("kitchen_counter", 19.58, 2.6, 270),
  item("kitchen_hob_unit", 19.58, 4.4, 270),
  item("fridge", 19.54, 5.35, 270),
  item("kitchen_island", 16.4, 2.6, 90),
  // hall: the stair climbs east from beside the entrance
  item("stair_straight", 9, 7.65, 270),
  // study, cinema, powder room, utility, guest bedroom
  against("desk", "study", "west", 0.45),
  against("bookshelf", "study", "east", 0.5),
  against("cinema_screen", "cinema", "south", 0.5),
  against("cinema_recliners", "cinema", "north", 0.5, 1),
  against("toilet", "powder", "east", 0.7),
  against("sink", "powder", "west", 0.7),
  against("counter_unit", "utility", "east", 0.7),
  against("bed_double", "guest", "south", 0.5),
  item("nightstand", 16.425, 13.95, 180),
  item("nightstand", 18.575, 13.95, 180),
  against("wardrobe", "guest", "west", 0.35),

  // ---- first floor ----------------------------------------------------------
  {
    op: "build_layout",
    level: "$first",
    wallHeight: 3,
    rooms: [
      { as: "main", label: "Main bedroom", x: 4, y: 0, w: 8, h: 7, floor: "oak" },
      { as: "ensuite", label: "En-suite", x: 12, y: 0, w: 4, h: 7, floor: "tile" },
      { as: "dress", label: "Dressing room", x: 16, y: 0, w: 4, h: 7, floor: "oak" },
      { as: "landing", label: "Landing", x: 4, y: 7, w: 16, h: 2.4, floor: "oak" },
      { as: "bed2", label: "Bedroom 2", x: 4, y: 9.4, w: 5, h: 5, floor: "carpet" },
      { as: "bath2", label: "Bathroom", x: 9, y: 9.4, w: 3, h: 5, floor: "tile" },
      { as: "bed3", label: "Bedroom 3", x: 12, y: 9.4, w: 4, h: 5, floor: "carpet" },
      { as: "bed4", label: "Bedroom 4", x: 16, y: 9.4, w: 4, h: 5, floor: "carpet" },
    ],
    doors: [
      { from: "main", to: "landing", position: 0.2 },
      { from: "main", to: "exterior", side: "west", width: 1.8 },
      { from: "ensuite", to: "main", width: 0.9, position: 0.8 },
      { from: "dress", to: "landing", position: 0.5 },
      { from: "bed2", to: "landing", position: 0.5 },
      { from: "bath2", to: "landing", width: 0.8 },
      { from: "bed3", to: "landing", position: 0.5 },
      { from: "bed4", to: "landing", position: 0.5 },
    ],
    windows: [
      { room: "main", side: "north", width: 4, height: 2.4, sill: 0.2 },
      { room: "ensuite", side: "north", width: 1.6, sill: 1.3, height: 1.1 },
      { room: "dress", side: "north", width: 1.6, sill: 1.2, height: 1 },
      { room: "bed2", side: "south", width: 2.4, height: 1.6 },
      { room: "bed2", side: "west", width: 1.6, height: 1.5 },
      { room: "bath2", side: "south", width: 0.9, sill: 1.4, height: 0.9 },
      { room: "bed3", side: "south", width: 2.4, height: 1.6 },
      { room: "bed4", side: "south", width: 2.4, height: 1.6 },
      { room: "bed4", side: "east", width: 1.6, height: 1.5 },
    ],
  },
  // main suite
  against("bed_double", "main", "east", 0.45),
  on("first", "nightstand", 11.7, 2.19, 270),
  on("first", "nightstand", 11.7, 4.29, 270),
  against("sofa", "main", "south", 0.8),
  on("first", "rug", 9.5, 3.15, 90),
  against("freestanding_tub", "ensuite", "north", 0.5, 0.4),
  against("double_vanity", "ensuite", "south", 0.35),
  against("shower", "ensuite", "east", 0.75),
  against("toilet", "ensuite", "west", 0.2),
  against("walk_in_wardrobe", "dress", "west", 0.5),
  against("walk_in_wardrobe", "dress", "east", 0.5),
  // the landing: the stair to the top floor climbs east from its middle
  on("first", "stair_straight", 15, 7.65, 270),
  // bedrooms and the bathroom
  against("bed_double", "bed2", "south", 0.5),
  on("first", "nightstand", 5.425, 13.95, 180),
  on("first", "nightstand", 7.575, 13.95, 180),
  against("wardrobe", "bed2", "east", 0.3),
  against("bathtub", "bath2", "south", 0.5),
  against("toilet", "bath2", "east", 0.3),
  against("sink", "bath2", "west", 0.3),
  against("bed_double", "bed3", "south", 0.5),
  on("first", "nightstand", 12.925, 13.95, 180),
  on("first", "nightstand", 15.075, 13.95, 180),
  against("bed_double", "bed4", "south", 0.5),
  on("first", "nightstand", 16.925, 13.95, 180),
  on("first", "nightstand", 19.075, 13.95, 180),
  // a stone terrace over the living room, behind glass
  ...[2, 6, 10, 12.4].map((y) => on("first", "stone_terrace", 1.92, y)),
  ...[1, 3, 5, 7, 9, 11, 13].map((y) => on("first", "railing_glass", 0.06, y, 90)),
  ...[1.05, 2.95].flatMap((x) => glass("first", x, 0.06, 0, 1.84)),
  ...[1.05, 2.95].flatMap((x) => glass("first", x, 14.34, 180, 1.84)),
  on("first", "outdoor_sofa", 1.6, 3.5, 90),
  on("first", "planter", 3.0, 0.5, 0),
  on("first", "planter", 3.0, 13.9, 180),

  // ---- second floor ----------------------------------------------------------
  {
    op: "build_layout",
    level: "$second",
    wallHeight: 3,
    rooms: [
      { as: "lounge", label: "Sky lounge", x: 12, y: 0, w: 8, h: 7, floor: "oak" },
      { as: "top", label: "Upper landing", x: 12, y: 7, w: 8, h: 2.4, floor: "oak" },
      { as: "gym", label: "Gym", x: 12, y: 9.4, w: 8, h: 5, floor: "concrete" },
    ],
    doors: [
      { from: "lounge", to: "top", width: 1.6, position: 0.3 },
      { from: "gym", to: "top", position: 0.5 },
      { from: "lounge", to: "exterior", side: "west", width: 2.4, position: 0.8 },
    ],
    windows: [
      { room: "lounge", side: "north", width: 4, height: 2.4, sill: 0.2 },
      { room: "lounge", side: "east", width: 4, height: 2.4, sill: 0.2 },
      { room: "gym", side: "south", width: 4, height: 1.8 },
      { room: "gym", side: "east", width: 3, height: 1.8 },
    ],
  },
  against("sofa_3", "lounge", "south", 0.85),
  on("second", "coffee_table", 17.8, 4.9, 0),
  on("second", "armchair", 17.0, 3.2, 0),
  on("second", "armchair", 18.6, 3.2, 0),
  against("bar_counter", "lounge", "west", 0),
  on("second", "bar_stool", 13.0, 0.9, 270),
  on("second", "bar_stool", 13.0, 1.6, 270),
  // the roof terrace over the first floor's west half
  on("second", "stone_terrace", 6.0, 2.0, 0),
  on("second", "stone_terrace", 6.0, 6.0, 0),
  on("second", "stone_terrace", 6.0, 10.0, 0),
  on("second", "stone_terrace", 6.0, 12.4, 0),
  on("second", "stone_terrace", 10.0, 2.0, 0),
  on("second", "stone_terrace", 10.0, 6.0, 0),
  on("second", "stone_terrace", 10.0, 10.0, 0),
  on("second", "stone_terrace", 10.0, 12.4, 0),
  ...[1, 3, 5, 7, 9, 11, 13].map((y) => on("second", "railing_glass", 4.06, y, 90)),
  ...[5.1, 7.05, 9, 10.95].flatMap((x) => glass("second", x, 0.06, 0, 1.9)),
  ...[5.1, 7.05, 9, 10.95].flatMap((x) => glass("second", x, 14.34, 180, 1.9)),
  on("second", "sun_lounger", 5.5, 4, 0),
  on("second", "sun_lounger", 6.6, 4, 0),
  on("second", "sun_lounger", 7.7, 4, 0),
  on("second", "parasol", 9.8, 4.2, 0),
  on("second", "outdoor_dining", 8, 10.6, 0),
  on("second", "planter", 4.8, 13.9, 180),
  on("second", "planter", 11.0, 13.9, 180),

  // ---- the grounds ----------------------------------------------------------
  // an infinity pool along the west front, on a stone terrace, with loungers
  item("stone_terrace", -2.12, 2, 0),
  item("stone_terrace", -2.12, 6, 0),
  item("stone_terrace", -2.12, 10, 0),
  item("stone_terrace", -2.12, 12.4, 0),
  item("stone_terrace", -6.12, 2, 0),
  item("stone_terrace", -6.12, 6, 0),
  item("stone_terrace", -6.12, 10, 0),
  item("stone_terrace", -6.12, 12.4, 0),
  item("pool_infinity", -5.6, 7.2, 0),
  item("sun_lounger", -2.4, 3.2, 270),
  item("sun_lounger", -2.4, 4.4, 270),
  item("sun_lounger", -2.4, 5.6, 270),
  // a terrace with an outdoor sofa set and a fire pit along the north front
  item("timber_deck", 4, -1.62, 0),
  item("timber_deck", 8, -1.62, 0),
  item("timber_deck", 12, -1.62, 0),
  item("outdoor_sofa", 3.5, -2.6, 0),
  item("fire_pit", 3.5, -1.2, 0),
  item("outdoor_dining", 12.6, -1.6, 0),
  item("parasol", 15.8, -1.8, 0),
  item("planter", 19.2, -3.0, 0),
  // planting: a wide lawn all round, with grown trees out at its edges (their crowns 6 m
  // across, well clear of the house) and none in the view from the north-west front, so they
  // frame the house from behind
  item("tree", 34, -6, 0),
  item("tree", 38, 7, 0),
  item("tree", 33, 22, 0),
  item("tree", 18, 27, 0),
  item("tree", 2, 28, 0),
  item("tree", -14, 24, 0),
  // a clipped hedge along the far side of the east lawn
  ...[3, 5, 7, 9, 11, 13].map((y) => item("hedge", 29, y, 90)),
];

/** Linden Heights as a ready design. */
export function lindenHeightsModel(): PlanModel {
  let n = 0;
  return applyBatch(emptyModel(), LINDEN_HEIGHTS, (prefix) => `${prefix}_${(n++).toString(36)}`).model;
}
