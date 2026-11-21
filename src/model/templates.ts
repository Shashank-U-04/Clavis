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
