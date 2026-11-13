/**
 * The template catalogue: the starting points offered by /new, /templates and the studio.
 *
 * Two are drawn by hand (src/model/templates.ts). The rest are laid out by Clavis Local, the
 * rule-based engine, from a one-line brief — deterministic, so the same template always comes
 * out the same, and never the output of a language model. The UI says which is which.
 */

import { localProposal } from "@/ai/local/engine";
import type { AssistantRequest } from "@/ai/contract";
import { analyzeModel } from "@/model/analysis";
import { applyBatch } from "@/model/operations";
import { sunsetLoftModel, templateModel } from "@/model/templates";
import { emptyModel, type PlanModel } from "@/model/types";

export type TemplateMaker = "hand" | "clavis-local";

export interface TemplateEntry {
  slug: string;
  name: string;
  blurb: string;
  maker: TemplateMaker;
  /** the brief Clavis Local lays it out from */
  brief?: string;
  featured?: boolean;
}

export const TEMPLATES: readonly TemplateEntry[] = [
  {
    slug: "sunset-loft",
    name: "Sunset Loft",
    blurb: "Open-plan living facing a wide west window, a full-width hall, a study and a utility room.",
    maker: "hand",
    featured: true,
  },
  {
    slug: "compact-two-bedroom",
    name: "Compact two-bedroom",
    blurb: "Living and kitchen in one room, two bedrooms and a bathroom off a short hall.",
    maker: "hand",
  },
  {
    slug: "studio-apartment",
    name: "Studio apartment",
    blurb: "One room to live, cook and sleep in, with a bathroom off the entrance hall.",
    maker: "clavis-local",
    brief: "studio apartment, 38 m2",
  },
  {
    slug: "one-bedroom-flat",
    name: "One-bedroom flat",
    blurb: "An open kitchen and living room, one double bedroom and a bathroom.",
    maker: "clavis-local",
    brief: "one bedroom flat with an open kitchen, 52 m2",
  },
  {
    slug: "family-house",
    name: "Family house with a study",
    blurb: "Three bedrooms, the main one with an en-suite, a separate dining room and a study.",
    maker: "clavis-local",
    brief: "3 bedroom house with 2 bathrooms and a study, 120 m2",
  },
  {
    slug: "four-bedroom-home",
    name: "Four-bedroom home",
    blurb: "A closed kitchen beside the dining room, a laundry, four bedrooms and two bathrooms.",
    maker: "clavis-local",
    brief: "4 bedroom home with separate kitchen and laundry, 150 m2",
  },
  {
    slug: "five-bedroom-villa",
    name: "Five-bedroom villa",
    blurb: "A long hall serving five bedrooms, an en-suite, generous living and a utility room.",
    maker: "clavis-local",
    brief: "5 bedroom villa 250 sqm",
  },
];

export const findTemplate = (slug: string | null | undefined): TemplateEntry | undefined => TEMPLATES.find((t) => t.slug === slug);

/** Build a template's design. Unknown slugs fall back to the compact two-bedroom. */
export function buildTemplate(slug: string): PlanModel {
  const t = findTemplate(slug);
  if (!t || t.slug === "compact-two-bedroom") return { ...templateModel(), name: t?.name ?? "Compact two-bedroom" };
  if (t.slug === "sunset-loft") return sunsetLoftModel();
  const req: AssistantRequest = { mode: "design", instruction: t.brief!, context: { design: {} } };
  let n = 0;
  const out = applyBatch(emptyModel(), localProposal(req, emptyModel()).operations, (p) => `${p}_${(n++).toString(36)}`);
  return { ...out.model, name: t.name };
}

export interface TemplateFacts {
  area: number;
  bedrooms: number;
  bathrooms: number;
  rooms: number;
  items: number;
  /** the outer size, metres */
  width: number;
  depth: number;
}

export function templateFacts(m: PlanModel): TemplateFacts {
  const a = analyzeModel(m);
  const env = a.metrics.envelope;
  return {
    area: Math.round(a.metrics.carpetArea),
    bedrooms: a.metrics.bedrooms,
    bathrooms: a.metrics.bathrooms,
    rooms: m.rooms.length,
    items: m.items.length,
    width: env ? Math.round(env.w * 10) / 10 : 0,
    depth: env ? Math.round(env.h * 10) / 10 : 0,
  };
}

export const makerText = (m: TemplateMaker) => (m === "hand" ? "Drawn by hand" : "Laid out by Clavis Local");
