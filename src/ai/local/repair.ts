/**
 * Deterministic repairs. Each validation finding with a mechanical fix gets a small search:
 * candidate edits are tried on the trial model, and the first one that clears the finding
 * without introducing any other error or warning is kept. Findings that need a design
 * decision (a room that is too small, crossing walls) are reported, not guessed at.
 */

import type { Issue, Opening, PlanModel, Room, Wall } from "../../model/types";
import { catalogByKind } from "../../model/catalog";
import { segLen } from "../../model/geometry";
import { analyzeModel, openingSides, primaryType, roomTypes } from "../../model/analysis";
import { Trial, type TryResult } from "./trial";
import { againstPose, CATEGORY_ROOM, SIDES, type Pose } from "./furnish";

export interface RepairReport {
  fixed: { issue: Issue; how: string }[];
  failed: { issue: Issue; reason: string }[];
}

const ITEM_CODES = new Set(["item_through_wall", "item_blocks_door", "item_in_door_swing", "item_blocks_window", "items_overlap", "item_outside_room", "item_outside_rooms"]);
const OPENING_CODES = new Set(["openings_overlap", "opening_overflow", "wall_ends_in_opening"]);
const MANUAL: Record<string, string> = {
  room_undersized: "making a room bigger moves walls, which is a design decision — resize it in the plan or describe the home again with more area",
  rooms_overlap: "overlapping rooms need you to decide which one gives way",
  walls_cross: "crossing walls need you to decide which one to trim",
  walls_overlap_collinear: "overlapping walls need one of them removed",
  wall_loose_end: "a loose wall end needs to be joined or the wall removed",
  wall_too_short: "a very short wall should be removed or extended",
  room_floating: "the room needs walls drawn around it",
};

const resolves = (id: string) => (r: TryResult) => r.resolved.some((i) => i.id === id);

/** Repair the given findings (or every error and warning) on the trial model. */
export function repairIssues(trial: Trial, issueIds?: string[]): RepairReport {
  const report: RepairReport = { fixed: [], failed: [] };
  const targets = (issueIds ? trial.problems.filter((i) => issueIds.includes(i.id)) : [...trial.problems]).sort(
    (a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1),
  );
  for (const issue of targets) {
    if (!trial.problems.some((i) => i.id === issue.id)) {
      report.fixed.push({ issue, how: "resolved by an earlier fix" });
      continue;
    }
    const how = fixOne(trial, issue);
    if (how) report.fixed.push({ issue, how });
    else report.failed.push({ issue, reason: MANUAL[issue.code] ?? "no automatic fix was found that keeps everything else valid" });
  }
  return report;
}

function fixOne(trial: Trial, issue: Issue): string | null {
  const m = trial.model;
  if (ITEM_CODES.has(issue.code)) {
    const items = issue.refs
      .map((id) => m.items.find((i) => i.id === id))
      .filter((i): i is PlanModel["items"][number] => !!i)
      // move the piece with the most findings first (the culprit), then the smaller one
      .sort((a, b) => findingsOf(trial, b.id) - findingsOf(trial, a.id) || footprint(a.kind) - footprint(b.kind));
    for (const it of items) {
      const how = relocate(trial, it.id, issue.id);
      if (how) return how;
    }
    return null;
  }
  if (OPENING_CODES.has(issue.code)) {
    for (const id of issue.refs) {
      const o = m.openings.find((x) => x.id === id);
      if (o && slideOpening(trial, o, issue.id)) return `moved ${o.kind} ${o.id} along its wall`;
    }
    return null;
  }
  const room = m.rooms.find((r) => issue.refs.includes(r.id));
  switch (issue.code) {
    case "door_narrow": {
      const o = m.openings.find((x) => issue.refs.includes(x.id));
      if (!o) return null;
      const r = trial.first([[{ op: "update_opening", id: o.id, width: 0.8 }], [{ op: "update_opening", id: o.id, width: 0.8, t: 0.5 }]], resolves(issue.id));
      return r ? `widened door ${o.id} to 0.8 m` : null;
    }
    case "room_no_door":
    case "room_unreachable":
      return room ? addDoor(trial, room, issue.id, false) : null;
    case "no_entrance": {
      const order = [...m.rooms].sort((a, b) => entranceRank(a) - entranceRank(b));
      for (const r of order) {
        const how = addDoor(trial, r, issue.id, true);
        if (how) return how;
      }
      return null;
    }
    case "room_no_window":
    case "room_low_daylight":
    case "bedroom_no_escape_window":
      return room ? addOrGrowWindow(trial, room, issue) : null;
    default:
      return null;
  }
}

const findingsOf = (trial: Trial, id: string) => trial.problems.filter((i) => i.refs.includes(id)).length;

const footprint = (kind: string) => {
  const c = catalogByKind(kind);
  return c ? c.w * c.d : 0;
};

const entranceRank = (r: Room) => ({ hall: 0, living: 1, kitchen: 2, dining: 3 } as Record<string, number>)[primaryType(r.label)] ?? 9;

/** Rooms to look in: the one holding the item, else suitable rooms nearest first. */
function roomsFor(m: PlanModel, x: number, y: number, kind: string): Room[] {
  const inside = m.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  const dist = (r: Room) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
  const cat = catalogByKind(kind);
  const suits = (r: Room) => !!cat && roomTypes(r.label).some((t) => (CATEGORY_ROOM[cat.category] ?? []).includes(t));
  const rest = m.rooms
    .filter((r) => r !== inside)
    .sort((a, b) => Number(suits(b)) - Number(suits(a)) || dist(a) - dist(b));
  // a sofa that has wandered into the hall goes back to a living room, not elsewhere in the hall
  if (inside && !suits(inside) && rest.some(suits)) return [...rest.filter(suits).slice(0, 2), inside];
  return (inside ? [inside, ...rest] : rest).slice(0, 3);
}

/** Move (and if needed rotate) one item to the nearest spot that clears the finding. */
function relocate(trial: Trial, itemId: string, issueId: string): string | null {
  const m = trial.model;
  const it = m.items.find((i) => i.id === itemId)!;
  const cat = catalogByKind(it.kind);
  const rooms = roomsFor(m, it.x, it.y, it.kind);
  if (!cat || rooms.length === 0) return null;
  const poses: (Pose & { penalty: number })[] = [];
  // small nudges first, keeping the orientation — unless the piece is in the wrong kind of room
  const nudgePenalty = rooms[0].x <= it.x && it.x <= rooms[0].x + rooms[0].w && rooms[0].y <= it.y && it.y <= rooms[0].y + rooms[0].h ? 0 : 6;
  for (const d of [0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1.0]) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) poses.push({ x: it.x + dx, y: it.y + dy, rotation: it.rotation, penalty: nudgePenalty });
  }
  rooms.forEach((room, k) => {
    const penalty = k * 3;
    // flush against each wall of the room
    for (const side of SIDES) for (const t of [0.5, 0.2, 0.8, 0, 1, 0.35, 0.65]) {
      const p = againstPose(room, cat, side, t);
      if (p) poses.push({ ...p, penalty });
    }
    // anywhere on a grid, either orientation
    for (const fy of [0.5, 0.3, 0.7, 0.2, 0.8]) for (const fx of [0.5, 0.3, 0.7, 0.2, 0.8]) for (const rot of [it.rotation, (it.rotation + 90) % 360])
      poses.push({ x: room.x + room.w * fx, y: room.y + room.h * fy, rotation: rot, penalty });
  });

  const snap = (v: number) => Math.round(v * 20) / 20;
  const cost = (p: Pose & { penalty: number }) => Math.hypot(p.x - it.x, p.y - it.y) + (p.rotation === it.rotation ? 0 : 0.5) + p.penalty;
  const sorted = poses.sort((a, b) => cost(a) - cost(b));
  for (const p of sorted) {
    const op = { op: "move_item", id: it.id, x: snap(p.x), y: snap(p.y), rotation: Math.round(p.rotation) % 360 };
    const r = trial.try([op]);
    // the piece must end up somewhere with no finding of its own, not just clear of this one
    if (r.ok && r.introduced.length === 0 && resolves(issueId)(r) && !r.problems.some((i) => i.refs.includes(it.id))) {
      trial.accept([op], r);
      const moved = Math.hypot(op.x - it.x, op.y - it.y);
      return `moved ${cat.label.toLowerCase()} ${it.id} ${moved.toFixed(2)} m${op.rotation !== it.rotation ? ` and turned it to ${op.rotation}°` : ""}`;
    }
  }
  return null;
}

function slideOpening(trial: Trial, o: Opening, issueId: string): boolean {
  const ts: number[] = [];
  for (let k = 1; k < 20; k++) ts.push(k / 20);
  ts.sort((a, b) => Math.abs(a - o.t) - Math.abs(b - o.t));
  const cands: unknown[][] = ts.map((t) => [{ op: "update_opening", id: o.id, t }]);
  // a too-wide opening may also need to shrink
  for (const width of [o.width - 0.2, o.width - 0.4]) if (width >= 0.6) cands.push(...ts.slice(0, 6).map((t) => [{ op: "update_opening", id: o.id, t, width }]));
  return !!trial.first(cands, resolves(issueId));
}

interface Run {
  wall: Wall;
  other: string;
  ts: number[];
}

/** Stretches of wall where one face is `room` and the other is another room or the outside. */
function runsFor(m: PlanModel, room: Room): Run[] {
  const out: Run[] = [];
  for (const wall of m.walls) {
    const len = segLen(wall.ax, wall.ay, wall.bx, wall.by);
    const step = Math.max(0.01, 0.1 / len);
    const byOther = new Map<string, number[]>();
    for (let t = step; t < 1 - step / 2; t += step) {
      const [a, b] = openingSides({ t } as Opening, wall, m.rooms);
      const other = a === room.id ? b : b === room.id ? a : null;
      if (other === null || other === room.id) continue;
      (byOther.get(other) ?? byOther.set(other, []).get(other)!).push(t);
    }
    for (const [other, ts] of byOther) out.push({ wall, other, ts });
  }
  return out;
}

/** Candidate centre positions on a run, middle first. */
function runPositions(run: Run): number[] {
  const mid = (run.ts[0] + run.ts[run.ts.length - 1]) / 2;
  return [...run.ts].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid)).filter((_, i) => i % 2 === 0).slice(0, 12);
}

function addDoor(trial: Trial, room: Room, issueId: string, exteriorOnly: boolean): string | null {
  const m = trial.model;
  const a = analyzeModel(m);
  const depth = new Map(a.rooms.map((r) => [r.id, r.depth]));
  const label = new Map(m.rooms.map((r) => [r.id, r.label]));
  const rank = (other: string) => {
    if (other === "exterior") return exteriorOnly ? 0 : ["hall", "living"].includes(primaryType(room.label)) ? 2.5 : 4;
    if (exteriorOnly) return Infinity;
    if (a.entrances.length && depth.get(other) == null) return Infinity; // must lead somewhere reachable
    const t = primaryType(label.get(other) ?? "");
    return t === "hall" ? 0 : t === "living" ? 1 : t === "bedroom" || t === "bath" ? 3 : 2;
  };
  const runs = runsFor(m, room)
    .map((r) => ({ ...r, rank: rank(r.other) }))
    .filter((r) => Number.isFinite(r.rank))
    .sort((x, y) => x.rank - y.rank || y.ts.length - x.ts.length);
  const width = roomTypes(room.label)[0] === "bath" ? 0.8 : 0.9;
  for (const run of runs) {
    const cands = runPositions(run).map((t) => [{ op: "add_opening", kind: "door", wallId: run.wall.id, t: Math.round(t * 1000) / 1000, width }]);
    if (trial.first(cands, resolves(issueId))) {
      const to = run.other === "exterior" ? "the outside" : `"${label.get(run.other)}"`;
      return `added a ${width} m door from "${room.label}" to ${to} on wall ${run.wall.id}`;
    }
  }
  return null;
}

function addOrGrowWindow(trial: Trial, room: Room, issue: Issue): string | null {
  const m = trial.model;
  const bath = roomTypes(room.label)[0] === "bath";
  // grow an existing window first (bigger, and low enough to climb out of)
  const mine = m.openings.filter((o) => o.kind === "window" && issue.refs.includes(o.id));
  for (const o of mine) {
    const grow = [
      { width: Math.min(4, o.width + 0.6), height: Math.max(o.height, 1.2), sill: Math.min(o.sill, 0.9) },
      { width: Math.min(4, o.width + 0.3), height: Math.max(o.height, 1.2), sill: Math.min(o.sill, 0.9) },
      { height: Math.max(o.height, 1.2), sill: Math.min(o.sill, 0.9) },
    ];
    if (trial.first(grow.map((g) => [{ op: "update_opening", id: o.id, ...g }]), resolves(issue.id))) return `enlarged window ${o.id}`;
  }
  const runs = runsFor(m, room)
    .filter((r) => r.other === "exterior")
    .sort((x, y) => y.ts.length - x.ts.length);
  const sizes = bath ? [{ width: 0.6, sill: 1.3, height: 0.8 }] : [1.6, 1.4, 1.2, 1.0, 0.8, 0.6].map((width) => ({ width, sill: 0.9, height: 1.2 }));
  for (const run of runs) {
    const cands = sizes.flatMap((s) => runPositions(run).slice(0, 5).map((t) => [{ op: "add_opening", kind: "window", wallId: run.wall.id, t: Math.round(t * 1000) / 1000, ...s }]));
    const r = trial.first(cands, resolves(issue.id));
    if (r) {
      const op = trial.ops[trial.ops.length - 1] as { width: number };
      return `added a ${op.width} m window to "${room.label}" on exterior wall ${run.wall.id}`;
    }
  }
  return null;
}
