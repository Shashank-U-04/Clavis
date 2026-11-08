/**
 * Furniture catalog — footprints (metres) and display metadata. 3D builders live in three/furniture.ts.
 *
 * Every kind has a procedural 3D model in three/furniture.ts. Sizes are typical nominal
 * dimensions for the category, chosen by hand — they are NOT measurements of a
 * specific product, and the catalog says so (`dimensionSource: "nominal"`). No prices or supplier
 * links are attached because none were verified.
 */

export type CatalogCategory = "living" | "bedroom" | "kitchen" | "bath" | "office" | "decor";

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
  entry({ kind: "plant", label: "Plant", w: 0.4, d: 0.4, h: 1.1, color: "#5d8a54", category: "decor" }),
];

export const CATEGORIES: readonly CatalogCategory[] = ["living", "bedroom", "kitchen", "bath", "office", "decor"];

const byKind = new Map(CATALOG.map((c) => [c.kind, c]));

export const catalogByKind = (kind: string): CatalogEntry | undefined => byKind.get(kind);

/** Case-insensitive search over label, kind, category and tags; optional footprint limits in metres. */
export function searchCatalog(q: { text?: string; category?: CatalogCategory; maxWidth?: number; maxDepth?: number }): CatalogEntry[] {
  const text = q.text?.trim().toLowerCase();
  return CATALOG.filter((c) => {
    if (q.category && c.category !== q.category) return false;
    if (q.maxWidth !== undefined && c.w > q.maxWidth) return false;
    if (q.maxDepth !== undefined && c.d > q.maxDepth) return false;
    if (!text) return true;
    return [c.label, c.kind, c.category, ...(c.tags ?? [])].some((s) => s.toLowerCase().includes(text));
  });
}
