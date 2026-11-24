/**
 * The way into a room, kept clear by Clavis Local when it places furniture. The validator's
 * door zone (RULES.doorClearDepth) keeps 80 cm in front of a door free; a person stepping
 * through still needs to carry on straight in for a stride or two. Clavis Local holds itself
 * to more than the rule: nothing it places stands in a strip in front of each door, wide
 * enough for a person and deep enough to walk 1.2 m straight in. It is a rule for the engine's
 * own choices, not a finding: furniture a person puts there is their call.
 */

import type { Item, PlanModel } from "../../model/types";
import { catalogByKind, itemSize } from "../../model/catalog";
import { boxesOverlap, type Box } from "../../model/geometry";
import { itemBox, openingCenter } from "../../model/issues";
import { levelOf } from "../../model/levels";

/** From the wall's centre line, how far in front of a door (either side) the strip reaches. */
export const APPROACH_DEPTH = 1.4;
/** Half the strip's width: a person's half-width and a little to spare, never wider than the door. */
const APPROACH_HALF = 0.3;

/** Does this piece stand in the way into any door on its floor? Rugs and low things do not. */
export function blocksApproach(model: PlanModel, it: Item): boolean {
  const cat = catalogByKind(it.kind);
  if (!cat || cat.isRug || cat.stair || (itemSize(it)?.h ?? cat.h) < 0.3) return false;
  const box = itemBox(it);
  if (!box) return false;
  const level = levelOf(it);
  for (const o of model.openings) {
    if (o.kind !== "door") continue;
    const wall = model.walls.find((w) => w.id === o.wallId);
    if (!wall || levelOf(wall) !== level) continue;
    const c = openingCenter(wall, o);
    const strip: Box = { x: c.x, y: c.y, halfW: Math.min(APPROACH_HALF, o.width / 2), halfD: APPROACH_DEPTH, angle: Math.atan2(wall.by - wall.ay, wall.bx - wall.ax) };
    if (boxesOverlap(strip, box)) return true;
  }
  return false;
}
