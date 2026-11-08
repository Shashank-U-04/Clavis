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
