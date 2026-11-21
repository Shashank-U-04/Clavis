/**
 * The design, as data. Every length is in metres. The plan is drawn on an x/y plane where x
 * grows to the east and y grows to the south (the same way a screen does); the 3D view maps
 * plan y onto world z.
 */

/** A straight wall from point A (ax, ay) to point B (bx, by), drawn on its centreline. */
export interface Wall {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thickness: number;
  height: number;
  /** the level it stands on; absent = the ground floor (see levels.ts) */
  level?: string;
}

export type OpeningKind = "door" | "window";

/** A door or window cut into one wall. */
export interface Opening {
  id: string;
  kind: OpeningKind;
  wallId: string;
  /** where the opening's centre sits along its wall: 0 at A, 1 at B */
  t: number;
  /** clear width of the hole */
  width: number;
  /** height of the bottom edge above the floor (0 for doors) */
  sill: number;
  /** clear height of the hole */
  height: number;
  /** doors: the jamb that carries the hinges — at the A end (default) or the B end */
  hinge?: "a" | "b";
  /** doors: which way the leaf opens for someone walking from A to B (default right) */
  side?: "left" | "right";
}

/** A room's clear floor: an axis-aligned rectangle inside the wall faces. */
export interface Room {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** floor finish: oak | tile | carpet | concrete */
  floor: string;
  /** the level it is on; absent = the ground floor */
  level?: string;
}

/** A piece of furniture from the catalog, placed by its centre. */
export interface Item {
  id: string;
  kind: string;
  x: number;
  y: number;
  /** degrees; the direction the front faces — 0 south, 90 east, 180 north, 270 west */
  rotation: number;
  /** this piece's own size, when the person changed it; otherwise the catalog's (see itemSize) */
  w?: number;
  d?: number;
  h?: number;
  /** the level it stands on; absent = the ground floor */
  level?: string;
}

/** One floor of a building (see levels.ts). */
export interface Level {
  id: string;
  name: string;
  /** metres from the ground to this floor's top surface */
  elevation: number;
  /** floor to floor, metres */
  height: number;
}

/** A reference image (for example a scanned plan) laid under the drawing for tracing. */
export interface Underlay {
  dataUrl: string;
  opacity: number;
  /** the plan rectangle the image is stretched over */
  x: number;
  y: number;
  w: number;
  h: number;
  /** pixel size of the stored (re-encoded) image */
  pw?: number;
  ph?: number;
}

/** A remark attached to the design. */
export interface Note {
  id: string;
  /** "agent" is accepted so files written by older builds still open */
  author: "human" | "agent";
  text: string;
  at: number;
}

export interface PlanModel {
  name: string;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  underlay: Underlay | null;
  /** the floors, ground up; absent = a single ground floor */
  levels?: Level[];
}

/** Who made a change shown in the activity feed. */
export type ActorSource = "human" | "assistant" | "system";

export interface ActivityEntry {
  id: string;
  at: number;
  source: ActorSource;
  /** short machine-readable label of the action, e.g. "move_item" */
  tool: string;
  summary: string;
  ok: boolean;
}

/**
 * How serious a validation finding is:
 *  - error:   the geometry or a relationship is broken;
 *  - warning: likely a problem a person should look at;
 *  - info:    an observation; never blocks anything.
 */
export type IssueSeverity = "error" | "warning" | "info";

export interface Issue {
  /** derived from the finding itself, so the same design always yields the same ids */
  id: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  /** ids of the walls, openings, rooms or items involved */
  refs: string[];
  /** the numbers behind the finding (metres unless the key says otherwise) */
  measurements?: Record<string, number | string>;
}

export const emptyModel = (): PlanModel => ({
  name: "Untitled plan",
  walls: [],
  openings: [],
  rooms: [],
  items: [],
  underlay: null,
});
