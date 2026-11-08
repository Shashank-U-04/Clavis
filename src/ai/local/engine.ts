/**
 * Clavis Local — the built-in design engine. It needs no API key and no network.
 *
 * It speaks exactly the same contract as the hosted language-model assistant
 * (ai/contract.ts): it returns a Proposal of pipeline operations or an Explanation, and the
 * client workflow (ai/workflow.ts) dry-runs, shows, applies and measures it the same way.
 * The difference is how the proposal is produced: by parsing the request with plain rules
 * and searching for operations that the constraint engine accepts, instead of by a model.
 *
 * It understands a deliberately bounded set of requests and says so when it does not.
 */

import type { AssistantRequest, AssistantResponse, Explanation, Proposal } from "../contract";
import type { Issue, Item, PlanModel, Room } from "../../model/types";
import { CATALOG, catalogByKind, type CatalogEntry } from "../../model/catalog";
import { analyzeModel, HABITABILITY, primaryType, roomTypes, type RoomType } from "../../model/analysis";
import { checkModel, summarizeIssues } from "../../model/issues";
import { FLOOR_FINISHES } from "../../model/layout";
import { applyBatch } from "../../model/operations";
import { emptyModel } from "../../model/types";
import { Trial } from "./trial";
import { CATEGORY_ROOM, furnishRoom, placeFirst, posesFor, SIDES, type Side } from "./furnish";
import { repairIssues } from "./repair";
import { layoutFor, looksLikeBrief, parseBrief, type Brief } from "./program";
import { restructure } from "./restructure";

export const LOCAL_MODEL = "clavis-local";

export const EXAMPLES = [
  "Design a three-bedroom house with two bathrooms and a study, about 120 m²",
  "Furnish the living room",
  "Add a desk to bedroom 2",
  "Add another bedroom",
  "Make the kitchen bigger",
  "Fix all issues",
  "How big is the kitchen?",
  "Can every room be reached from the entrance?",
  "Rename the design to Lake House",
];

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// References in plain language
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
const TYPE_WORDS: [RegExp, RoomType][] = [
  [/\b(bed ?rooms?)\b/, "bedroom"],
  [/\b(bath ?rooms?|toilet|wc|en-?suite|washroom)\b/, "bath"],
  [/\b(kitchen)\b/, "kitchen"],
  [/\b(living( room)?|lounge|sitting room)\b/, "living"],
  [/\b(dining( room)?)\b/, "dining"],
  [/\b(study|office)\b/, "study"],
  [/\b(hall(way)?|corridor|entry|entrance)\b/, "hall"],
  [/\b(utility|laundry)\b/, "utility"],
];

/** Rooms the text names, best match first. */
export function mentionedRooms(text: string, m: PlanModel, selectedId?: string | null): Room[] {
  const t = text.toLowerCase();
  if (/\b(this|selected|current) room\b|\bhere\b/.test(t) && selectedId) {
    const sel = m.rooms.find((r) => r.id === selectedId) ?? roomOf(m, m.items.find((i) => i.id === selectedId));
    if (sel) return [sel];
  }
  // exact labels, longest first ("bedroom 2" before "bedroom")
  const byLabel = [...m.rooms].filter((r) => t.includes(r.label.toLowerCase())).sort((a, b) => b.label.length - a.label.length);
  if (byLabel.length) {
    const best = byLabel[0].label.length;
    return byLabel.filter((r) => r.label.length === best || !byLabel[0].label.toLowerCase().includes(r.label.toLowerCase()));
  }
  // "second bedroom", "bedroom #2"
  const ord = t.match(/\b(first|second|third|fourth|fifth|sixth)\s+(bed ?room|bath ?room)\b/) ?? t.match(/\b(bed ?room|bath ?room)\s*#?\s*(\d)\b/);
  if (ord) {
    const [word, n] = /\d/.test(ord[2] ?? "") ? [ord[1], Number(ord[2])] : [ord[2], ORDINALS[ord[1]]];
    const type: RoomType = /bed/.test(word) ? "bedroom" : "bath";
    const list = m.rooms.filter((r) => roomTypes(r.label)[0] === type);
    if (list[n - 1]) return [list[n - 1]];
  }
  if (/\b(main|master|primary)\s+bed/.test(t)) {
    const beds = m.rooms.filter((r) => roomTypes(r.label)[0] === "bedroom").sort((a, b) => b.w * b.h - a.w * a.h);
    if (beds[0]) return [beds[0]];
  }
  for (const [re, type] of TYPE_WORDS) {
    if (!re.test(t)) continue;
    const hits = m.rooms.filter((r) => roomTypes(r.label).includes(type));
    if (hits.length) return hits.sort((a, b) => (roomTypes(a.label)[0] === type ? 0 : 1) - (roomTypes(b.label)[0] === type ? 0 : 1));
  }
  return [];
}

function roomOf(m: PlanModel, it: Item | undefined): Room | undefined {
  if (!it) return undefined;
  return m.rooms.find((r) => it.x >= r.x && it.x <= r.x + r.w && it.y >= r.y && it.y <= r.y + r.h);
}

const SYNONYMS: [RegExp, (room?: RoomType) => string][] = [
  [/\b(double bed|queen bed|king bed)\b/, () => "bed_double"],
  [/\b(single bed|twin bed|kids? bed)\b/, () => "bed_single"],
  [/\bbed\b/, () => "bed_double"],
  [/\b(sofa|couch|settee)\b/, () => "sofa"],
  [/\barm ?chair\b/, () => "armchair"],
  [/\b(office chair|desk chair)\b/, () => "office_chair"],
  [/\bchairs?\b/, (r) => (r === "study" ? "office_chair" : r === "living" ? "armchair" : "dining_chair")],
  [/\bcoffee table\b/, () => "coffee_table"],
  [/\b(side table|end table)\b/, () => "side_table"],
  [/\b(dining table|table)\b/, (r) => (r === "living" ? "coffee_table" : "dining_table")],
  [/\b(tv|television)\b/, () => "tv_stand"],
  [/\b(book ?(shelf|case)|shelves|shelf)\b/, () => "bookshelf"],
  [/\b(wardrobe|closet|armoire)\b/, () => "wardrobe"],
  [/\b(nightstand|night stand|bedside( table)?)\b/, () => "nightstand"],
  [/\b(fridge|refrigerator)\b/, () => "fridge"],
  [/\b(stove|hob|oven|cooker)\b/, () => "kitchen_hob_unit"],
  [/\b(counter|worktop|kitchen units?)\b/, () => "kitchen_counter"],
  [/\b(sink|basin)\b/, (r) => (r === "kitchen" ? "kitchen_sink_unit" : "sink")],
  [/\b(toilet|wc)\b/, () => "toilet"],
  [/\bshower\b/, () => "shower"],
  [/\b(bath ?tub|tub)\b/, () => "bathtub"],
  [/\b(rug|carpet)\b/, () => "rug"],
  [/\bsideboard\b/, () => "sideboard"],
  [/\bdesk\b/, () => "desk"],
  [/\bplants?\b/, () => "plant"],
  [/\btowel\b/, () => "towel_rail"],
];

/** The catalog piece the text names, if any. */
export function mentionedKind(text: string, room?: RoomType): CatalogEntry | null {
  const t = text.toLowerCase();
  // exact catalog labels first ("oval dining table", "sofa (3-seat)")
  const exact = [...CATALOG].sort((a, b) => b.label.length - a.label.length).find((c) => t.includes(c.label.toLowerCase()));
  if (exact) return exact;
  for (const [re, pick] of SYNONYMS) if (re.test(t)) return catalogByKind(pick(room)) ?? null;
  return null;
}

const mentionedSide = (text: string): Side | undefined => SIDES.find((s) => new RegExp(`\\b${s}(ern)?\\b`).test(text.toLowerCase()));

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

function answerQuery(text: string, m: PlanModel, issues: Issue[], selectedId?: string | null): string {
  const t = text.toLowerCase();
  const a = analyzeModel(m);
  const rooms = mentionedRooms(t, m, selectedId);
  const counts = summarizeIssues(issues);
  if (m.rooms.length === 0 && m.walls.length === 0) return "The plan is empty. Describe a home to start, e.g. “design a two-bedroom flat”.";

  if (/\b(issues?|problems?|wrong|errors?|warnings?|valid|ok|okay|check)\b/.test(t)) {
    if (counts.error + counts.warning === 0) return `No errors or warnings. ${counts.info ? `${counts.info} note(s) for information.` : ""}`.trim();
    const top = issues.filter((i) => i.severity !== "info").slice(0, 5).map((i) => `• ${i.message}`).join("\n");
    return `${counts.error} error(s) and ${counts.warning} warning(s):\n${top}${counts.error + counts.warning > 5 ? "\n…see the Review tab for the rest." : ""}\nAsk me to “fix all issues” to try automatic repairs.`;
  }
  if (/\b(reach|reachable|route|access|circulation|get (to|into)|entrance|entry)\b/.test(t)) {
    const label = new Map(m.rooms.map((r) => [r.id, r.label]));
    if (a.entrances.length === 0) return "No door leads outside yet, so no room can be reached from an entrance.";
    const list = (rooms.length ? a.rooms.filter((r) => rooms.some((x) => x.id === r.id)) : a.rooms).map((r) =>
      r.route ? `• ${r.label}: ${r.depth} door(s) — outside → ${r.route.map((id) => label.get(id)).join(" → ")}` : `• ${r.label}: not reachable`,
    );
    const lost = a.rooms.filter((r) => r.depth === null).length;
    return `${lost === 0 ? "Every room can be reached from the entrance." : `${lost} room(s) cannot be reached.`}\n${list.join("\n")}`;
  }
  if (/\b(daylight|light|sun|windows?|glazing|bright)\b/.test(t)) {
    const list = (rooms.length ? a.rooms.filter((r) => rooms.some((x) => x.id === r.id)) : a.rooms.filter((r) => r.habitable)).map(
      (r) => `• ${r.label}: ${r.glazingArea.toFixed(2)} m² glazing for ${r.area.toFixed(1)} m² (${Math.round(r.daylightRatio * 100)}%)`,
    );
    return `Glazing-to-floor ratios (aim for ${HABITABILITY.minDaylightRatio * 100}%+ in habitable rooms; a rule of thumb, not a code check):\n${list.join("\n") || "No habitable rooms found."}`;
  }
  if (/\bhow many\b/.test(t)) {
    if (/bed ?rooms?/.test(t)) return `${a.metrics.bedrooms} bedroom(s).`;
    if (/bath ?rooms?|toilets?/.test(t)) return `${a.metrics.bathrooms} bathroom(s).`;
    if (/doors?/.test(t)) return `${m.openings.filter((o) => o.kind === "door").length} door(s).`;
    if (/windows?/.test(t)) return `${m.openings.filter((o) => o.kind === "window").length} window(s).`;
    if (/(items?|furniture|pieces?)/.test(t)) return `${m.items.length} piece(s) of furniture.`;
    if (/rooms?/.test(t)) return `${m.rooms.length} room(s): ${m.rooms.map((r) => r.label).join(", ")}.`;
  }
  if (rooms.length && /\b(big|large|small|size|area|dimensions?|wide|long|deep|square|m2|m²)\b/.test(t)) {
    return rooms.map((r) => `${r.label}: ${r2(r.w * r.h)} m² clear floor (${r2(r.w)} × ${r2(r.h)} m inside the walls).`).join("\n");
  }
  if (/\b(total|overall|whole|house|home|plan|footprint|size|area|big)\b/.test(t)) {
    const e = a.metrics.envelope;
    return [
      `Clear floor (carpet) area: ${a.metrics.carpetArea.toFixed(1)} m² across ${m.rooms.length} room(s).`,
      e ? `Outer envelope: ${e.w.toFixed(2)} × ${e.h.toFixed(2)} m = ${a.metrics.envelopeArea.toFixed(1)} m² (bounding rectangle).` : "",
      e ? `Efficiency (carpet ÷ envelope): ${Math.round(a.metrics.efficiency * 100)}%.` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  // general overview
  return `${m.name}: ${m.rooms.length} room(s), ${a.metrics.carpetArea.toFixed(1)} m² of clear floor, ${m.items.length} piece(s) of furniture, ${counts.error} error(s), ${counts.warning} warning(s).`;
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

type Draft = Omit<Proposal, "operations"> & { operations: unknown[] };

const proposal = (p: Partial<Draft> & Pick<Draft, "intent" | "reply">): Draft => ({
  operations: [],
  clarifying_questions: [],
  rationale: "",
  expected_checks: [],
  ...p,
});

function generate(text: string): Draft {
  return generateFrom(parseBrief(text), !/\b(unfurnished|empty|no furniture|without furniture|bare)\b/i.test(text));
}

/** Lay out a brief, furnish it, and describe the result. `intro` replaces the opening line. */
function generateFrom(brief: Brief, furnish: boolean, intro?: string): Draft {
  const plan = layoutFor(brief);
  let n = 0;
  const built = applyBatch(emptyModel(), [{ op: "build_layout", ...plan.spec }], (p) => `${p}_g${n++}`);
  if (!built.ok) {
    return proposal({ intent: "generate_design", reply: `I could not lay that program out: ${built.error?.message}`, rationale: "The layout builder rejected the generated room program." });
  }
  const trial = new Trial(built.model);
  const placed: string[] = [];
  if (furnish) for (const r of built.model.rooms) placed.push(...(furnishRoom(trial, r.id)?.placed ?? []));
  const a = analyzeModel(trial.model);
  const parts = [
    `${brief.bedrooms === 0 ? "a studio" : `${brief.bedrooms} bedroom(s)`}`,
    `${brief.bathrooms} bathroom(s)${brief.ensuite && brief.bathrooms >= 2 ? " incl. an en-suite" : ""}`,
    brief.openKitchen ? "open-plan living & kitchen" : "separate kitchen",
    brief.dining ? "dining room" : "",
    brief.study ? "study" : "",
    brief.utility ? "utility room" : "",
  ].filter(Boolean);
  const e = a.metrics.envelope!;
  return proposal({
    intent: "generate_design",
    reply: `${intro ?? `Here is a ${plan.spec.name?.toLowerCase()}`}: ${parts.join(", ")}. About ${a.metrics.carpetArea.toFixed(0)} m² of clear floor in a ${e.w.toFixed(1)} × ${e.h.toFixed(1)} m footprint${furnish ? `, with ${trial.ops.length} pieces of furniture` : ""}. Review it, then apply.`,
    operations: [{ op: "build_layout", ...plan.spec }, ...trial.ops],
    rationale: [
      "Bedrooms and bathrooms share a private band along the north; living spaces face south; a hall runs between them, so every room opens onto it and is reachable from the entrance.",
      "Windows are sized for about 12% glazing in each habitable room.",
      furnish ? "Each piece of furniture was kept only if the constraint engine found no collision, blocked door or blocked window." : "",
      ...plan.notes,
    ]
      .filter(Boolean)
      .join(" "),
    expected_checks: ["no room_unreachable", "no item collisions", "no room_low_daylight"],
  });
}

function furnish(text: string, m: PlanModel, selectedId?: string | null): Draft {
  if (m.rooms.length === 0) return proposal({ intent: "edit_design", reply: "There are no rooms to furnish yet. Describe a home first." });
  const named = mentionedRooms(text, m, selectedId);
  const all = /\b(all|every|whole|entire|everything|house|home|rest)\b/i.test(text) || named.length === 0;
  const targets = all ? m.rooms.filter((r) => !m.items.some((i) => roomOf(m, i)?.id === r.id)) : named;
  if (targets.length === 0) return proposal({ intent: "edit_design", reply: "Every room already has furniture. Name a room to add more, e.g. “add a plant to the living room”." });
  const trial = new Trial(m);
  const lines: string[] = [];
  for (const r of targets) {
    const rep = furnishRoom(trial, r.id);
    if (!rep) continue;
    lines.push(`${r.label}: ${rep.placed.length ? rep.placed.join(", ") : "nothing fitted"}${rep.skipped.length ? ` (no room for ${rep.skipped.join(", ")})` : ""}`);
  }
  if (trial.ops.length === 0) return proposal({ intent: "edit_design", reply: `Nothing fitted without blocking a door, a window or other furniture.\n${lines.join("\n")}` });
  return proposal({
    intent: "edit_design",
    reply: `Proposed ${trial.ops.length} piece(s):\n${lines.join("\n")}`,
    operations: trial.ops,
    rationale: "Pieces follow a recipe for each room type and were kept only where the constraint engine reported no new collision, blocked door or window, or protrusion.",
    expected_checks: ["no items_overlap", "no item_blocks_door", "no item_through_wall"],
  });
}

function addItem(text: string, m: PlanModel, selectedId?: string | null): Draft | null {
  const rooms = mentionedRooms(text, m, selectedId);
  const cat = mentionedKind(text, rooms[0] ? primaryType(rooms[0].label) : undefined);
  if (!cat) return null;
  const candidates = rooms.length ? rooms : m.rooms.filter((r) => roomTypes(r.label).some((t) => CATEGORY_ROOM[cat.category]?.includes(t)));
  if (candidates.length === 0) {
    return proposal({ intent: "edit_design", reply: `Which room should the ${cat.label.toLowerCase()} go in?`, clarifying_questions: [`Which room should the ${cat.label.toLowerCase()} go in?`] });
  }
  const side = mentionedSide(text.replace(/\b(north|south|east|west)(ern)?\b(?!\s+wall)/gi, (s) => (/(wall|side)/i.test(text) ? s : "")));
  const trial = new Trial(m);
  for (const room of candidates) {
    const p = placeFirst(trial, cat.kind, posesFor(trial.model, room, cat, side));
    if (p) {
      return proposal({
        intent: "edit_design",
        reply: `${cat.label} (${cat.w} × ${cat.d} m) placed in ${room.label}${p.side ? ` against the ${p.side} wall` : ""}.`,
        operations: trial.ops,
        rationale: "Positions were tried from the walls inward; this is the first one with no collision, blocked door or blocked window.",
      });
    }
  }
  return proposal({
    intent: "edit_design",
    reply: `There is no free spot for a ${cat.label.toLowerCase()} (${cat.w} × ${cat.d} m) in ${candidates.map((r) => r.label).join(" or ")} that keeps doors, windows and other furniture clear.`,
  });
}

function removeItems(text: string, m: PlanModel, selectedId?: string | null): Draft | null {
  const rooms = mentionedRooms(text, m, selectedId);
  const inRooms = (it: Item) => !rooms.length || rooms.some((r) => roomOf(m, it)?.id === r.id);
  let targets: Item[] = [];
  if (/\b(all )?(the )?furniture\b|\bempty\b|\bclear\b/i.test(text)) targets = m.items.filter(inRooms);
  else if (selectedId && /\b(this|it|that|selected)\b/i.test(text) && m.items.some((i) => i.id === selectedId)) targets = m.items.filter((i) => i.id === selectedId);
  else {
    const cat = mentionedKind(text, rooms[0] ? primaryType(rooms[0].label) : undefined);
    if (!cat) return null;
    const same = m.items.filter((i) => inRooms(i) && (i.kind === cat.kind || catalogByKind(i.kind)?.label.toLowerCase().includes(cat.label.toLowerCase().split(" ")[0])));
    targets = /\b(all|every)\b/i.test(text) ? same : same.slice(0, 1);
  }
  if (targets.length === 0) return proposal({ intent: "edit_design", reply: "I could not find that furniture in the plan." });
  return proposal({
    intent: "edit_design",
    reply: `Remove ${targets.length} piece(s): ${targets.map((i) => catalogByKind(i.kind)?.label ?? i.kind).join(", ")}.`,
    operations: targets.map((i) => ({ op: "remove_item", id: i.id })),
    rationale: "Deleting furniture is destructive, so it needs your confirmation.",
  });
}

function rename(text: string, m: PlanModel): Draft | null {
  const to = text.match(/\b(?:to|as)\s+["“']?(.{1,60}?)["”']?\s*\.?$/i);
  if (!to) return null;
  const name = to[1].trim();
  const subject = text.slice(0, to.index);
  const rooms = /\b(design|plan|project|house|home|it)\b/i.test(subject) && !mentionedRooms(subject, m).length ? [] : mentionedRooms(subject, m);
  if (rooms.length) {
    return proposal({ intent: "edit_design", reply: `Rename “${rooms[0].label}” to “${name}”.`, operations: [{ op: "update_room", id: rooms[0].id, label: name }] });
  }
  return proposal({ intent: "edit_design", reply: `Rename the design to “${name}”.`, operations: [{ op: "rename_plan", name }] });
}

function refloor(text: string, m: PlanModel, selectedId?: string | null): Draft | null {
  const finish = FLOOR_FINISHES.find((f) => new RegExp(`\\b${f}\\b`, "i").test(text)) ?? (/\b(wood|timber|parquet)\b/i.test(text) ? "oak" : /\bceramic|stone|marble\b/i.test(text) ? "tile" : undefined);
  if (!finish) return null;
  const rooms = /\b(all|every|whole|everywhere)\b/i.test(text) ? m.rooms : mentionedRooms(text, m, selectedId);
  if (!rooms.length) return proposal({ intent: "edit_design", reply: "Which room should get the new floor?", clarifying_questions: ["Which room should get the new floor?"] });
  return proposal({
    intent: "edit_design",
    reply: `${finish[0].toUpperCase()}${finish.slice(1)} floor for ${rooms.map((r) => r.label).join(", ")}.`,
    operations: rooms.map((r) => ({ op: "update_room", id: r.id, floor: finish })),
  });
}

function openings(text: string, m: PlanModel, selectedId?: string | null): Draft | null {
  const kind = /\bwindow/i.test(text) ? "window" : /\bdoor/i.test(text) ? "door" : null;
  if (!kind) return null;
  const rooms = mentionedRooms(text, m, selectedId);
  if (!rooms.length) return proposal({ intent: "edit_design", reply: `Which room should get the ${kind}?`, clarifying_questions: [`Which room should get the ${kind}?`] });
  // Reuse the repair search: pretend the room lacks what was asked for.
  const trial = new Trial(m);
  const issue: Issue = {
    id: `request:${kind}:${rooms[0].id}`,
    severity: "warning",
    code: kind === "window" ? "room_no_window" : "room_no_door",
    message: "",
    refs: [rooms[0].id],
  };
  // the synthetic finding is never in trial.problems, so accept any candidate that adds nothing bad
  trial.problems = [...trial.problems, issue];
  const rep = repairIssues(trial, [issue.id]);
  const ops = trial.ops.filter((o) => (o as { op: string }).op === "add_opening");
  if (!ops.length) return proposal({ intent: "edit_design", reply: `I could not find a place for a ${kind} in ${rooms[0].label} that keeps everything else valid.` });
  return proposal({ intent: "edit_design", reply: `${rep.fixed[0]?.how ?? `Add a ${kind}`}.`.replace(/^./, (c) => c.toUpperCase()), operations: ops.slice(0, 1) });
}

function repair(m: PlanModel, focus?: string[], text = ""): Draft {
  const trial = new Trial(m);
  let ids = focus?.length ? focus : undefined;
  if (!ids) {
    const rooms = mentionedRooms(text, m);
    if (rooms.length && !/\b(all|every|everything)\b/i.test(text)) ids = trial.problems.filter((i) => i.refs.some((r) => rooms.some((x) => x.id === r))).map((i) => i.id);
  }
  if (trial.problems.length === 0) return proposal({ intent: "validate", reply: "There are no errors or warnings to fix." });
  const rep = repairIssues(trial, ids);
  const fixed = rep.fixed.map((f) => `✓ ${f.issue.message} — ${f.how}`);
  const failed = rep.failed.map((f) => `✗ ${f.issue.message} — ${f.reason}`);
  return proposal({
    intent: "edit_design",
    reply: trial.ops.length
      ? `I can fix ${rep.fixed.length} of ${rep.fixed.length + rep.failed.length} finding(s):\n${[...fixed, ...failed].join("\n")}`
      : `No automatic fix kept everything else valid:\n${failed.join("\n")}`,
    operations: trial.ops,
    rationale: "Each candidate edit was tried on a copy of the design; an edit was kept only if it cleared its finding and introduced no other error or warning.",
    expected_checks: rep.fixed.map((f) => `no ${f.issue.id}`).slice(0, 10),
  });
}

const HELP = `I'm Clavis Local, the built-in design engine. I run in your browser with no API key. I can:
• design a home from a brief (“a three-bedroom house with a study, 110 m²”)
• furnish rooms, add, move or remove furniture
• add doors and windows, change floors, rename rooms
• add or remove bedrooms, bathrooms, a study or dining room; resize rooms; open or separate the kitchen
• fix validation findings, and answer questions about areas, daylight and circulation.`;

export function localProposal(req: AssistantRequest, m: PlanModel): Draft {
  const text = req.instruction.trim();
  const t = text.toLowerCase();
  const sel = req.context.selectedId ?? null;
  const issues = checkModel(m);

  if (req.mode === "repair" || /^\s*(please\s+)?(fix|repair|resolve|solve|sort out|clean up)\b/.test(t))
    return repair(m, req.context.focusIssueIds, text);
  if (/^\s*(help|what can you do|\?)\s*\??$/.test(t)) return proposal({ intent: "query", reply: HELP });
  if (/\brename\b|\bcall (it|the (design|plan|house|home))\b/.test(t)) return rename(text, m) ?? unsupported(text);
  const change = restructure(text, m, sel);
  if (change) return "reply" in change ? proposal({ intent: "unsupported", reply: change.reply }) : generateFrom(change.brief, change.furnish, change.intro);
  if (looksLikeBrief(t) && !/\b(add|put|place)\b/.test(t) && !/^\s*furnish\b/.test(t)) return generate(text);
  if (/\bfurnish|\bfurniture (for|in)\b|\bfill (up )?the\b/.test(t)) return furnish(text, m, sel);
  if (/\b(remove|delete|get rid of|take out|clear)\b/.test(t)) return removeItems(text, m, sel) ?? unsupported(text);
  if (/\b(floor|flooring)\b/.test(t) && /\b(make|change|set|use|switch|give)\b/.test(t)) return refloor(text, m, sel) ?? unsupported(text);
  if (/\b(add|put|place|insert|need|want)\b/.test(t)) {
    if (/\b(window|door)s?\b/.test(t) && !mentionedKind(t.replace(/\b(window|door)s?\b/g, ""))) return openings(text, m, sel) ?? unsupported(text);
    const p = addItem(text, m, sel);
    if (p) return p;
  }
  if (/\?\s*$|^\s*(how|what|which|is|are|does|do|why|where|list|show|tell|can|count)\b/.test(t)) return proposal({ intent: "query", reply: answerQuery(text, m, issues, sel) });
  return unsupported(text);
}

function unsupported(text: string): Draft {
  const multiStorey = /\b(storey|story|floor above|second floor|upstairs|stairs?|basement)\b/i.test(text);
  return proposal({
    intent: "unsupported",
    reply: multiStorey
      ? "Clavis designs single-storey homes for now, so I can't add floors or stairs."
      : `I didn't understand that. Try one of these:\n${EXAMPLES.map((e) => `• ${e}`).join("\n")}`,
  });
}

// ---------------------------------------------------------------------------
// Explanations, grounded in the outcome the app measured
// ---------------------------------------------------------------------------

const CODE_TEXT: Record<string, string> = {
  item_blocks_door: "furniture blocking a door",
  item_blocks_window: "furniture in front of a window",
  items_overlap: "overlapping furniture",
  item_through_wall: "furniture through a wall",
  item_outside_room: "furniture poking out of a room",
  item_outside_rooms: "furniture outside every room",
  room_no_door: "a room without a door",
  room_no_window: "a room without a window",
  room_unreachable: "a room that could not be reached",
  no_entrance: "no entrance",
  room_low_daylight: "a room short of daylight",
  bedroom_no_escape_window: "a bedroom without an escape window",
  openings_overlap: "overlapping openings",
  route_through_private: "a room reached only through a bedroom or bathroom",
  bath_needs_extract: "a windowless bathroom that needs extract ventilation",
};

export function localExplanation(req: AssistantRequest, m: PlanModel): Explanation {
  const o = req.context.outcome;
  const issues = checkModel(m);
  const counts = summarizeIssues(issues);
  const points: Explanation["points"] = [];
  const phrase = (id: string) => CODE_TEXT[id.split(":")[0]] ?? id.split(":")[0].replace(/_/g, " ");
  if (o) {
    const info = new Set(["route_through_private", "bath_needs_extract"]);
    const isInfo = (id: string) => info.has(id.split(":")[0]);
    for (const id of o.resolvedIssueIds.filter((x) => !isInfo(x)).slice(0, 4)) points.push({ text: `Resolved: ${phrase(id)}.`, evidence: [id] });
    for (const id of o.introducedIssueIds.slice(0, 3)) points.push({ text: `${isInfo(id) ? "Note" : "New finding"}: ${phrase(id)}.`, evidence: [id] });
    if (o.remainingIssueIds.length) points.push({ text: `${o.remainingIssueIds.length} earlier finding(s) remain.`, evidence: o.remainingIssueIds.slice(0, 8) });
  }
  const a = analyzeModel(m);
  const lost = a.rooms.filter((r) => r.depth === null);
  if (m.rooms.length) points.push({ text: lost.length ? `${lost.length} room(s) cannot be reached from the entrance.` : "Every room can be reached from the entrance.", evidence: lost.map((r) => r.id).slice(0, 8) });
  return {
    headline: o ? (o.applied ? `Applied at revision ${o.revision}` : "Not applied") : `${m.name}`,
    summary: `${m.rooms.length} room(s), ${analyzeModel(m).metrics.carpetArea.toFixed(1)} m² of clear floor and ${m.items.length} piece(s) of furniture. The design now has ${counts.error} error(s) and ${counts.warning} warning(s), measured by the constraint engine.`,
    points: points.slice(0, 8),
    caveats: ["Sizes and daylight targets are early-design rules of thumb, not a building-code check."],
  };
}

/** The local engine behind the same response contract the hosted model uses. */
export function localRespond(req: AssistantRequest, m: PlanModel): AssistantResponse {
  const started = performance.now();
  const meta = () => ({ model: LOCAL_MODEL, latencyMs: Math.round(performance.now() - started), attempts: 1 });
  try {
    if (req.mode === "explain") return { ok: true, mode: "explain", explanation: localExplanation(req, m), meta: meta() };
    const p = localProposal(req, m);
    return { ok: true, mode: req.mode, proposal: p as Proposal, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "malformed_output", message: `The local engine failed: ${err instanceof Error ? err.message : String(err)}`, retryable: false } };
  }
}

