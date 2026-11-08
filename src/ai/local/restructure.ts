/**
 * Structural edits: "add a bedroom", "make the kitchen bigger", "remove the study",
 * "open up the kitchen". The current design is read back into a brief (keeping each room's
 * size and name), the brief is edited, and the whole plan is regenerated. That replaces the
 * layout, so the proposal is destructive and the person confirms it; furniture is re-placed.
 */

import type { PlanModel } from "../../model/types";
import { briefFromModel, type Brief } from "./program";
import { mentionedKind, mentionedRooms } from "./engine";

export type Restructured = { brief: Brief; furnish: boolean; intro: string } | { reply: string };

type Kind = "bedroom" | "bathroom" | "ensuite" | "study" | "dining" | "utility";

const KINDS: [RegExp, Kind][] = [
  [/\ben-?suite\b/, "ensuite"],
  [/\bbed ?rooms?\b/, "bedroom"],
  [/\b(bath ?rooms?|toilets?|wcs?|washrooms?)\b/, "bathroom"],
  [/\b(study|home office|office)\b/, "study"],
  [/\bdining( room)?\b/, "dining"],
  [/\b(utility|laundry)( room)?\b/, "utility"],
];

const ADD = /\b(add|another|extra|one more|include|need a|want a)\b/;
const REMOVE = /\b(remove|delete|drop|get rid of|without|lose|no more)\b/;
const BIGGER = /\b(bigger|larger|enlarge|extend|expand|more space|roomier|widen|grow)\b/;
const SMALLER = /\b(smaller|shrink|reduce|tighter|less space|narrower)\b/;
const OPEN_KITCHEN = /\b(open(-| )?(plan|up)?)\b[^.]*\bkitchen\b|\bkitchen\b[^.]*\bopen(-| )?plan\b/;
const CLOSE_KITCHEN = /\b(separate|close|closed|enclose|wall off)\b[^.]*\bkitchen\b/;

/** Shift `prefix{n+1}..` down over a removed `prefix{n}` so sizes and names stay with their rooms. */
function dropAlias(b: Brief, prefix: string, index: number, count: number) {
  for (const rec of [b.areas, b.labels] as Record<string, unknown>[]) {
    if (!rec) continue;
    for (let i = index; i < count; i++) {
      const next = rec[`${prefix}${i + 1}`];
      if (next === undefined) delete rec[`${prefix}${i}`];
      else rec[`${prefix}${i}`] = next;
    }
    delete rec[`${prefix}${count}`];
  }
}

const clone = (b: Brief): Brief => ({ ...b, areas: { ...b.areas }, labels: { ...b.labels } });

export function restructure(text: string, m: PlanModel, selectedId?: string | null): Restructured | null {
  const t = text.toLowerCase();
  if (m.rooms.length === 0) return null;
  // doors and windows are added on existing walls, not by regenerating the plan
  if (/\b(windows?|doors?)\b/.test(t)) return null;
  const kind = KINDS.find(([re]) => re.test(t))?.[1];
  const resizing = BIGGER.test(t) || SMALLER.test(t);
  const kitchenToggle = OPEN_KITCHEN.test(t) || CLOSE_KITCHEN.test(t);
  if (!kind && !resizing && !kitchenToggle) return null;
  // furniture requests ("add a desk to the study", "remove the bathtub") are not structural
  const furnitureWords = t.replace(/\b(bed ?rooms?|bath ?rooms?|dining room|living room)\b/g, " ");
  if (mentionedKind(furnitureWords) && !resizing) return null;

  const { brief: base, aliasOf, unmapped } = briefFromModel(m);
  const b = clone(base);
  const lost = unmapped.length ? ` Custom rooms (${unmapped.map((r) => r.label).join(", ")}) are not part of the regenerated plan.` : "";
  const done = (intro: string): Restructured => ({ brief: b, furnish: m.items.length > 0, intro: `${intro}.${lost} The layout is regenerated and the furniture re-placed. Here is the result` });

  if (resizing) {
    const room = mentionedRooms(t, m, selectedId)[0];
    if (!room) return { reply: "Which room should change size? For example: “make the kitchen bigger”." };
    const alias = Object.entries(aliasOf).find(([, id]) => id === room.id)?.[0];
    if (!alias) return { reply: `I can only resize rooms of a standard home program, and “${room.label}” is not one. Drag its walls in the plan instead.` };
    const pct = t.match(/(\d{1,3})\s*(%|percent)/);
    const m2 = t.match(/(\d{1,2}(?:\.\d+)?)\s*(m2|m²|sqm|square met)/);
    const grow = BIGGER.test(t);
    const now = b.areas![alias];
    let next = pct ? now * (1 + ((grow ? 1 : -1) * Number(pct[1])) / 100) : m2 ? now + (grow ? 1 : -1) * Number(m2[1]) : now * (grow ? 1.3 : 0.77);
    next = Math.round(Math.max(2, Math.min(80, next)) * 10) / 10;
    b.areas![alias] = next;
    return done(`${room.label}: about ${(now / 1.1).toFixed(1)} → ${(next / 1.1).toFixed(1)} m² of clear floor`);
  }

  if (kitchenToggle && (!kind || kind === "dining")) {
    const open = OPEN_KITCHEN.test(t) && !CLOSE_KITCHEN.test(t);
    if (open === b.openKitchen) return { reply: open ? "The kitchen is already open-plan." : "The kitchen is already a separate room." };
    b.openKitchen = open;
    for (const k of ["living", "kitchen"]) {
      delete b.areas![k];
      delete b.labels![k];
    }
    return done(open ? "Kitchen opened into the living room" : "Kitchen separated from the living room");
  }

  if (!kind) return null;
  const adding = ADD.test(t) && !REMOVE.test(t);
  const removing = REMOVE.test(t);
  if (!adding && !removing) return null;

  switch (kind) {
    case "bedroom": {
      if (adding) {
        if (b.bedrooms >= 6) return { reply: "Six bedrooms is the most I can lay out." };
        b.bedrooms++;
        return done(`Added bedroom ${b.bedrooms}`);
      }
      if (b.bedrooms === 0) return { reply: "There is no bedroom to remove." };
      const named = mentionedRooms(t, m, selectedId).find((r) => Object.entries(aliasOf).some(([a, id]) => id === r.id && a.startsWith("bed")));
      const index = named ? Number(Object.entries(aliasOf).find(([, id]) => id === named.id)![0].slice(3)) : b.bedrooms;
      dropAlias(b, "bed", index, b.bedrooms);
      b.bedrooms--;
      if (b.bedrooms === 0) b.ensuite = false;
      return done(`Removed ${named?.label ?? `bedroom ${index}`}`);
    }
    case "bathroom": {
      if (adding) {
        if (b.bathrooms >= 4) return { reply: "Four bathrooms is the most I can lay out." };
        b.bathrooms++;
        return done(`Added a bathroom (${b.bathrooms} in total)`);
      }
      if (b.bathrooms <= 1) return { reply: "A home needs at least one bathroom, so I kept it." };
      const shared = b.bathrooms - (b.ensuite ? 1 : 0);
      if (shared > 1 || !b.ensuite) dropAlias(b, "bath", shared, shared);
      else b.ensuite = false;
      b.bathrooms--;
      return done(`Removed a bathroom (${b.bathrooms} left)`);
    }
    case "ensuite": {
      if (adding) {
        if (b.ensuite) return { reply: "The main bedroom already has an en-suite." };
        if (b.bedrooms === 0) return { reply: "An en-suite needs a bedroom." };
        b.ensuite = true;
        b.bathrooms++;
        return done("Added an en-suite to the main bedroom");
      }
      if (!b.ensuite) return { reply: "There is no en-suite to remove." };
      b.ensuite = false;
      b.bathrooms = Math.max(1, b.bathrooms - 1);
      delete b.areas!.ensuite;
      delete b.labels!.ensuite;
      return done("Removed the en-suite");
    }
    default: {
      const flag = kind as "study" | "dining" | "utility";
      const word = { study: "a study", dining: "a dining room", utility: "a utility room" }[flag];
      if (adding === b[flag]) return { reply: adding ? `The home already has ${word}.` : `There is no ${word.replace(/^an? /, "")} to remove.` };
      b[flag] = adding;
      if (!adding) {
        delete b.areas![flag];
        delete b.labels![flag];
      }
      return done(`${adding ? "Added" : "Removed"} ${word}`);
    }
  }
}
