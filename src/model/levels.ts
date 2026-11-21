/**
 * Floors. A design has one or more levels stacked from the ground up; every wall, room and
 * piece of furniture stands on one of them (a door or window is on its wall's level). A design
 * that never mentions levels is a single ground floor, so every older design and file means
 * what it always meant.
 *
 * Plan coordinates are shared by all levels: a wall at (2, 3) upstairs stands over (2, 3) on
 * the ground floor. Each level sits `elevation` metres above the ground; `height` is floor to
 * floor (the walls plus the slab above them).
 */

import type { Item, Level, PlanModel, Room, Wall } from "./types";

export const GROUND = "ground";
export const DEFAULT_STOREY = 3.0;

const groundLevel = (): Level => ({ id: GROUND, name: "Ground floor", elevation: 0, height: DEFAULT_STOREY });

/** The design's levels from the ground up (a design without any is a single ground floor). */
export function levelsOf(model: Pick<PlanModel, "levels">): Level[] {
  const list = model.levels?.length ? [...model.levels] : [groundLevel()];
  return list.sort((a, b) => a.elevation - b.elevation);
}

/** The level an entity stands on. */
export const levelOf = (e: Pick<Wall | Room | Item, "level">): string => e.level ?? GROUND;

export function levelById(model: Pick<PlanModel, "levels">, id: string): Level | undefined {
  return levelsOf(model).find((l) => l.id === id);
}

/** How far above the ground a level's floor is (0 for an unknown level). */
export const elevationOf = (model: Pick<PlanModel, "levels">, id: string): number => levelById(model, id)?.elevation ?? 0;

/** The level directly above `id`, if there is one. */
export function levelAbove(model: Pick<PlanModel, "levels">, id: string): Level | undefined {
  const list = levelsOf(model);
  const i = list.findIndex((l) => l.id === id);
  return i >= 0 ? list[i + 1] : undefined;
}

/** The level directly below `id`, if there is one. */
export function levelBelow(model: Pick<PlanModel, "levels">, id: string): Level | undefined {
  const list = levelsOf(model);
  const i = list.findIndex((l) => l.id === id);
  return i > 0 ? list[i - 1] : undefined;
}

/** Only what stands on one level: its walls (with their openings), rooms and furniture. */
export function onLevel(model: PlanModel, id: string): PlanModel {
  const walls = model.walls.filter((w) => levelOf(w) === id);
  const wallIds = new Set(walls.map((w) => w.id));
  return {
    ...model,
    walls,
    openings: model.openings.filter((o) => wallIds.has(o.wallId)),
    rooms: model.rooms.filter((r) => levelOf(r) === id),
    items: model.items.filter((it) => levelOf(it) === id),
  };
}

/** Whether the design has more than one floor. */
export const isMultiLevel = (model: Pick<PlanModel, "levels">) => levelsOf(model).length > 1;

/** The `level` field to store on a new entity: nothing for the ground floor, so single-floor designs stay unchanged. */
export const tagLevel = (id: string | undefined): { level?: string } => (id && id !== GROUND ? { level: id } : {});

/** A name for the next floor up: "First floor", "Second floor"… then "Floor 6". */
export function nextLevelName(count: number): string {
  const names = ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor", "Fifth floor"];
  return names[count] ?? `Floor ${count}`;
}
