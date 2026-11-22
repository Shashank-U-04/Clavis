/**
 * The template catalogue: the starting points offered by /new, /templates and the studio.
 *
 * Four homes, each a different kind (a three-floor house, a single-storey villa, an open-plan
 * home, a starter home), drawn by hand in src/model/templates.ts and kept free of findings and
 * walkable door to door (tests/catalogue.test.ts). A template may also be laid out by Clavis
 * Local from a one-line `brief`; none is at present.
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
    slug: "linden-heights",
    name: "Linden Heights",
    blurb: "A house on three floors: glazed living over a garden and an infinity pool, wide halls, five bedrooms, a home cinema, a sky lounge with a piano and two terraces.",
    maker: "hand",
    featured: true,
  },
  {
    slug: "cedar-villa",
    name: "Cedar Villa",
    blurb: "A 330 m² single-storey villa: glazed living towards the pool, dining, an island kitchen and a main suite with dressing room and en-suite.",
    maker: "hand",
  },
  {
    slug: "sunset-loft",
    name: "Sunset Loft",
    blurb: "An open-plan home: living and kitchen facing a wide west window, two bedrooms, a study and a utility room off a full-width hall.",
    maker: "hand",
    featured: true,
  },
  {
    slug: "compact-two-bedroom",
    name: "Compact two-bedroom",
    blurb: "A starter home: living and kitchen in one room, two bedrooms and a bathroom off a short hall.",
    maker: "hand",
  },
];

export const findTemplate = (slug: string | null | undefined): TemplateEntry | undefined => TEMPLATES.find((t) => t.slug === slug);

export const makerText = (m: TemplateMaker) => (m === "hand" ? "Drawn by hand" : "Laid out by Clavis Local");
