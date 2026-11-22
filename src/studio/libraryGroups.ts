/**
 * The groups down the studio's left side, in the order a home is put together: the building
 * (walls, rooms, doors, windows, stairs) and then the furniture, room by room. Each opens its
 * own shelf in the library beside the strip.
 */

import type { CatalogCategory } from "../model/catalog";

export type GroupId = "walls" | "rooms" | "doors" | "windows" | "stairs" | CatalogCategory;

export const BUILD_GROUPS = ["walls", "rooms", "doors", "windows", "stairs"] as const satisfies readonly GroupId[];
export const FURNISH_GROUPS = ["living", "bedroom", "kitchen", "bath", "office", "decor", "structure", "outdoor"] as const satisfies readonly GroupId[];
export const GROUP_IDS: readonly GroupId[] = [...BUILD_GROUPS, ...FURNISH_GROUPS];

export const isGroupId = (v: unknown): v is GroupId => typeof v === "string" && (GROUP_IDS as readonly string[]).includes(v);

export const GROUP_LABEL: Record<GroupId, string> = {
  walls: "Walls",
  rooms: "Rooms",
  doors: "Doors",
  windows: "Windows",
  stairs: "Stairs",
  living: "Living",
  bedroom: "Bedroom",
  kitchen: "Kitchen & dining",
  bath: "Bathroom",
  office: "Office",
  decor: "Decor & lighting",
  structure: "Railings & structure",
  outdoor: "Garden & pool",
};
