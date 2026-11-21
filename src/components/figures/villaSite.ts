/**
 * The grounds of Cedar Villa, for the landing page's drawing: a stone terrace wrapping the
 * north and west fronts, a pool along the glass wall of the living room, loungers and an
 * outdoor table, a lawn, and hedges and trees along the far boundary. Plan metres, like the
 * design itself (x east, y south); the house is 24 × 14.4 m from (0, 0).
 *
 * These are drawn, not designed: the validator never sees them, and the studio's copy of the
 * villa is the house alone.
 */

import type { SitePiece } from "./sunsetFigure";

const E = 0.12; // the outer face of the exterior walls, beyond the centreline
const DECK = 0.15;

// the pool: 4.2 × 9 m, set into the west terrace in front of the living room's glass wall
const pool = { x0: -5.8, x1: -1.6, y0: 0.4, y1: 9.4 };

const deck = (id: string, x0: number, y0: number, x1: number, y1: number, label?: string): SitePiece => ({ id, kind: "deck", x0, y0, x1, y1, z1: DECK, ...(label && { label }) });

/** A sun lounger: a low frame with its back raised at the pool end. */
const lounger = (n: number, x: number, y0: number): SitePiece[] => [
  { id: `lounger${n}:base`, kind: "item", x0: x, x1: x + 0.7, y0, y1: y0 + 1.9, z0: DECK, z1: DECK + 0.32 },
  { id: `lounger${n}:back`, kind: "item", x0: x, x1: x + 0.7, y0, y1: y0 + 0.55, z0: DECK + 0.32, z1: DECK + 0.62 },
];

/** A tree, the way a model maker builds one: a trunk and two stacked blocks of canopy. */
const tree = (n: number, x: number, y: number, size = 2.6): SitePiece[] => [
  { id: `tree${n}:trunk`, kind: "item", x0: x - 0.15, x1: x + 0.15, y0: y - 0.15, y1: y + 0.15, z1: 1.5 },
  { id: `tree${n}:low`, kind: "tree", x0: x - size / 2, x1: x + size / 2, y0: y - size / 2, y1: y + size / 2, z0: 1.5, z1: 2.7 },
  { id: `tree${n}:high`, kind: "tree", x0: x - size / 3, x1: x + size / 3, y0: y - size / 3, y1: y + size / 3, z0: 2.7, z1: 3.4 },
];

export const VILLA_SITE: readonly SitePiece[] = [
  { id: "lawn", kind: "lawn", x0: -9, x1: 27.5, y0: -6.5, y1: 17.5, z1: 0.005 },

  // the west terrace around the pool, and the north terrace along the day rooms
  deck("terrace_w", -7.2, -4.6, pool.x0, 10.8),
  deck("terrace_e", pool.x1, -4.6, -E, 10.8),
  deck("terrace_pn", pool.x0, -4.6, pool.x1, pool.y0),
  deck("terrace_ps", pool.x0, pool.y1, pool.x1, 10.8),
  deck("terrace_n", -E, -4.6, 18, -E, "Terrace"),
  { id: "pool", kind: "water", x0: pool.x0, x1: pool.x1, y0: pool.y0, y1: pool.y1, z1: 0.08, label: "Pool" },

  // loungers along the pool's far side, facing the evening sun
  ...lounger(1, -7.0, 1.6),
  ...lounger(2, -7.0, 4.2),
  ...lounger(3, -7.0, 6.8),

  // an outdoor table for eight in front of the dining room
  { id: "table_out:top", kind: "item", x0: 9.6, x1: 12.0, y0: -3.0, y1: -2.0, z0: DECK, z1: DECK + 0.75 },
  ...[9.85, 10.55, 11.25].flatMap((x, i) => [
    { id: `chair_out${i}n:seat`, kind: "item" as const, x0: x, x1: x + 0.45, y0: -3.6, y1: -3.15, z0: DECK, z1: DECK + 0.45 },
    { id: `chair_out${i}s:seat`, kind: "item" as const, x0: x, x1: x + 0.45, y0: -1.85, y1: -1.4, z0: DECK, z1: DECK + 0.45 },
  ]),

  // planters at the corners of the north terrace
  { id: "planter1", kind: "hedge", x0: 16.6, x1: 17.8, y0: -4.4, y1: -3.6, z0: DECK, z1: DECK + 0.7 },
  { id: "planter2", kind: "hedge", x0: 0.4, x1: 1.6, y0: -4.4, y1: -3.6, z0: DECK, z1: DECK + 0.7 },

  // hedges along the far boundaries, trees in the far corners and behind the house
  { id: "hedge_s", kind: "hedge", x0: -9, x1: 26.8, y0: 16.8, y1: 17.5, z1: 1.1 },
  { id: "hedge_e", kind: "hedge", x0: 26.8, x1: 27.5, y0: -6.5, y1: 17.5, z1: 1.1 },
  ...tree(1, 25.2, -4.4, 2.8),
  ...tree(2, 25.4, 15.4),
  ...tree(3, 8.5, 15.6, 2.2),
  ...tree(4, -7.6, 15.2, 2.4),
];
