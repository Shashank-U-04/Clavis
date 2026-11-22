/**
 * Furniture catalog — footprints (metres) and display metadata. 3D builders live in three/furniture.ts.
 *
 * Every kind has a procedural 3D model in three/furniture.ts. Sizes are typical nominal
 * dimensions for the category, chosen by hand — they are NOT measurements of a
 * specific product, and the catalog says so (`dimensionSource: "nominal"`). No prices or supplier
 * links are attached because none were verified.
 */

export type CatalogCategory = "living" | "bedroom" | "kitchen" | "bath" | "office" | "decor" | "structure" | "outdoor";

/** Where an entry's dimensions come from. Only "verified" may be presented as a real product size. */
export type DimensionSource = "verified" | "nominal";

export interface CatalogEntry {
  kind: string; // stable id
  label: string;
  w: number; // footprint width  (local x), metres
  d: number; // footprint depth  (local y), metres
  h: number; // height, metres
  color: string;
  category: CatalogCategory;
  /** rugs may overlap other furniture */
  isRug?: boolean;
  /** a stair: it climbs from the floor it stands on to the floor above, from its front edge to its back (see model/stairs.ts) */
  stair?: "straight" | "spiral";
  /**
   * A piece whose top spreads wider than what stands on the ground (a tree): `w` × `d` is the
   * crown, and this is the width of the trunk. Walls, doorways and other pieces are checked
   * against the trunk; the crown may spread over them, as a real tree's does.
   */
  trunk?: number;
  dimensionSource: DimensionSource;
  /** the 3D asset: procedural geometry in three/furniture.ts */
  asset: { source: string; license: string };
  price?: { amount: number; currency: string };
  supplierUrl?: string;
  tags?: string[];
}

const PROCEDURAL_ASSET = { source: "procedural model (three/furniture.ts)", license: "MIT" } as const;

type Base = Omit<CatalogEntry, "dimensionSource" | "asset">;

const entry = (e: Base): CatalogEntry => ({ ...e, dimensionSource: "nominal", asset: PROCEDURAL_ASSET });

export const CATALOG: readonly CatalogEntry[] = [
  entry({ kind: "sofa", label: "Sofa", w: 2.1, d: 0.9, h: 0.85, color: "#7a8ba0", category: "living", tags: ["seating"] }),
  entry({ kind: "sofa_3", label: "Sofa (3-seat)", w: 2.6, d: 0.95, h: 0.82, color: "#6f8095", category: "living", tags: ["seating"] }),
  entry({ kind: "armchair", label: "Armchair", w: 0.85, d: 0.85, h: 0.85, color: "#8a9bb0", category: "living", tags: ["seating", "chair"] }),
  entry({ kind: "coffee_table", label: "Coffee table", w: 1.1, d: 0.55, h: 0.42, color: "#a08050", category: "living", tags: ["table"] }),
  entry({ kind: "side_table", label: "Side table", w: 0.5, d: 0.5, h: 0.5, color: "#9a7b52", category: "living", tags: ["table"] }),
  entry({ kind: "sideboard", label: "Sideboard", w: 2.2, d: 0.42, h: 0.75, color: "#7d6a54", category: "living", tags: ["storage"] }),
  entry({ kind: "tv_sideboard", label: "Sideboard + TV", w: 2.2, d: 0.42, h: 1.42, color: "#6c5c49", category: "living", tags: ["storage", "media"] }),
  entry({ kind: "tv_stand", label: "TV stand", w: 1.6, d: 0.4, h: 0.5, color: "#5c5148", category: "living", tags: ["media"] }),
  entry({ kind: "bookshelf", label: "Bookshelf", w: 0.9, d: 0.32, h: 1.9, color: "#8b6f4e", category: "living", tags: ["shelving", "storage"] }),
  entry({ kind: "rug", label: "Rug", w: 2.4, d: 1.7, h: 0.02, color: "#b0987f", category: "living", isRug: true }),
  entry({ kind: "bed_double", label: "Double bed", w: 1.6, d: 2.05, h: 0.55, color: "#9aa5b5", category: "bedroom", tags: ["bed"] }),
  entry({ kind: "bed_single", label: "Single bed", w: 0.9, d: 1.9, h: 0.5, color: "#a3adbb", category: "bedroom", tags: ["bed"] }),
  entry({ kind: "nightstand", label: "Nightstand", w: 0.45, d: 0.4, h: 0.55, color: "#7c6a54", category: "bedroom", tags: ["storage"] }),
  entry({ kind: "wardrobe", label: "Wardrobe", w: 1.5, d: 0.6, h: 2.1, color: "#6f6156", category: "bedroom", tags: ["storage"] }),
  entry({ kind: "desk", label: "Desk", w: 1.3, d: 0.65, h: 0.75, color: "#a58a66", category: "office", tags: ["table", "study"] }),
  entry({ kind: "office_chair", label: "Office chair", w: 0.6, d: 0.6, h: 1.0, color: "#4a4f58", category: "office", tags: ["seating", "chair", "study"] }),
  entry({ kind: "dining_table", label: "Dining table", w: 1.6, d: 0.9, h: 0.75, color: "#b08d5f", category: "kitchen", tags: ["table", "dining"] }),
  entry({ kind: "dining_table_oval", label: "Oval dining table", w: 1.9, d: 1.0, h: 0.75, color: "#b08d5f", category: "kitchen", tags: ["table", "dining"] }),
  entry({ kind: "dining_chair", label: "Dining chair", w: 0.45, d: 0.45, h: 0.9, color: "#96754e", category: "kitchen", tags: ["seating", "chair", "dining"] }),
  entry({ kind: "kitchen_counter", label: "Kitchen counter", w: 2.4, d: 0.62, h: 0.9, color: "#c9c2b8", category: "kitchen", tags: ["counter"] }),
  entry({ kind: "counter_unit", label: "Counter unit", w: 1.2, d: 0.62, h: 0.9, color: "#c9c2b8", category: "kitchen", tags: ["counter"] }),
  entry({ kind: "kitchen_sink_unit", label: "Sink unit", w: 1.2, d: 0.62, h: 0.9, color: "#c4cdd2", category: "kitchen", tags: ["counter"] }),
  entry({ kind: "kitchen_hob_unit", label: "Hob + oven unit", w: 1.2, d: 0.62, h: 0.9, color: "#b6b2ab", category: "kitchen", tags: ["counter", "appliance"] }),
  entry({ kind: "fridge", label: "Fridge", w: 0.7, d: 0.7, h: 1.85, color: "#d8dde2", category: "kitchen", tags: ["appliance"] }),
  entry({ kind: "bathtub", label: "Bathtub", w: 1.7, d: 0.75, h: 0.55, color: "#e2e8ec", category: "bath", tags: ["fixture"] }),
  entry({ kind: "corner_bath", label: "Corner bath", w: 1.4, d: 1.4, h: 0.55, color: "#e2e8ec", category: "bath", tags: ["fixture"] }),
  entry({ kind: "shower", label: "Shower", w: 0.9, d: 0.9, h: 2.0, color: "#cfdde6", category: "bath", tags: ["fixture"] }),
  entry({ kind: "toilet", label: "Toilet", w: 0.38, d: 0.65, h: 0.78, color: "#eef1f3", category: "bath", tags: ["fixture"] }),
  entry({ kind: "sink", label: "Washbasin", w: 0.55, d: 0.42, h: 0.85, color: "#e7ebee", category: "bath", tags: ["fixture"] }),
  entry({ kind: "towel_rail", label: "Towel rail", w: 0.6, d: 0.12, h: 1.1, color: "#c8ccd0", category: "bath" }),
  entry({ kind: "plant", label: "Plant", w: 0.5, d: 0.5, h: 0.9, color: "#5d8a54", category: "decor" }),
  // stairs climb one floor; their height follows the floor they climb to
  entry({ kind: "stair_straight", label: "Straight stair", w: 1.0, d: 3.8, h: 3.0, color: "#c9b79c", category: "structure", tags: ["stair"], stair: "straight" }),
  entry({ kind: "stair_spiral", label: "Spiral stair", w: 1.8, d: 1.8, h: 3.0, color: "#8d9196", category: "structure", tags: ["stair"], stair: "spiral" }),
  // railings and structure: drawn along a balcony, a terrace or a void; stretch the width to fit
  entry({ kind: "railing_glass", label: "Glass balustrade", w: 2.0, d: 0.06, h: 1.0, color: "#cfe3ea", category: "structure", tags: ["railing"] }),
  entry({ kind: "railing_steel", label: "Steel railing", w: 2.0, d: 0.06, h: 1.0, color: "#2c2f33", category: "structure", tags: ["railing"] }),
  entry({ kind: "glass_wall", label: "Glass wall", w: 2.4, d: 0.08, h: 2.6, color: "#cfe3ea", category: "structure", tags: ["facade", "glazing"] }),
  entry({ kind: "cladding", label: "Timber cladding", w: 2.0, d: 0.08, h: 2.6, color: "#8a5f3c", category: "structure", tags: ["facade"] }),
  entry({ kind: "column", label: "Column", w: 0.3, d: 0.3, h: 2.7, color: "#e9e6df", category: "structure", tags: ["structure"] }),
  entry({ kind: "pergola", label: "Pergola", w: 3.6, d: 3.0, h: 2.6, color: "#3a3d41", category: "structure", tags: ["canopy", "shade"] }),
  // outdoor and pool: these belong outside, so they may stand beyond the rooms
  entry({ kind: "pool", label: "Pool", w: 4.0, d: 8.0, h: 0.15, color: "#3d9cc9", category: "outdoor", tags: ["pool", "water"], isRug: true }),
  entry({ kind: "pool_infinity", label: "Infinity pool", w: 3.6, d: 10.0, h: 0.15, color: "#2f8fc0", category: "outdoor", tags: ["pool", "water"], isRug: true }),
  entry({ kind: "stone_terrace", label: "Stone terrace", w: 4.0, d: 4.0, h: 0.06, color: "#ddd7cb", category: "outdoor", tags: ["paving"], isRug: true }),
  entry({ kind: "timber_deck", label: "Timber deck", w: 4.0, d: 3.0, h: 0.08, color: "#a87c55", category: "outdoor", tags: ["paving"], isRug: true }),
  entry({ kind: "sun_lounger", label: "Sun lounger", w: 0.7, d: 1.95, h: 0.35, color: "#f2f0ea", category: "outdoor", tags: ["seating"] }),
  entry({ kind: "outdoor_sofa", label: "Outdoor sofa", w: 2.2, d: 0.9, h: 0.72, color: "#4a4d52", category: "outdoor", tags: ["seating"] }),
  entry({ kind: "outdoor_dining", label: "Outdoor dining table", w: 2.2, d: 1.0, h: 0.75, color: "#3a3d41", category: "outdoor", tags: ["table"] }),
  entry({ kind: "parasol", label: "Parasol", w: 2.6, d: 2.6, h: 2.5, color: "#f1ede4", category: "outdoor", tags: ["shade"] }),
  entry({ kind: "fire_pit", label: "Fire pit", w: 1.0, d: 1.0, h: 0.4, color: "#5a5c60", category: "outdoor", tags: ["fixture"] }),
  entry({ kind: "planter", label: "Planter", w: 1.2, d: 0.5, h: 0.7, color: "#5f7f4c", category: "outdoor", tags: ["planting"] }),
  entry({ kind: "hedge", label: "Hedge", w: 2.0, d: 0.6, h: 1.2, color: "#5f7f4c", category: "outdoor", tags: ["planting"] }),
  entry({ kind: "tree", label: "Tree", w: 6, d: 6, h: 9, color: "#5b8a4a", category: "outdoor", tags: ["planting"], trunk: 0.6 }),
  // the finer rooms of a large house
  entry({ kind: "kitchen_island", label: "Kitchen island", w: 2.6, d: 1.1, h: 0.92, color: "#e9e6df", category: "kitchen", tags: ["counter", "luxury"] }),
  entry({ kind: "bar_counter", label: "Bar", w: 2.0, d: 0.6, h: 1.1, color: "#3a2f28", category: "kitchen", tags: ["counter", "luxury"] }),
  entry({ kind: "bar_stool", label: "Bar stool", w: 0.45, d: 0.45, h: 0.78, color: "#2f2d2b", category: "kitchen", tags: ["seating", "chair"] }),
  entry({ kind: "double_vanity", label: "Double vanity", w: 1.6, d: 0.55, h: 0.9, color: "#e9e6df", category: "bath", tags: ["fixture", "luxury"] }),
  entry({ kind: "freestanding_tub", label: "Freestanding bath", w: 1.7, d: 0.8, h: 0.6, color: "#f4f4f2", category: "bath", tags: ["fixture", "luxury"] }),
  entry({ kind: "walk_in_wardrobe", label: "Walk-in wardrobe", w: 2.4, d: 0.6, h: 2.4, color: "#b49a7c", category: "bedroom", tags: ["storage", "luxury"] }),
  entry({ kind: "fireplace", label: "Fireplace", w: 1.8, d: 0.45, h: 1.2, color: "#4a4744", category: "living", tags: ["fixture", "luxury"] }),
  entry({ kind: "grand_piano", label: "Grand piano", w: 1.5, d: 1.9, h: 1.0, color: "#141414", category: "living", tags: ["luxury"] }),
  entry({ kind: "cinema_screen", label: "Projector screen", w: 3.0, d: 0.15, h: 2.0, color: "#f4f4f2", category: "living", tags: ["media", "luxury"] }),
  entry({ kind: "cinema_recliners", label: "Cinema recliners", w: 2.8, d: 1.0, h: 1.0, color: "#3d2f2a", category: "living", tags: ["seating", "luxury"] }),
];

export const CATEGORIES: readonly CatalogCategory[] = ["living", "bedroom", "kitchen", "bath", "office", "decor", "structure", "outdoor"];

const byKind = new Map(CATALOG.map((c) => [c.kind, c]));

export const catalogByKind = (kind: string): CatalogEntry | undefined => byKind.get(kind);

/** The limits a person can resize a piece to, in metres. */
export const ITEM_SIZE_LIMITS = { min: 0.1, maxPlan: 6, maxHeight: 3.5 } as const;

/**
 * A placed piece's real size: its own width, depth and height where the person changed them,
 * otherwise the catalog's. Every drawing, check and 3D model goes through this.
 */
export function itemSize(it: { kind: string; w?: number; d?: number; h?: number }): { w: number; d: number; h: number } | null {
  const c = byKind.get(it.kind);
  if (!c) return null;
  return { w: it.w ?? c.w, d: it.d ?? c.d, h: it.h ?? c.h };
}

/** Whether a piece has been resized away from its catalog size. */
export const isResized = (it: { kind: string; w?: number; d?: number; h?: number }): boolean => it.w !== undefined || it.d !== undefined || it.h !== undefined;
