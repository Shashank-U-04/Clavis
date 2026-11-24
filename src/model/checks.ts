/**
 * Every finding the validator can report, by code. The site quotes how many there are, and a
 * test keeps this list in step with the codes the engine actually emits.
 */
export const CHECK_CODES = [
  // geometry and relationships (issues.ts)
  "invalid_dimension",
  "wall_too_short",
  "walls_overlap_collinear",
  "walls_cross",
  "wall_loose_end",
  "opening_orphan",
  "opening_overflow",
  "opening_too_tall",
  "door_narrow",
  "openings_overlap",
  "wall_ends_in_opening",
  "room_too_small",
  "room_floating",
  "room_no_door",
  "room_no_window",
  "rooms_overlap",
  "item_unknown",
  "item_through_wall",
  "item_blocks_door",
  "item_in_door_swing",
  "item_blocks_window",
  "items_overlap",
  "item_outside_rooms",
  "item_outside_room",
  // circulation and habitability (analysis.ts)
  "no_entrance",
  "room_unreachable",
  "route_through_private",
  "room_low_daylight",
  "bedroom_no_escape_window",
  "bath_needs_extract",
  "room_undersized",
  // floors (analysis.ts)
  "stair_no_floor_above",
  "stair_lands_nowhere",
  "stair_starts_nowhere",
  "door_onto_stairwell",
  // people (issues.ts, walkable.ts)
  "room_not_walkable",
] as const;

export const CHECK_COUNT = CHECK_CODES.length;
