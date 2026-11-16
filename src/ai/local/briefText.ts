/**
 * A brief from choices instead of free text: counts and switches become a sentence worded the
 * way Clavis Local's brief parser reads it (program.ts). The studio shows the parse of that
 * sentence back to the person, so what they see is exactly what will be laid out.
 */

import { parseBrief, type Brief } from "./program";

export interface BriefChoice {
  bedrooms: number;
  bathrooms: number;
  ensuite: boolean;
  kitchen: "open" | "separate";
  dining: boolean;
  study: boolean;
  utility: boolean;
  /** m², or null to let Clavis size the home */
  area: number | null;
}

export const DEFAULT_CHOICE: BriefChoice = { bedrooms: 2, bathrooms: 1, ensuite: false, kitchen: "open", dining: false, study: false, utility: false, area: 80 };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The sentence for these choices, e.g. "Design a 3-bedroom home with 2 bathrooms, …". */
export function briefSentence(c: BriefChoice): string {
  const home = c.bedrooms === 0 ? "a studio home" : `a ${c.bedrooms}-bedroom home`;
  const parts = [plural(c.bathrooms, "bathroom")];
  if (c.ensuite) parts.push("an en-suite");
  else if (c.bathrooms >= 2 && c.bedrooms >= 2) parts.push("no en-suite");
  parts.push(c.kitchen === "open" ? "an open kitchen" : "a separate kitchen");
  if (c.dining) parts.push("a dining room");
  if (c.study) parts.push("a study");
  if (c.utility) parts.push("a utility room");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `Design ${home} with ${list}${c.area ? `, about ${c.area} m²` : ""}.`;
}

/** What the parser will build from these choices, including the rooms it adds by itself. */
export const briefFor = (c: BriefChoice): Brief => parseBrief(briefSentence(c));

/** The read-back, in words: "2 bedrooms · 1 bathroom · open kitchen · about 80 m²". */
export function briefSummary(b: Brief): string[] {
  const out = [b.bedrooms === 0 ? "studio" : plural(b.bedrooms, "bedroom"), plural(b.bathrooms, "bathroom")];
  if (b.ensuite) out.push("en-suite");
  out.push(b.openKitchen ? "open kitchen" : "separate kitchen");
  if (b.dining) out.push("dining room");
  if (b.study) out.push("study");
  if (b.utility) out.push("utility room");
  out.push(b.targetArea ? `about ${b.targetArea} m²` : "sized by Clavis");
  return out;
}
