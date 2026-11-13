/**
 * The template catalogue: the starting points offered by /new, /templates and the studio.
 *
 * Two are drawn by hand (src/model/templates.ts). The rest are laid out by Clavis Local, the
 * rule-based engine, from a one-line brief — deterministic, so the same template always comes
 * out the same, and never the output of a language model. The UI says which is which.
 *
 * This file is only the list, so any page can show it cheaply; buildTemplate.ts builds the
 * designs and pulls in the engine.
 */

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

export const makerText = (m: TemplateMaker) => (m === "hand" ? "Drawn by hand" : "Laid out by Clavis Local");
