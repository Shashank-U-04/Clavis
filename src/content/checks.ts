/**
 * Plain-language descriptions of every validator check, for the website. The thresholds are
 * read from the engine itself so the text never disagrees with what it measures.
 */

import type { CHECK_CODES } from "@/model/checks";
import { HABITABILITY } from "@/model/analysis";
import { RULES } from "@/model/issues";
import { MIN_REACH } from "@/model/walkable";

type Code = (typeof CHECK_CODES)[number];
export type CheckGroup = "Walls" | "Doors and windows" | "Rooms" | "Furniture" | "Circulation" | "Habitability" | "Floors";

const pct = (v: number) => `${Math.round(v * 100)} %`;
const cm = (v: number) => `${Math.round(v * 100)} cm`;
const esc = HABITABILITY.escapeWindow;
const bed = HABITABILITY.minSize.bedroom!;

export const CHECKS: Record<Code, { group: CheckGroup; text: string; severity: "error" | "warning" | "info" }> = {
  invalid_dimension: { group: "Walls", severity: "error", text: "A size or position is missing or impossible, so nothing else is measured until it is fixed." },
  wall_too_short: { group: "Walls", severity: "error", text: `A wall shorter than ${cm(RULES.minWallLength)}.` },
  walls_overlap_collinear: { group: "Walls", severity: "error", text: "Two walls run on top of each other." },
  walls_cross: { group: "Walls", severity: "error", text: "Two walls cut through each other mid-span (corners and T-junctions are fine)." },
  wall_loose_end: { group: "Walls", severity: "warning", text: "A wall stops without meeting another wall." },
  opening_orphan: { group: "Doors and windows", severity: "error", text: "A door or window sits on a wall that no longer exists." },
  opening_overflow: { group: "Doors and windows", severity: "error", text: "A door or window runs past the end of its wall." },
  opening_too_tall: { group: "Doors and windows", severity: "error", text: "An opening reaches above the top of its wall." },
  door_narrow: { group: "Doors and windows", severity: "warning", text: `A door narrower than ${cm(RULES.minDoorWidth)}.` },
  openings_overlap: { group: "Doors and windows", severity: "error", text: "Two openings overlap on the same wall." },
  wall_ends_in_opening: { group: "Doors and windows", severity: "error", text: "Another wall ends in the middle of a door or window." },
  room_too_small: { group: "Rooms", severity: "error", text: "A room smaller than 0.5 × 0.5 m." },
  room_floating: { group: "Rooms", severity: "warning", text: "A room with no walls around it." },
  room_no_door: { group: "Rooms", severity: "warning", text: "A room you cannot get into: no door on its boundary." },
  room_no_window: { group: "Rooms", severity: "warning", text: "A bedroom, living room or study without a window." },
  rooms_overlap: { group: "Rooms", severity: "error", text: "Two rooms claim the same floor." },
  item_unknown: { group: "Furniture", severity: "error", text: "A piece that is not in the catalog." },
  item_through_wall: { group: "Furniture", severity: "error", text: `Furniture that goes through a wall (leaning on it, up to 2 cm, is fine).` },
  item_in_door_swing: { group: "Furniture", severity: "error", text: "Furniture where a door's leaf swings open, so the door cannot open fully." },
  item_blocks_door: { group: "Furniture", severity: "error", text: `Furniture inside the ${cm(RULES.doorClearDepth)} kept clear in front of a door.` },
  item_blocks_window: { group: "Furniture", severity: "warning", text: `Something taller than the sill within ${cm(RULES.windowClearDepth)} of a window.` },
  items_overlap: { group: "Furniture", severity: "error", text: "Two pieces occupy the same space (rugs may lie underneath)." },
  item_outside_rooms: { group: "Furniture", severity: "warning", text: "A piece standing outside every room." },
  item_outside_room: { group: "Furniture", severity: "warning", text: `A piece that sticks more than ${cm(RULES.roomEdgeTolerance)} out of its room.` },
  no_entrance: { group: "Circulation", severity: "warning", text: "No door leads outside." },
  room_unreachable: { group: "Circulation", severity: "warning", text: "A room whose door does not connect back to the entrance." },
  route_through_private: { group: "Circulation", severity: "info", text: "A room you can only reach through a bedroom or bathroom." },
  room_not_walkable: { group: "Circulation", severity: "warning", text: `A furnished room a person cannot walk through on a ${cm(RULES.walkPath)} path: a door that cannot be reached from another, or less than ${pct(MIN_REACH)} of the free floor reachable from the door.` },
  room_low_daylight: { group: "Habitability", severity: "warning", text: `A habitable room with less than ${pct(HABITABILITY.minDaylightRatio)} glazing for its floor area.` },
  bedroom_no_escape_window: {
    group: "Habitability",
    severity: "warning",
    text: `A bedroom without a window of at least ${esc.minWidth} × ${esc.minHeight} m with a sill at most ${esc.maxSill} m high, to climb out in an emergency.`,
  },
  bath_needs_extract: { group: "Habitability", severity: "info", text: "A windowless bathroom: plan mechanical extract ventilation." },
  room_undersized: { group: "Habitability", severity: "warning", text: `A room below typical sizes — for a bedroom, ${bed.area} m² and a ${bed.side} m short side.` },
  stair_no_floor_above: { group: "Floors", severity: "warning", text: "A stair on the top floor, climbing to nothing." },
  stair_lands_nowhere: { group: "Floors", severity: "warning", text: "A stair whose top arrives outside every room on the floor above." },
  stair_starts_nowhere: { group: "Floors", severity: "warning", text: "A stair whose foot starts outside every room on its own floor." },
  door_onto_stairwell: { group: "Floors", severity: "error", text: `A door upstairs whose ${cm(RULES.doorClearDepth)} clear zone reaches over the opening a stair comes up through.` },
};

export const GROUPS: CheckGroup[] = ["Walls", "Doors and windows", "Rooms", "Furniture", "Circulation", "Habitability"];
